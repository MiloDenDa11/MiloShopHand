import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import { TOTP, Secret } from "otpauth";
import { randomBytes } from "node:crypto";
import { passwordHash, passwordPolicy } from "../apps/api/src/auth";
import { seal, hash } from "../apps/api/src/core";
const db = new PrismaClient();
async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question("Email Admin: ")).trim().toLowerCase();
  const name = (await rl.question("Tên Admin: ")).trim();
  console.log(
    "Mật khẩu phải có ít nhất 15 ký tự. Nhập qua biến môi trường ADMIN_PASSWORD để tránh hiển thị trong terminal.",
  );
  const password =
    process.env.ADMIN_PASSWORD ||
    (await rl.question("Mật khẩu mới (terminal có hiển thị): "));
  rl.close();
  if (
    password.length < 15 ||
    password.length > 256 ||
    !email.includes("@") ||
    name.length < 2
  )
    throw new Error("Thông tin không hợp lệ.");
  await passwordPolicy(password);
  if (await db.user.findUnique({ where: { email } }))
    throw new Error(
      "Email đã tồn tại. Không nâng quyền tài khoản qua công cụ này.",
    );
  const secret = new Secret({ size: 20 });
  const recovery = Array.from({ length: 10 }, () =>
    randomBytes(12).toString("hex"),
  );
  await db.user.create({
    data: {
      email,
      name,
      passwordHash: await passwordHash(password),
      role: "ADMIN",
      verifiedAt: new Date(),
      mfa: {
        create: {
          encryptedSecret: seal(secret.base32),
          recoveryHashes: recovery.map(hash),
        },
      },
    },
  });
  const totp = new TOTP({ issuer: "MILOSHOPHAND", label: email, secret });
  console.log("LƯU RIÊNG, KHÔNG CHIA SẺ: nhập URI này vào ứng dụng xác thực:");
  console.log(totp.toString());
  console.log("Mã khôi phục dùng một lần, hãy lưu vào trình quản lý mật khẩu:");
  console.log(recovery.join("\n"));
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
