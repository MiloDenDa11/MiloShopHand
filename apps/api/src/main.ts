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
import { AttachmentsController } from "./attachments";
import { describeApi } from "./openapi";
import { ExchangeController, AdminExchangeController } from "./exchanges";
import { ShippingController } from "./shipping";
@Global()
@Module({
  providers: [Db, AuthGuard, AdminGuard, CatalogCache],
  exports: [Db, AuthGuard, AdminGuard, CatalogCache],
})
class CoreModule {}
@Module({
  controllers: [AuthController, MeController, RecommendationsController],
})
class AuthModule {}
@Module({ controllers: [CatalogController, ShippingController] })
class CatalogModule {}
@Global()
@Module({
  providers: [CommerceService],
  controllers: [
    CommerceController,
    WebhookController,
    ExchangeController,
    AttachmentsController,
  ],
  exports: [CommerceService],
})
class CommerceModule {}
@Module({ controllers: [AdminController, AdminExchangeController] })
class AdminModule {}
@Module({
  imports: [CoreModule, AuthModule, CatalogModule, CommerceModule, AdminModule],
})
class AppModule {}
async function bootstrap() {
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
  server.set("trust proxy", production ? 1 : false);
  server.set("json replacer", (_: string, v: any) =>
    typeof v === "bigint" ? Number(v) : v,
  );
  app.use(helmet({ contentSecurityPolicy: false }));
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
      "REST /api/v1. Session cookie + X-CSRF-Token cho mutation. Tiền VND nguyên; lỗi {code,message,fieldErrors,requestId}. Mock chỉ development.",
    )
    .setVersion("1.0.0")
    .addCookieAuth("milo_sid")
    .addApiKey({ type: "apiKey", in: "header", name: "X-CSRF-Token" }, "csrf")
    .build();
  const doc = describeApi(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup("api/docs", app, doc, {
    jsonDocumentUrl: "/api/openapi.json",
  });
  await app.listen(Number(env.API_PORT || 4000), "0.0.0.0");
  console.log(`API ready http://localhost:${env.API_PORT || 4000}/api/docs`);
  app.enableShutdownHooks();
}
bootstrap().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
