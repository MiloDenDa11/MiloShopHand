import { OpenAPIObject } from "@nestjs/swagger";
import { z } from "zod";
import {
  checkoutSchema,
  addressSchema,
  cartSchema,
} from "../../../packages/shared/src";
export function describeApi(doc: OpenAPIObject) {
  doc.components ??= {};
  doc.components.schemas ??= {};
  const schemas = doc.components.schemas;
  schemas.Error = {
    type: "object",
    required: ["code", "message", "requestId"],
    properties: {
      code: { type: "string", example: "OUT_OF_STOCK" },
      message: { type: "string", example: "Sản phẩm vừa hết hàng." },
      fieldErrors: { type: "object", additionalProperties: { type: "string" } },
      requestId: { type: "string" },
    },
  };
  const definitions: any = {
    Checkout: checkoutSchema,
    Address: addressSchema,
    Cart: cartSchema,
    Login: z.object({
      email: z.email(),
      password: z.string().max(256),
      otp: z.string().optional(),
    }),
    Register: z
      .object({
        name: z.string().min(2),
        email: z.email(),
        password: z.string().min(15).max(256),
        marketingConsent: z.boolean().default(false),
      })
      .strict(),
    Forgot: z.object({ email: z.email() }),
    Verify: z.object({ token: z.string().min(20) }),
    Reset: z.object({
      token: z.string().min(20),
      password: z.string().min(15).max(256),
    }),
  };
  for (const [name, schema] of Object.entries(definitions))
    schemas[name] = z.toJSONSchema(schema as any, { io: "input" }) as any;
  const bodies: Record<string, string> = {
    "/api/v1/checkout": "Checkout",
    "/api/v1/checkout/quote": "Checkout",
    "/api/v1/addresses": "Address",
    "/api/v1/cart": "Cart",
    "/api/v1/cart/merge": "Cart",
    "/api/v1/auth/login": "Login",
    "/api/v1/auth/register": "Register",
    "/api/v1/auth/forgot": "Forgot",
    "/api/v1/auth/verify": "Verify",
    "/api/v1/auth/reset": "Reset",
  };
  for (const [path, operations] of Object.entries(doc.paths))
    for (const [method, op] of Object.entries(operations as any)) {
      if (!["get", "post", "patch", "delete", "put"].includes(method) || !op)
        continue;
      const operation = op as any;
      operation.responses ??= {};
      for (const [code, text] of Object.entries({
        400: "Yêu cầu / chữ ký không hợp lệ",
        401: "Chưa đăng nhập hoặc sai thông tin",
        403: "Không có quyền, CSRF hoặc cần xác thực lại",
        404: "Không tìm thấy tài nguyên thuộc quyền truy cập",
        409: "Xung đột trạng thái / idempotency / tồn kho",
        422: "Validation không hợp lệ",
        429: "Vượt giới hạn tần suất",
        503: "Nhà cung cấp chưa cấu hình hoặc tạm lỗi",
      }))
        operation.responses[code] = {
          description: text,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        };
      if (method !== "get" && !path.includes("/webhooks/")) {
        operation.parameters ??= [];
        operation.parameters.push({
          name: "X-CSRF-Token",
          in: "header",
          required: true,
          schema: { type: "string" },
          description:
            "GET /api/v1/auth/csrf trước; giữ cookie. Origin phải khớp APP_URL.",
        });
      }
      if (bodies[path] && method !== "get")
        operation.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${bodies[path]}` },
            },
          },
        };
    }
  return doc;
}
