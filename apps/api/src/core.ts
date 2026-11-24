import "reflect-metadata";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
function findRoot() {
  let dir = process.cwd();
  while (!existsSync(resolve(dir, "prisma/schema.prisma"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Run from the MILOSHOPHAND project");
    dir = parent;
  }
  return dir;
}
export const projectRoot = findRoot();
config({ path: resolve(process.cwd(), ".env"), quiet: true } as any);
config({ path: resolve(process.cwd(), "../../.env"), quiet: true } as any);
import {
  Injectable,
  OnModuleInit,
  CanActivate,
  ExecutionContext,
  Inject,
  HttpException,
  Catch,
  ExceptionFilter,
  ArgumentsHost,
} from "@nestjs/common";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { privilegedDatabaseRole } from "./security-policy";
import { z, ZodError, ZodTypeAny, output } from "zod";
z.config(z.locales.vi());
export const env = process.env;
export const production = env.NODE_ENV === "production";
export function fail(code: string, message: string, status = 400): never {
  throw new HttpException({ code, message }, status);
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const secret = () => randomBytes(32).toString("hex");
export const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export function parse<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
): output<S> {
  return schema.parse(data);
}
export const json = (value: any) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? Number(v) : v)),
  );
export function seal(value: string) {
  const iv = randomBytes(12);
  const c = createCipheriv(
    "aes-256-gcm",
    Buffer.from(env.MFA_ENCRYPTION_KEY!, "hex"),
    iv,
  );
  return Buffer.concat([
    iv,
    c.update(value, "utf8"),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64");
}
export function unseal(value: string) {
  const b = Buffer.from(value, "base64");
  const d = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(env.MFA_ENCRYPTION_KEY!, "hex"),
    b.subarray(0, 12),
  );
  d.setAuthTag(b.subarray(-16));
  return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString(
    "utf8",
  );
}
export type AppRequest = Request & {
  actor?: {
    id: string;
    email: string;
    name: string;
    role: string;
    verifiedAt: Date | null;
    disabled: boolean;
  };
  session?: any;
  accessError?: 'ACCESS_TOKEN_EXPIRED' | 'ACCESS_TOKEN_INVALID' | 'ACCESS_TOKEN_REVOKED';
  accessUntil?: number;
  requestId: string;
  securityLog?: (event: string, details?: { code?: string; scope?: string; accountHash?: string; count?: number }) => Promise<void>;
};
@Injectable()
export class Db extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    if (production) {
      const [role] = await this.$queryRaw<any[]>`SELECT r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolbypassrls,
        (pg_has_role(current_user,d.datdba,'MEMBER') OR has_database_privilege(current_user,d.oid,'CREATE')) AS "ownsDatabase",
        (pg_has_role(current_user,n.nspowner,'MEMBER') OR has_schema_privilege(current_user,n.oid,'CREATE')) AS "ownsSchema"
        FROM pg_roles r JOIN pg_database d ON d.datname=current_database()
        JOIN pg_namespace n ON n.nspname='public' WHERE r.rolname=current_user`;
      if (!role || privilegedDatabaseRole(role)) throw new Error('Production runtime must use a non-owner database role without administrative privileges');
    }
  }
}
export async function transaction<T>(
  db: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        maxWait: 10000,
        timeout: 15000,
      });
    } catch (e: any) {
      if (
        (e.code === "P2034" ||
          e.code === "P2002" ||
          (e.code === "P2010" && ["40001", "40P01"].includes(e.meta?.code))) &&
        i < 4
      )
        continue;
      throw e;
    }
  }
}
export async function audit(
  tx: any,
  actorId: string | undefined,
  action: string,
  entity: string,
  entityId: string,
  data: any = {},
) {
  return tx.auditLog.create({
    data: { actorId, action, entity, entityId, data: json(data) },
  });
}
export async function outbox(tx: any, kind: string, key: string, payload: any) {
  return tx.outboxEvent.upsert({
    where: { key },
    create: {
      kind,
      key,
      payload: json(
        kind === "EMAIL" && payload.text
          ? { ...payload, text: undefined, encryptedText: seal(payload.text) }
          : payload,
      ),
    },
    update: {},
  });
}
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const r = ctx.switchToHttp().getRequest<AppRequest>();
    if (!r.actor || r.actor.disabled)
      fail(r.accessError || "UNAUTHENTICATED", "Vui lòng đăng nhập.", 401);
    return true;
  }
}
@Injectable()
export class AdminGuard extends AuthGuard {
  canActivate(ctx: ExecutionContext) {
    super.canActivate(ctx);
    const r = ctx.switchToHttp().getRequest<AppRequest>();
    if (r.actor!.role !== "ADMIN")
      fail("FORBIDDEN", "Bạn không có quyền quản trị.", 403);
    return true;
  }
}
@Injectable()
export class SellerGuard extends AuthGuard {
  canActivate(ctx: ExecutionContext) {
    super.canActivate(ctx);
    const r = ctx.switchToHttp().getRequest<AppRequest>();
    if (!['ADMIN', 'SELLER'].includes(r.actor!.role)) fail('FORBIDDEN', 'Bạn không có quyền xử lý đơn hàng.', 403);
    return true;
  }
}
export function reauth(r: AppRequest) {
  const at = new Date(r.session?.reauthenticatedAt).getTime();
  if (!Number.isFinite(at) || at > Date.now() + 1000 || Date.now() - at > 10 * 60000)
    fail(
      "REAUTH_REQUIRED",
      "Vui lòng xác thực lại để thực hiện thao tác này.",
      403,
    );
}
@Catch()
export class Errors implements ExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp(),
      r = ctx.getRequest<AppRequest>(),
      res = ctx.getResponse<Response>();
    let status = 500,
      code = "INTERNAL_ERROR",
      message = "Có lỗi hệ thống. Vui lòng thử lại.",
      fieldErrors: any = undefined;
    if (e instanceof ZodError) {
      status = 422;
      code = "VALIDATION_ERROR";
      message = "Vui lòng kiểm tra thông tin đã nhập.";
      fieldErrors = Object.fromEntries(
        e.issues.map((i) => [i.path.join("."), i.message]),
      );
    } else if (e.type === "entity.parse.failed") {
      status = 400;
      code = "INVALID_JSON";
      message = "Nội dung JSON không hợp lệ.";
    } else if (e.type === "entity.too.large") {
      status = 413;
      code = "BODY_TOO_LARGE";
      message = "Nội dung gửi lên vượt kích thước cho phép.";
    } else if (
      e instanceof HttpException ||
      (typeof e.getStatus === "function" && typeof e.getResponse === "function")
    ) {
      status = e.getStatus();
      const b = e.getResponse() as any;
      code = b.code || "REQUEST_ERROR";
      message = b.code
        ? b.message
        : status === 400
          ? "Yêu cầu không hợp lệ. Vui lòng kiểm tra nội dung gửi lên."
          : status === 413
            ? "Tệp hoặc nội dung gửi lên vượt kích thước cho phép."
            : status === 404
              ? "Không tìm thấy đường dẫn yêu cầu."
              : status === 401
                ? "Vui lòng đăng nhập."
                : status === 403
                  ? "Bạn không có quyền thực hiện thao tác này."
                  : "Không thể thực hiện yêu cầu. Vui lòng thử lại.";
    } else if (e.code === "P2002") {
      status = 409;
      code = "CONFLICT";
      message = "Dữ liệu này đã tồn tại.";
    } else if (e.code === "P2025") {
      status = 404;
      code = "NOT_FOUND";
      message = "Không tìm thấy dữ liệu.";
    }
    if (status === 500)
      console.error(
        JSON.stringify({
          requestId: r.requestId,
          event: "request_failed",
          type: e.constructor?.name,
          code: e.code,
        }),
      );
    if (status === 429 && !res.getHeader('Retry-After')) res.setHeader('Retry-After', '60');
    res
      .status(status)
      .json({ code, message, fieldErrors, requestId: r.requestId });
  }
}
export function csrfToken() {
  const nonce = secret();
  return `${nonce}.${createHmac("sha256", env.SESSION_SECRET!).update(nonce).digest("hex")}`;
}
export const cookieOptions = {
  httpOnly: true,
  secure: production,
  sameSite: "lax" as const,
  path: "/",
};
export function setCsrf(res: Response, token: string) {
  res.cookie("milo_csrf", token, { ...cookieOptions, httpOnly: false });
}
export async function security(db: Db) {
  const { requestSecurity } = await import("./request-security");
  return requestSecurity(db);
}
