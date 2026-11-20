import "dotenv/config";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());

test("Admin đăng nhập và xác thực lại bằng mật khẩu, không hiển thị ô mã OTP", async ({ page }) => {
  if (!new URL(process.env.DATABASE_URL || "").pathname.endsWith("_test"))
    throw new Error("Admin login E2E chỉ chạy trên database _test.");
  const password = "Admin browser " + randomBytes(24).toString("hex");
  const user = await db.user.create({ data: {
    email: `admin-login-${randomBytes(12).toString("hex")}@example.test`,
    name: "Admin Login QA", role: "ADMIN", verifiedAt: new Date(),
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
  } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/admin");
  await page.getByRole("link", { name: "Đăng nhập Admin", exact: true }).click();
  await expect(page).toHaveURL(/dang-nhap\?next=/);
  await expect(page.locator('input[name="otp"], input[autocomplete="one-time-code"]')).toHaveCount(0);
  await page.locator('#main .auth-form:visible').getByLabel("Email", { exact: true }).fill(user.email);
  await page.locator('#main .auth-form:visible').getByLabel("Mật khẩu", { exact: true }).fill(password);
  const login = page.waitForResponse(response => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const response = await login;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual({ email: user.email, password });
  await expect(page.locator(".admin-main h1")).toHaveText("Tổng quan");
  await page.locator(".admin-sidebar").getByRole("button", { name: "Xác thực lại", exact: true }).click();
  await expect(page.locator('input[name="otp"], input[autocomplete="one-time-code"]')).toHaveCount(0);
  const reauthForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Xác thực lại cho thao tác nhạy cảm" }) });
  await reauthForm.getByLabel("Mật khẩu hiện tại", { exact: true }).fill(password);
  const reauth = page.waitForResponse(result => result.url().endsWith("/api/v1/auth/reauth") && result.request().method() === "POST");
  await reauthForm.getByRole("button", { name: "Xác thực lại", exact: true }).click();
  const confirmed = await reauth;
  expect(confirmed.ok()).toBe(true);
  expect(confirmed.request().postDataJSON()).toEqual({ password });
  await expect(page.getByText("Đã xác thực lại trong 10 phút.", { exact: true })).toBeVisible();
  await page.goto("/tai-khoan");
  await expect(page.getByRole("link", { name: "Trang quản trị" })).toBeVisible();
  await page.locator(".account-nav").getByRole("button", { name: /Bảo mật/ }).click();
  await expect(page.getByRole("heading", { name: "Xác thực lại cho thao tác nhạy cảm" })).toBeVisible();
  await expect(page.locator('input[name="otp"], input[autocomplete="one-time-code"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
