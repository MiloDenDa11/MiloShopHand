import { Controller, Get, Post, Body, Inject } from '@nestjs/common';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Db, env, parse, fail, transaction, audit, outbox, secret, hash, safeEqual } from './core';
import { email, password, passwordHash, passwordPolicy } from './auth';
import { invalidateAccountChallenges } from './auth-lifecycle';
import { recoveryDelivery } from './mail-policy';
export const recoveryEmailHash = (email: string, key: string) => createHmac('sha256', key).update(`recovery-email:v1:${email.trim().toLowerCase()}`).digest('hex');
export const recoveryCodeHash = (id: string, code: string, key: string) => createHmac('sha256', key).update(`recovery-code:v1:${id}:${code}`).digest('hex');
const resetSchema = z.object({ challengeId: z.string().uuid(), resetToken: z.string().regex(/^[a-f0-9]{64}$/), password }).strict();
export class PasswordRecoveryService {
  constructor(private db: Db, private settings: Record<string, string | undefined> = env, private now: () => Date = () => new Date()) {}
  config() { return { delivery: recoveryDelivery(this.settings), expiresIn: 600, resendAfter: 60 }; }
  async request(rawEmail: string) {
    const address = parse(email, rawEmail), delivery = recoveryDelivery(this.settings);
    if (delivery === 'unavailable') fail('EMAIL_UNAVAILABLE', 'Chức năng gửi mã chưa được cấu hình. Vui lòng quay lại sau.', 503);
    const now = this.now(), emailHash = recoveryEmailHash(address, this.settings.SESSION_SECRET!), challengeId = randomUUID();
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`recovery:${emailHash}`},0))`;
      const recent = await tx.passwordRecovery.findMany({ where: { emailHash, createdAt: { gte: new Date(now.getTime() - 15 * 60000) } }, select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 3 });
      if (recent.length >= 3 || recent[0] && now.getTime() - recent[0].createdAt.getTime() < 60000) fail('RECOVERY_SEND_LIMIT', 'Chờ ít nhất 60 giây trước khi gửi lại; tối đa 3 mã trong 15 phút.', 429);
      const user = await tx.user.findUnique({ where: { email: address } });
      if (user) await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      await tx.passwordRecovery.updateMany({ where: { emailHash, consumedAt: null }, data: { consumedAt: now } });
      const active = user && !user.disabled;
      if (active) await tx.authToken.updateMany({ where: { userId: user.id, purpose: 'RESET', usedAt: null }, data: { usedAt: now } });
      await tx.passwordRecovery.create({ data: { id: challengeId, emailHash, userId: active ? user.id : null, codeHash: recoveryCodeHash(challengeId, code, this.settings.SESSION_SECRET!), createdAt: now, expiresAt: new Date(now.getTime() + 10 * 60000) } });
      if (active) await outbox(tx, 'EMAIL', `recovery:${challengeId}`, { userId: user.id, recoveryChallengeId: challengeId, to: user.email, subject: 'Mã khôi phục tài khoản MiloShopHand', text: `Mã xác nhận của bạn: ${code}\nMã có hiệu lực 10 phút và tối đa 5 lần nhập. Mã mới sẽ thay thế mã trước đó. Không chia sẻ mã này. Nếu bạn không yêu cầu khôi phục, hãy bỏ qua thư.` });
    });
    return { challengeId, expiresIn: 600, resendAfter: 60, delivery, message: delivery === 'local' ? 'Môi trường phát triển đang lưu thư tại .local/mail, chưa gửi mã đến Gmail thật.' : 'Nếu địa chỉ hợp lệ, yêu cầu gửi mã đã được tiếp nhận. Hãy kiểm tra hộp thư và thư rác.' };
  }
  async verify(challengeId: string, code: string) {
    const now = this.now(), resetToken = secret();
    const result = await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "PasswordRecovery" WHERE id=${challengeId} FOR UPDATE`;
      const row = await tx.passwordRecovery.findUnique({ where: { id: challengeId } });
      if (!row || row.consumedAt || row.verifiedAt || row.expiresAt <= now || row.attempts >= 5) return null;
      const actor = row.userId ? await tx.user.findUnique({ where: { id: row.userId } }) : null;
      const valid = safeEqual(row.codeHash, recoveryCodeHash(challengeId, code, this.settings.SESSION_SECRET!)) && actor && !actor.disabled && recoveryEmailHash(actor.email, this.settings.SESSION_SECRET!) === row.emailHash;
      if (!valid) { await tx.passwordRecovery.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, ...(row.attempts === 4 ? { consumedAt: now } : {}) } }); return null; }
      const resetExpiresAt = new Date(Math.min(row.expiresAt.getTime(), now.getTime() + 5 * 60000));
      await tx.passwordRecovery.update({ where: { id: row.id }, data: { verifiedAt: now, resetTokenHash: hash(resetToken), resetExpiresAt } });
      return resetExpiresAt;
    });
    if (!result) fail('RECOVERY_CODE_INVALID', 'Mã không đúng, hết hạn hoặc đã dùng. Bạn có thể yêu cầu mã mới.', 400);
    return { resetToken, expiresIn: Math.max(0, Math.floor((result.getTime() - now.getTime()) / 1000)) };
  }
  async reset(input: z.infer<typeof resetSchema>) {
    const now = this.now(), candidate = await this.db.passwordRecovery.findUnique({ where: { id: input.challengeId } });
    const valid = (row: typeof candidate) => !!row?.userId && !!row.verifiedAt && !row.consumedAt && !!row.resetExpiresAt && row.resetExpiresAt > this.now() && row.expiresAt > this.now() && row.resetTokenHash === hash(input.resetToken);
    if (!valid(candidate)) fail('RECOVERY_TOKEN_INVALID', 'Lượt khôi phục không hợp lệ hoặc đã hết hạn. Hãy gửi mã mới.', 400);
    await passwordPolicy(input.password); const ph = await passwordHash(input.password);
    await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${candidate!.userId!} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "PasswordRecovery" WHERE id=${input.challengeId} FOR UPDATE`;
      const row = await tx.passwordRecovery.findUnique({ where: { id: input.challengeId } });
      const user = row?.userId ? await tx.user.findUnique({ where: { id: row.userId } }) : null;
      if (!valid(row) || !user || user.disabled || recoveryEmailHash(user.email, this.settings.SESSION_SECRET!) !== row!.emailHash) fail('RECOVERY_TOKEN_INVALID', 'Lượt khôi phục không hợp lệ hoặc đã hết hạn. Hãy gửi mã mới.', 400);
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: ph } });
      await tx.externalIdentity.updateMany({ where: { userId: user.id }, data: { passwordEnabled: true } });
      await invalidateAccountChallenges(tx, user.id);
      await tx.session.deleteMany({ where: { userId: user.id } });
      await audit(tx, user.id, 'PASSWORD_RESET_CODE', 'User', user.id);
    });
    return { message: 'Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập. Nếu đã bật 2FA, bạn vẫn cần mã xác thực khi đăng nhập.' };
  }
}
@Controller('auth/recovery')
export class PasswordRecoveryController {
  private recovery: PasswordRecoveryService;
  constructor(@Inject(Db) db: Db) { this.recovery = new PasswordRecoveryService(db); }
  @Get('config') config() { return this.recovery.config(); }
  @Post('request') request(@Body() body: unknown) { const input = parse(z.object({ email }).strict(), body); return this.recovery.request(input.email); }
  @Post('verify') verify(@Body() body: unknown) { const input = parse(z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict(), body); return this.recovery.verify(input.challengeId, input.code); }
  @Post('reset') reset(@Body() body: unknown) { return this.recovery.reset(parse(resetSchema, body)); }
}
