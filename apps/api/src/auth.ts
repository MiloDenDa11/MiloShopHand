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
import { TOTP } from "otpauth";
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
  unseal,
  reauth,
  audit,
} from "./core";
const email = z
  .string()
  .trim()
  .email("Email không hợp lệ.")
  .max(254)
  .transform((v) => v.toLowerCase());
const password = z
  .string()
  .min(15, "Mật khẩu cần ít nhất 15 ký tự.")
  .max(256, "Mật khẩu tối đa 256 ký tự.");
export const passwordHash = (p: string) =>
  argon2.hash(p, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
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
    const existing = await this.db.user.findUnique({
      where: { email: d.email },
    });
    if (!existing) {
      const ph = await passwordHash(d.password);
      await transaction(this.db, async (tx) => {
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
      z.object({ token: z.string().min(20) }).strict(),
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
  async otp(userId: string, code: string | undefined) {
    const m = await this.db.mFA.findUnique({ where: { userId } });
    if (!m || !code)
      fail(
        "MFA_REQUIRED",
        "Nhập mã xác thực hoặc mã khôi phục của Admin.",
        401,
      );
    const totp = new TOTP({
      secret: unseal(m.encryptedSecret),
      digits: 6,
      period: 30,
      algorithm: "SHA1",
    });
    const delta = totp.validate({ token: code, window: 1 });
    if (delta !== null) {
      const counter = Math.floor(Date.now() / 30000) + delta;
      const updated = await this.db.mFA.updateMany({
        where: { userId, lastCounter: { lt: counter } },
        data: { lastCounter: counter },
      });
      if (updated.count) return;
    }
    const recovery = hash(code);
    const result = await this.db
      .$executeRaw`UPDATE "MFA" SET "recoveryHashes"=array_remove("recoveryHashes",${recovery}) WHERE "userId"=${userId} AND ${recovery}=ANY("recoveryHashes")`;
    if (!result) fail("LOGIN_FAILED", "Thông tin đăng nhập không đúng.", 401);
  }
  async credentials(value: any) {
    const d = parse(
      z
        .object({
          email,
          password: z.string().max(256),
          otp: z.string().max(100).optional(),
        })
        .strict(),
      value,
    );
    const bucket = hash(d.email);
    const lock = await this.db.storeSetting.findUnique({
      where: { key: `login:${bucket}` },
    });
    const v = lock?.value as any;
    if (v?.until > Date.now())
      fail("LOGIN_THROTTLED", "Vui lòng chờ trước khi thử đăng nhập lại.", 429);
    const u = await this.db.user.findUnique({ where: { email: d.email } });
    const valid = u
      ? await argon2.verify(u.passwordHash, d.password).catch(() => false)
      : await argon2
          .verify(
            "$argon2id$v=19$m=65536,t=3,p=1$MDEyMzQ1Njc4OWFiY2RlZg$3baKmRwByNOnyEiRjTb3j5LG8p3PFG2ZYPXWY2V8ejI",
            d.password,
          )
          .catch(() => false);
    if (!u || !valid || u.disabled) {
      const count = (v?.count || 0) + 1;
      await this.db.storeSetting.upsert({
        where: { key: `login:${bucket}` },
        create: {
          key: `login:${bucket}`,
          value: {
            count,
            until:
              Date.now() + Math.min(600000, Math.max(0, count - 4) * 10000),
          },
        },
        update: {
          value: {
            count,
            until:
              Date.now() + Math.min(600000, Math.max(0, count - 4) * 10000),
          },
        },
      });
      fail("LOGIN_FAILED", "Thông tin đăng nhập không đúng.", 401);
    }
    if (u.role === "ADMIN") await this.otp(u.id, d.otp);
    await this.db.storeSetting.deleteMany({
      where: { key: `login:${bucket}` },
    });
    return u;
  }
  @Post("login") async login(
    @Body() body: unknown,
    @Req() r: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = await this.credentials(body);
    if (r.session)
      await this.db.session.deleteMany({ where: { id: r.session.id } });
    const raw = secret(),
      csrf = csrfToken();
    await this.db.session.create({
      data: {
        id: hash(raw),
        userId: u.id,
        csrf,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        agent: String(r.headers["user-agent"] || "Unknown").slice(0, 200),
      },
    });
    res.cookie("milo_sid", raw, { ...cookieOptions, maxAge: 7 * 86400000 });
    setCsrf(res, csrf);
    return {
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        verified: !!u.verifiedAt,
      },
      csrf,
    };
  }
  @UseGuards(AuthGuard) @Post("logout") async logout(
    @Req() r: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.session.deleteMany({ where: { id: r.session.id } });
    res.clearCookie("milo_sid", cookieOptions);
    return { message: "Đã đăng xuất." };
  }
  @UseGuards(AuthGuard) @Post("reauth") async reauthenticate(
    @Body() body: any,
    @Req() r: AppRequest,
  ) {
    await this.credentials({ ...body, email: r.actor!.email });
    await this.db.session.update({
      where: { id: r.session.id },
      data: { reauthenticatedAt: new Date() },
    });
    return { message: "Đã xác thực lại." };
  }
  @Post("forgot") async forgot(@Body() body: unknown) {
    const d = parse(z.object({ email }).strict(), body);
    const u = await this.db.user.findUnique({ where: { email: d.email } });
    if (u) {
      await transaction(this.db, async (tx) => {
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
      z.object({ token: z.string().min(20), password }).strict(),
      body,
    );
    await passwordPolicy(d.password);
    const ph = await passwordHash(d.password);
    await transaction(this.db, async (tx) => {
      const t = await tx.authToken.findUnique({
        where: { hash: hash(d.token) },
      });
      if (!t || t.purpose !== "RESET" || t.usedAt || t.expiresAt < new Date())
        fail("TOKEN_INVALID", "Liên kết không hợp lệ hoặc đã hết hạn.");
      await tx.authToken.updateMany({
        where: { userId: t.userId, purpose: "RESET", usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: t.userId },
        data: { passwordHash: ph },
      });
      await tx.session.deleteMany({ where: { userId: t.userId } });
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
    if (!(await argon2.verify(u.passwordHash, d.currentPassword)))
      fail("PASSWORD_INVALID", "Mật khẩu hiện tại không đúng.", 401);
    await passwordPolicy(d.password);
    const ph = await passwordHash(d.password);
    await transaction(this.db, async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { passwordHash: ph } });
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
  @Get("wishlist") wishlist(@Req() r: AppRequest) {
    return this.db.wishlist.findMany({
      where: { userId: r.actor!.id },
      include: { product: { include: { images: true, category: true } } },
    });
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
