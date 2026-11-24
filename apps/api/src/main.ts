import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Module, Global } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import express from "express";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { CatalogCache } from "./cache";
import {
  projectRoot,
  Db,
  Errors,
  security,
  env,
  production,
  AuthGuard,
  AdminGuard,
  SellerGuard,
} from "./core";
import { AuthController, MeController } from "./auth";
import { RecommendationsController } from "./recommendations";
import { CatalogController } from "./catalog";
import {
  CommerceService,
  CommerceController,
  WebhookController,
} from "./commerce";
import { AdminController } from "./admin";
import { InventoryController } from "./inventory";
import { AttachmentsController } from "./attachments";
import { describeApi } from "./openapi";
import { ExchangeController, AdminExchangeController } from "./exchanges";
import { ShippingController } from "./shipping";
import { TryOnController } from "./try-on";
import { AvatarController } from './avatar';
import { SellerController } from './seller';
import { PackingController } from './packing';
import { TwoFactorController } from './two-factor';
import { GoogleAuthController } from './google-auth';
import { PasswordRecoveryController } from './password-recovery';
import { RealtimeHub, RealtimeController } from './realtime';
import { GuestCheckoutController } from './guest-checkout';
import { ExperienceController, ExperienceAdminController } from './experience';
import { SupportController, SellerSupportController } from './customer-support';
import { PurchasingController } from './purchasing';
import { OperationsController } from './operations-health';
import { proxyTrust, validateRuntimeConfig } from "./security-policy";
@Global()
@Module({
  providers: [Db, AuthGuard, AdminGuard, SellerGuard, CatalogCache, RealtimeHub],
  exports: [Db, AuthGuard, AdminGuard, SellerGuard, CatalogCache, RealtimeHub],
})
class CoreModule {}
@Module({
  controllers: [AuthController, MeController, RecommendationsController, AvatarController, TwoFactorController, GoogleAuthController, PasswordRecoveryController, RealtimeController],
})
class AuthModule {}
@Module({ controllers: [CatalogController, ShippingController, TryOnController, ExperienceController, SupportController] })
class CatalogModule {}
@Global()
@Module({
  providers: [CommerceService],
  controllers: [
    CommerceController,
    WebhookController,
    ExchangeController,
    AttachmentsController,
    GuestCheckoutController,
  ],
  exports: [CommerceService],
})
class CommerceModule {}
@Module({ controllers: [AdminController, AdminExchangeController, InventoryController, ExperienceAdminController, PurchasingController, OperationsController] })
class AdminModule {}
@Module({ controllers: [SellerController, PackingController, SellerSupportController] })
class SellerModule {}
@Module({
  imports: [CoreModule, AuthModule, CatalogModule, CommerceModule, AdminModule, SellerModule],
})
class AppModule {}
async function bootstrap() {
  validateRuntimeConfig(env);
  for (const key of ["SESSION_SECRET", "MFA_ENCRYPTION_KEY"])
    if (!env[key] || env[key]!.length < 64)
      throw new Error(`Configure ${key} using npm run setup`);
  if (production) {
    if (env.PAYMENT_PROVIDER === "mock" || env.SHIPPING_PROVIDER === "mock")
      throw new Error("Mock adapters forbidden in production");
    if (!env.APP_URL?.startsWith("https://"))
      throw new Error("HTTPS APP_URL required");
  }
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
    bodyParser: false,
  });
  app.setGlobalPrefix("api/v1");
  const server = app.getHttpAdapter().getInstance();
  server.set("trust proxy", proxyTrust(env.TRUST_PROXY));
  server.disable('x-powered-by');
  server.set("json replacer", (_: string, v: any) =>
    typeof v === "bigint" ? Number(v) : v,
  );
  app.use(helmet({ contentSecurityPolicy: false, frameguard: { action: 'deny' }, strictTransportSecurity: production ? { maxAge: 31536000 } : false, referrerPolicy: { policy: 'same-origin' } }));
  app.use('/api/v1', (_req: any, res: any, next: any) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });
  app.use((req: any, res: any, next: any) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-ID", req.requestId);
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  app.use(cookieParser());
  app.use(
    "/uploads",
    express.static(resolve(projectRoot, env.UPLOAD_DIR || "uploads"), {
      dotfiles: "deny",
      index: false,
      redirect: false,
      setHeaders: (res) => {
        res.setHeader("Content-Security-Policy", "default-src 'none'");
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );
  app.enableCors({ origin: env.APP_URL, credentials: true });
  app.use(await security(app.get(Db)));
  app.useGlobalFilters(new Errors());
  const config = new DocumentBuilder()
    .setTitle("MILOSHOPHAND API")
    .setDescription(
      "REST /api/v1. JWT HttpOnly cookie (15 phút) + refresh cookie xoay vòng; X-CSRF-Token và Origin cho mutation. Phiên cũ còn hiệu lực được giữ tương thích. Tiền VND nguyên; lỗi {code,message,fieldErrors,requestId}. Mock chỉ development.",
    )
    .setVersion("1.0.0")
    .addCookieAuth("milo_sid")
    .addApiKey({ type: "apiKey", in: "header", name: "X-CSRF-Token" }, "csrf")
    .build();
  const doc = describeApi(SwaggerModule.createDocument(app, config));
  if (!production || env.ENABLE_API_DOCS === 'true') {
    if (production) app.use(['/api/docs', '/api/openapi.json'], (req: any, res: any, next: any) => req.actor?.role === 'ADMIN' ? next() : res.status(404).json({ code: 'NOT_FOUND', message: 'Không tìm thấy đường dẫn yêu cầu.', requestId: req.requestId }));
    SwaggerModule.setup("api/docs", app, doc, { jsonDocumentUrl: "/api/openapi.json" });
  }
  const http = await app.listen(Number(env.API_PORT || 4000), env.API_HOST || '127.0.0.1');
  http.requestTimeout = 30000; http.headersTimeout = 10000; http.keepAliveTimeout = 5000; http.maxHeadersCount = 100; http.maxRequestsPerSocket = 1000;
  console.log(`API ready http://localhost:${env.API_PORT || 4000}/api/docs`);
  app.enableShutdownHooks();
}
bootstrap().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
