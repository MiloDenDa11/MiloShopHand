import { Controller, Get, Post, Delete, Body, Req, UseGuards, Inject } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TOTP, Secret } from 'otpauth';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Db, AppRequest, AuthGuard, reauth, parse, fail, hash, seal, unseal, safeEqual, transaction, audit } from './core';
export const authenticator = (secret: string, email = '') => new TOTP({ issuer: 'MiloShopHand', label: email, algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secret) });
export function totpCounter(secret: string, code: string, previous: number, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = authenticator(secret).validate({ token: code, timestamp: now, window: 1 });
  const counter = Math.floor(now / 30000) + (delta ?? 0);
  return delta !== null && counter > previous ? counter : null;
}
export const recoveryHash = (code: string) => hash(code.trim().toLowerCase().replace(/-/g, ''));
// Call while holding the User row lock, the same lock used to enable/disable MFA.
export async function verifySecondFactor(tx: Prisma.TransactionClient, userId: string, code?: string) {
  const mfa = await tx.mFA.findUnique({ where: { userId } });
  if (!mfa?.enabledAt) return;
  if (!code?.trim()) fail('MFA_REQUIRED', 'Nhập mã từ ứng dụng xác thực hoặc mã khôi phục của bạn.', 401);
  const candidate = recoveryHash(code);
  const recovered = mfa.recoveryHashes.find(value => safeEqual(value, candidate));
  if (recovered) {
    await tx.mFA.update({ where: { userId }, data: { recoveryHashes: mfa.recoveryHashes.filter(value => value !== recovered) } });
    return;
  }
  const counter = totpCounter(unseal(mfa.encryptedSecret), code.trim(), mfa.lastCounter);
  if (counter === null) fail('MFA_INVALID', 'Mã xác thực sai, hết hạn hoặc đã dùng. Vui lòng chờ mã mới.', 401);
  await tx.mFA.update({ where: { userId }, data: { lastCounter: counter } });
}
@UseGuards(AuthGuard)
@Controller('auth/mfa')
export class TwoFactorController {
  constructor(@Inject(Db) private db: Db) {}
  @Get('status') async status(@Req() r: AppRequest) {
    const mfa = await this.db.mFA.findUnique({ where: { userId: r.actor!.id } });
    return { enabled: !!mfa?.enabledAt, available: ['ADMIN', 'SELLER'].includes(r.actor!.role) || !!mfa?.enabledAt, recoveryRemaining: mfa?.enabledAt ? mfa.recoveryHashes.length : 0 };
  }
  @Post('setup') async setup(@Req() r: AppRequest, @Body() body: unknown) {
    reauth(r); parse(z.object({}).strict(), body);
    const secret = new Secret({ size: 20 }).base32, setupId = randomUUID();
    await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.actor!.id} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: r.actor!.id } });
      if (user.disabled || !['ADMIN', 'SELLER'].includes(user.role)) fail('FORBIDDEN', '2FA tùy chọn hiện dành cho Admin và Người bán.', 403);
      if ((await tx.mFA.findUnique({ where: { userId: user.id } }))?.enabledAt) fail('MFA_ENABLED', '2FA đã bật. Cần xác minh và tắt trước khi thiết lập lại.', 409);
      const value = { setupId, encryptedSecret: seal(secret), expiresAt: Date.now() + 10 * 60000 };
      await tx.storeSetting.upsert({ where: { key: `mfa-setup:${user.id}` }, create: { key: `mfa-setup:${user.id}`, value }, update: { value } });
    });
    return { setupId, secret, uri: authenticator(secret, r.actor!.email).toString(), expiresIn: 600 };
  }
  @Post('enable') async enable(@Req() r: AppRequest, @Body() body: unknown) {
    reauth(r);
    const input = parse(z.object({ setupId: z.string().uuid(), otp: z.string().regex(/^\d{6}$/) }).strict(), body);
    const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex').match(/.{8}/g)!.join('-'));
    await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.actor!.id} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: r.actor!.id } });
      if (user.disabled || !['ADMIN', 'SELLER'].includes(user.role)) fail('FORBIDDEN', 'Bạn không có quyền bật 2FA tại đây.', 403);
      const row = await tx.storeSetting.findUnique({ where: { key: `mfa-setup:${user.id}` } });
      const pending = row?.value as { setupId: string; encryptedSecret: string; expiresAt: number } | undefined;
      if (!pending || pending.setupId !== input.setupId || pending.expiresAt <= Date.now()) fail('MFA_SETUP_EXPIRED', 'Lượt thiết lập hết hạn. Hãy tạo QR mới.', 409);
      if ((await tx.mFA.findUnique({ where: { userId: user.id } }))?.enabledAt) fail('MFA_ENABLED', '2FA đã bật.', 409);
      const counter = totpCounter(unseal(pending.encryptedSecret), input.otp, 0);
      if (counter === null) fail('MFA_INVALID', 'Mã xác thực không đúng. Kiểm tra lại ứng dụng và thời gian thiết bị.', 401);
      const data = { encryptedSecret: pending.encryptedSecret, recoveryHashes: recoveryCodes.map(recoveryHash), lastCounter: counter, enabledAt: new Date() };
      await tx.mFA.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
      await tx.storeSetting.delete({ where: { key: `mfa-setup:${user.id}` } });
      await tx.session.deleteMany({ where: { userId: user.id, id: { not: r.session.id } } });
      await tx.session.update({ where: { id: r.session.id }, data: { reauthenticatedAt: new Date() } });
      await audit(tx, user.id, 'MFA_ENABLED', 'User', user.id);
    });
    return { enabled: true, recoveryCodes };
  }
  @Delete() async disable(@Req() r: AppRequest, @Body() body: unknown) {
    reauth(r); const { otp } = parse(z.object({ otp: z.string().trim().min(6).max(100) }).strict(), body);
    await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.actor!.id} FOR UPDATE`;
      await verifySecondFactor(tx, r.actor!.id, otp);
      await tx.mFA.deleteMany({ where: { userId: r.actor!.id } });
      await tx.storeSetting.deleteMany({ where: { key: `mfa-setup:${r.actor!.id}` } });
      await tx.session.deleteMany({ where: { userId: r.actor!.id, id: { not: r.session.id } } });
      await audit(tx, r.actor!.id, 'MFA_DISABLED', 'User', r.actor!.id);
    });
    return { enabled: false };
  }
}
