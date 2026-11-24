import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Req,
  Res,
  Param,
  UseGuards,
  Inject,
  Module,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBody, ApiCookieAuth } from "@nestjs/swagger";
import { z } from "zod";
import argon2 from "argon2";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Response } from "express";
import {
  Db,
  AppRequest,
  AuthGuard,
  AdminGuard,
  parse,
  fail,
  hash,
  secret,
  csrfToken,
  setCsrf,
  cookieOptions,
  transaction,
  outbox,
  env,
  production,
  reauth,
  audit,
} from "./core";
import { securityEvent, securityIdentity } from "./request-security";
import { accessToken, ACCESS_SECONDS, SESSION_MILLISECONDS } from './jwt';
import { verifySecondFactor } from './two-factor';
import type { Prisma, User } from '@prisma/client';
import { invalidateAccountChallenges } from './auth-lifecycle';

export async function createLoginSession(db: Db, userId: string, r: AppRequest, res: Response, options: { otp?: string; passwordHash?: string; authorize?: (tx: Prisma.TransactionClient, user: User) => Promise<void> } = {}) {
  const raw = secret(), csrf = csrfToken(), expiresAt = new Date(Date.now() + SESSION_MILLISECONDS);
  const user = await transaction(db, async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (current.disabled || options.passwordHash && current.passwordHash !== options.passwordHash) fail('LOGIN_FAILED', 'Thông tin đăng nhập không đúng.', 401);
    await options.authorize?.(tx, current);
    await verifySecondFactor(tx, current.id, options.otp);
    if (r.session) await tx.session.deleteMany({ where: { id: r.session.id } });
    await tx.session.create({ data: { id: `jwt:${hash(raw)}`, userId: current.id, csrf, expiresAt, agent: String(r.headers['user-agent'] || 'Unknown').slice(0, 200) } });
    return current;
  });
  r.actor = { id: user.id, email: user.email, name: user.name, role: user.role, verifiedAt: user.verifiedAt, disabled: user.disabled };
  await securityEvent(db, r, 'LOGIN_SUCCESS');
  setLoginCookies(res, raw, `jwt:${hash(raw)}`, user.id, expiresAt); setCsrf(res, csrf);
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role, verified: !!user.verifiedAt }, csrf, auth: { type: 'JWT', accessExpiresIn: ACCESS_SECONDS } };
}

export function setLoginCookies(res: Response, raw: string, sessionId: string, userId: string, expiresAt: Date) {
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie('milo_sid', raw, { ...cookieOptions, maxAge });
  // Keep the expired JWT cookie until the refresh session expires, so a missing
  // access cookie cannot silently downgrade a JWT session to legacy auth.
  res.cookie('milo_access', accessToken(userId, sessionId, env), { ...cookieOptions, maxAge });
}
export const email = z
  .string()
  .trim()
  .email("Email không hợp lệ.")
  .max(254)
  .transform((v) => v.toLowerCase());
export const password = z
  .string()
  .min(15, "Mật khẩu cần ít nhất 15 ký tự.")
  .max(256, "Mật khẩu tối đa 256 ký tự.");
let passwordWorkActive = 0;
async function passwordWork<T>(work: () => Promise<T>): Promise<T> {
  if (passwordWorkActive >= 4) fail('AUTH_BUSY', 'Hệ thống đang xử lý nhiều yêu cầu xác thực. Vui lòng thử lại.', 503);
  passwordWorkActive++;
  try { return await work(); } finally { passwordWorkActive--; }
}
export const passwordHash = (p: string) =>
  passwordWork(() => argon2.hash(p, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  }));
export async function passwordPolicy(p: string) {
  if (
    ["password", "123456", "qwerty", "matkhau", "miloshophand"].some(
      (v) => p.toLowerCase() === v || p.toLowerCase() === v.repeat(3),
    )
  )
    fail("WEAK_PASSWORD", "Mật khẩu quá phổ biến. Hãy chọn một cụm từ riêng.");
  if (env.SKIP_BREACH_CHECK === "true" && !production) return;
  const digest = (await import("node:crypto"))
    .createHash("sha1")
    .update(p)
    .digest("hex")
    .toUpperCase();
  try {
    const r = await fetch(
      `https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`,
      { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(5000) },
    );
    if (!r.ok) throw new Error();
    const matches = (await r.text())
      .split("\n")
      .some((x) => x.startsWith(digest.slice(5) + ":"));
    if (matches)
      fail(
        "BREACHED_PASSWORD",
        "Mật khẩu đã xuất hiện trong dữ liệu rò rỉ. Vui lòng chọn mật khẩu khác.",
      );
  } catch (e: any) {
    if (e.getStatus) throw e;
    if (production)
      fail(
        "PASSWORD_CHECK_UNAVAILABLE",
        "Chưa kiểm tra được độ an toàn mật khẩu. Vui lòng thử lại.",
        503,
      );
  }
}
export function phone(v: string) {
  const p = parsePhoneNumberFromString(v, "VN");
  if (!p?.isValid())
    fail("PHONE_INVALID", "Số điện thoại Việt Nam không hợp lệ.", 422);
  return p.number;
}
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(@Inject(Db) private db: Db) {}
  @Get("csrf") csrf(
    @Req() r: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = r.session?.csrf || csrfToken();
    setCsrf(res, token);
    return { token };
  }
  @ApiOperation({
    summary: "Đăng ký USER, gửi email xác minh (phản hồi không tiết lộ email)",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name", "email", "password"],
      properties: {
        name: { type: "string" },
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 15, maxLength: 256 },
        marketingConsent: { type: "boolean" },
      },
    },
  })
  @Post("register")
  async register(@Body() body: unknown) {
    const d = parse(
      z
        .object({
          name: z.string().trim().min(2).max(100),
          email,
          password,
          marketingConsent: z.boolean().default(false),
        })
        .strict(),
      body,
    );
    await passwordPolicy(d.password);
    const ph = await passwordHash(d.password);
    const existing = await this.db.user.findUnique({
      where: { email: d.email },
    });
    if (!existing) {
      await transaction(this.db, async (tx) => {
        if (await tx.user.findUnique({ where: { email: d.email }, select: { id: true } })) return;
        const u = await tx.user.create({
          data: {
            name: d.name,
            email: d.email,
            passwordHash: ph,
            marketingConsent: d.marketingConsent,
          },
        });
        const token = secret();
        await tx.authToken.create({
          data: {
            hash: hash(token),
            purpose: "VERIFY",
            userId: u.id,
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        await outbox(tx, "EMAIL", `verify:${u.id}`, {
          userId: u.id,
          to: u.email,
          subject: "Xác minh email MILOSHOPHAND",
          text: `Mở ${env.APP_URL}/xac-minh?token=${token} để xác minh email (24 giờ).`,
        });
      });
    }
    return {
      message:
        "Nếu thông tin hợp lệ, email xác minh sẽ được gửi. Vui lòng kiểm tra hộp thư.",
    };
  }
  @Post("verify") async verify(@Body() body: unknown) {
    const { token } = parse(
      z.object({ token: z.string().min(20).max(256) }).strict(),
      body,
    );
    await transaction(this.db, async (tx) => {
      const t = await tx.authToken.findUnique({ where: { hash: hash(token) } });
      if (!t || t.usedAt || t.expiresAt < new Date() || t.purpose !== "VERIFY")
        fail("TOKEN_INVALID", "Liên kết không hợp lệ hoặc đã hết hạn.");
      await tx.authToken.update({
        where: { id: t.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: t.userId },
        data: { verifiedAt: new Date() },
      });
    });
    return { message: "Email đã được xác minh. Bạn có thể đăng nhập." };
  }
  @UseGuards(AuthGuard)
  @Post('verify/resend') async resendVerification(@Req() r: AppRequest, @Body() body: unknown) {
    parse(z.object({}).strict(), body);
    const alreadyVerified = await transaction(this.db, async tx => {
      const bucket = `verify-resend:${hash(r.actor!.id)}`;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${bucket},0))`;
      const user = await tx.user.findUnique({ where: { id: r.actor!.id }, select: { id: true, email: true, verifiedAt: true, disabled: true } });
      if (!user || user.disabled) fail('UNAUTHENTICATED', 'Vui lòng đăng nhập.', 401);
      if (user.verifiedAt) return true;
      const saved = await tx.storeSetting.findUnique({ where: { key: bucket } });
      const previous = saved?.value as { count?: number; resetAt?: number; until?: number } | undefined;
      const now = Date.now();
      const count = previous?.resetAt && previous.resetAt > now ? previous.count || 0 : 0;
      if ((previous?.until || 0) > now || count >= 3)
        fail('VERIFY_RESEND_LIMIT', 'Vui lòng chờ ít nhất một phút giữa các lần gửi lại; tối đa 3 yêu cầu trong 15 phút.', 429);
      const token = secret();
      await tx.authToken.updateMany({ where: { userId: user.id, purpose: 'VERIFY', usedAt: null }, data: { usedAt: new Date(now) } });
      await tx.authToken.create({ data: { userId: user.id, purpose: 'VERIFY', hash: hash(token), expiresAt: new Date(now + 86400000) } });
      const value = { count: count + 1, until: now + 60000, resetAt: count ? previous!.resetAt! : now + 900000 };
      await tx.storeSetting.upsert({ where: { key: bucket }, create: { key: bucket, value }, update: { value } });
      await outbox(tx, 'EMAIL', `verify-resend:${user.id}:${hash(token).slice(0, 16)}`, {
        userId: user.id, to: user.email, subject: 'Xác minh email MILOSHOPHAND',
        text: `Mở ${env.APP_URL}/xac-minh?token=${token} để xác minh email (24 giờ). Liên kết mới thay thế các liên kết xác minh trước đó.`,
      });
      return false;
    });
    const local = !production && env.EMAIL_PROVIDER === 'file';
    return { alreadyVerified, delivery: local ? 'local' : 'email', message: alreadyVerified ? 'Email đã được xác minh. Hãy kiểm tra lại trạng thái tài khoản.' : local ? 'Yêu cầu xác minh đã được tạo. Môi trường phát triển đang lưu thư tại .local/mail, chưa gửi email ra ngoài. Mở liên kết trong thư cục bộ mới nhất để xác minh.' : 'Đã yêu cầu gửi lại email xác minh. Hãy kiểm tra hộp thư và thư rác; sử dụng liên kết mới nhất.' };
  }
  async credentials(value: any, request?: AppRequest) {
    const d = parse(
      z
        .object({
          email,
          password: z.string().max(256),
          // Optional until this account explicitly enables 2FA.
          otp: z.string().max(100).optional(),
        })
        .strict(),
      value,
    );
    const bucket = hash(d.email);
    const result = await this.db.$transaction(async tx => {
      // Serialize per account before reading its counter; failures must commit.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${bucket},0))`;
      const lock = await tx.storeSetting.findUnique({ where: { key: `login:${bucket}` } });
      const now = Date.now(), previous = lock?.value as any;
      if (previous?.until > now) return { user: null, throttled: true, count: previous.count as number };
      const user = await tx.user.findUnique({ where: { email: d.email } });
      const dummy = '$argon2id$v=19$m=65536,t=3,p=1$MDEyMzQ1Njc4OWFiY2RlZg$3baKmRwByNOnyEiRjTb3j5LG8p3PFG2ZYPXWY2V8ejI';
      const valid = await passwordWork(() => argon2.verify(user?.passwordHash || dummy, d.password).catch(() => false));
      if (!user || !valid || user.disabled) {
        const count = (previous?.resetAt > now ? Number(previous.count) || 0 : 0) + 1;
        const value = { count, until: now + Math.min(600000, Math.max(0, count - 4) * 10000), resetAt: now + 900000 };
        await tx.storeSetting.upsert({ where: { key: `login:${bucket}` }, create: { key: `login:${bucket}`, value }, update: { value } });
        return { user: null, throttled: false, count };
      }
      await tx.storeSetting.deleteMany({ where: { key: `login:${bucket}` } });
      return { user, throttled: false, count: 0 };
    }, { isolationLevel: 'ReadCommitted', timeout: 15000, maxWait: 10000 });
    if (!result.user) {
      await securityEvent(this.db, request, result.throttled ? 'LOGIN_THROTTLED' : 'LOGIN_FAILURE', { accountHash: securityIdentity(d.email), count: result.count });
      if (result.throttled) fail('LOGIN_THROTTLED', 'Vui lòng chờ trước khi thử đăng nhập lại.', 429);
      fail('LOGIN_FAILED', 'Thông tin đăng nhập không đúng.', 401);
    }
    return result.user;
  }
  @Post("login") async login(
    @Body() body: unknown,
    @Req() r: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const checked = await this.credentials(body, r);
    return createLoginSession(this.db, checked.id, r, res, { passwordHash: checked.passwordHash, otp: (body as { otp?: string }).otp });
  }
  @UseGuards(AuthGuard) @Post('refresh') async refresh(
    @Req() r: AppRequest, @Res({ passthrough: true }) res: Response, @Body() body: unknown,
  ) {
    parse(z.object({}).strict(), body);
    const raw = secret(), id = `jwt:${hash(raw)}`;
    const session = await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "Session" WHERE id=${r.session.id} FOR UPDATE`;
      const current = await tx.session.findUnique({ where: { id: r.session.id }, include: { user: true } });
      if (!current || current.user.disabled || current.expiresAt <= new Date() || current.lastSeenAt.getTime() <= Date.now() - 30 * 60000)
        fail('UNAUTHENTICATED', 'Phiên đăng nhập đã hết hạn.', 401);
      await tx.session.delete({ where: { id: current.id } });
      return tx.session.create({ data: { id, userId: current.userId, csrf: current.csrf, expiresAt: current.expiresAt, agent: current.agent, createdAt: current.createdAt, reauthenticatedAt: current.reauthenticatedAt } });
    });
    setLoginCookies(res, raw, id, session.userId, session.expiresAt);
    setCsrf(res, session.csrf);
    return { message: 'Đã làm mới phiên đăng nhập.', accessExpiresIn: ACCESS_SECONDS };
  }
  @UseGuards(AuthGuard) @Post("logout") async logout(
    @Req() r: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.session.deleteMany({ where: { id: r.session.id } });
    res.clearCookie("milo_sid", cookieOptions);
    res.clearCookie('milo_access', cookieOptions);
    return { message: "Đã đăng xuất." };
  }
  @UseGuards(AuthGuard) @Post("reauth") async reauthenticate(
    @Body() body: any,
    @Req() r: AppRequest,
  ) {
    const checked = await this.credentials({ ...body, email: r.actor!.email }, r);
    await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${checked.id} FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: checked.id } });
      if (current.disabled || current.passwordHash !== checked.passwordHash) fail('LOGIN_FAILED', 'Thông tin đăng nhập không đúng.', 401);
      await verifySecondFactor(tx, current.id, body.otp);
      await tx.session.update({ where: { id: r.session.id }, data: { reauthenticatedAt: new Date() } });
    });
    return { message: "Đã xác thực lại." };
  }
  @Post("forgot") async forgot(@Body() body: unknown) {
    const d = parse(z.object({ email }).strict(), body);
    const u = await this.db.user.findUnique({ where: { email: d.email } });
    if (u && !u.disabled) {
      await transaction(this.db, async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id} FOR UPDATE`;
        await tx.passwordRecovery.updateMany({ where: { userId: u.id, consumedAt: null }, data: { consumedAt: new Date() } });
        await tx.authToken.updateMany({
          where: { userId: u.id, purpose: "RESET", usedAt: null },
          data: { usedAt: new Date() },
        });
        const token = secret();
        await tx.authToken.create({
          data: {
            userId: u.id,
            purpose: "RESET",
            hash: hash(token),
            expiresAt: new Date(Date.now() + 1800000),
          },
        });
        await outbox(tx, "EMAIL", `reset:${hash(token)}`, {
          userId: u.id,
          to: u.email,
          subject: "Đặt lại mật khẩu",
          text: `Mở ${env.APP_URL}/dat-lai-mat-khau?token=${token} (30 phút).`,
        });
      });
    }
    return {
      message: "Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi.",
    };
  }
  @Post("reset") async reset(@Body() body: unknown) {
    const d = parse(
      z.object({ token: z.string().min(20).max(256), password }).strict(),
      body,
    );
    const candidate = await this.db.authToken.findUnique({ where: { hash: hash(d.token) } });
    if (!candidate || candidate.purpose !== 'RESET' || candidate.usedAt || candidate.expiresAt < new Date()) fail('TOKEN_INVALID', 'Liên kết không hợp lệ hoặc đã hết hạn.');
    await passwordPolicy(d.password);
    const ph = await passwordHash(d.password);
    await transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${candidate.userId} FOR UPDATE`;
      const t = await tx.authToken.findUnique({
        where: { hash: hash(d.token) },
      });
      if (!t || t.purpose !== "RESET" || t.usedAt || t.expiresAt < new Date())
        fail("TOKEN_INVALID", "Liên kết không hợp lệ hoặc đã hết hạn.");
      const current = await tx.user.findUnique({ where: { id: t.userId } });
      if (!current || current.disabled) fail('TOKEN_INVALID', 'Liên kết không hợp lệ hoặc đã hết hạn.');
      await tx.authToken.updateMany({
        where: { userId: t.userId, purpose: "RESET", usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: t.userId },
        data: { passwordHash: ph },
      });
      await tx.session.deleteMany({ where: { userId: t.userId } });
      await invalidateAccountChallenges(tx, t.userId);
      await tx.externalIdentity.updateMany({ where: { userId: t.userId }, data: { passwordEnabled: true } });
      await audit(tx, t.userId, 'PASSWORD_RESET', 'User', t.userId);
    });
    return { message: "Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập." };
  }
  @UseGuards(AuthGuard) @Post("password") async changePassword(
    @Body() body: unknown,
    @Req() r: AppRequest,
  ) {
    reauth(r);
    const d = parse(
      z.object({ currentPassword: z.string().max(256), password }).strict(),
      body,
    );
    const u = await this.db.user.findUniqueOrThrow({
      where: { id: r.actor!.id },
    });
    if (!(await passwordWork(() => argon2.verify(u.passwordHash, d.currentPassword))))
      fail("PASSWORD_INVALID", "Mật khẩu hiện tại không đúng.", 401);
    await passwordPolicy(d.password);
    const ph = await passwordHash(d.password);
    await transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id} FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: u.id } });
      if (current.disabled || current.passwordHash !== u.passwordHash) fail('PASSWORD_CHANGED', 'Thông tin tài khoản vừa thay đổi. Vui lòng đăng nhập lại.', 409);
      await tx.user.update({ where: { id: u.id }, data: { passwordHash: ph } });
      await invalidateAccountChallenges(tx, u.id);
      await tx.externalIdentity.updateMany({ where: { userId: u.id }, data: { passwordEnabled: true } });
      await tx.session.deleteMany({
        where: { userId: u.id, id: { not: r.session.id } },
      });
      await audit(tx, u.id, "PASSWORD_CHANGED", "User", u.id);
    });
    return { message: "Đã đổi mật khẩu và thu hồi các phiên khác." };
  }
}
@ApiTags("me")
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller("me")
export class MeController {
  constructor(@Inject(Db) private db: Db) {}
  @Get() async me(@Req() r: AppRequest) {
    return this.db.user.findUnique({
      where: { id: r.actor!.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
        verifiedAt: true,
        preferences: true,
        marketingConsent: true,
      },
    });
  }
  @Patch() async update(@Body() body: unknown, @Req() r: AppRequest) {
    const d = parse(
      z
        .object({
          name: z.string().trim().min(2).max(100),
          phone: z.string().optional(),
          preferences: z.array(z.string().max(40)).max(10).default([]),
          marketingConsent: z.boolean().default(false),
        })
        .strict(),
      body,
    );
    await this.db.user.update({
      where: { id: r.actor!.id },
      data: { ...d, phone: d.phone ? phone(d.phone) : null },
    });
    return { message: "Đã cập nhật hồ sơ." };
  }
  @Get("sessions") sessions(@Req() r: AppRequest) {
    return this.db.session.findMany({
      where: { userId: r.actor!.id },
      select: {
        id: true,
        agent: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });
  }
  @Delete("sessions/:id") async revoke(
    @Param("id") id: string,
    @Req() r: AppRequest,
  ) {
    await this.db.session.deleteMany({ where: { id, userId: r.actor!.id } });
    return { message: "Đã thu hồi phiên." };
  }
  @Get("notifications") notifications(@Req() r: AppRequest) {
    return this.db.notification.findMany({
      where: { userId: r.actor!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
  @Get("wishlist") async wishlist(@Req() r: AppRequest) {
    const rows = await this.db.wishlist.findMany({
      where: { userId: r.actor!.id },
      select: { productId: true, product: { select: { id: true, slug: true, name: true, description: true, price: true, originalPrice: true, material: true, fit: true, care: true, featured: true, createdAt: true, design: true, images: true, category: true } } },
    });
    return rows;
  }
  @Post("wishlist/:id") async wish(
    @Param("id") productId: string,
    @Req() r: AppRequest,
  ) {
    return this.db.wishlist.upsert({
      where: { userId_productId: { userId: r.actor!.id, productId } },
      create: { userId: r.actor!.id, productId },
      update: {},
    });
  }
  @Delete("wishlist/:id") async unwish(
    @Param("id") productId: string,
    @Req() r: AppRequest,
  ) {
    await this.db.wishlist.deleteMany({
      where: { userId: r.actor!.id, productId },
    });
    return { message: "Đã bỏ yêu thích." };
  }
}
