import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { passwordHash, passwordPolicy } from "../apps/api/src/auth";
import { audit, transaction } from "../apps/api/src/core";
const db = new PrismaClient();
const adminEmail = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--grant") {
    if (args.length !== 2)
      throw new Error("Cách dùng: npm run admin:grant -- email@example.com");
    const email = adminEmail.parse(args[1]);
    const changed = await transaction(db, async (tx) => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user)
        throw new Error("Không tìm thấy tài khoản. Hãy đăng ký trước khi cấp quyền.");
      if (user.disabled)
        throw new Error("Tài khoản đang bị khóa, không thể cấp quyền Admin.");
      if (user.role === "ADMIN") return false;
      await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await audit(tx, undefined, "ADMIN_ROLE_GRANTED", "User", user.id, {
        source: "admin:grant",
        previousRole: user.role,
        role: "ADMIN",
      });
      return true;
    });
    console.log(
      changed
        ? `Đã cấp quyền Admin cho ${email}. Đăng nhập bằng mật khẩu hiện tại.`
        : `${email} đã có quyền Admin.`,
    );
    return;
  }
  if (args.length) throw new Error("Tham số không hợp lệ.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const emailInput = await rl.question("Email Admin: ");
  const name = (await rl.question("Tên Admin: ")).trim();
  console.log(
    "Mật khẩu phải có ít nhất 15 ký tự. Nhập qua biến môi trường ADMIN_PASSWORD để tránh hiển thị trong terminal.",
  );
  const password =
    process.env.ADMIN_PASSWORD ||
    (await rl.question("Mật khẩu mới (terminal có hiển thị): "));
  rl.close();
  const email = adminEmail.parse(emailInput);
  if (
    password.length < 15 ||
    password.length > 256 ||
    name.length < 2
  )
    throw new Error("Thông tin không hợp lệ.");
  await passwordPolicy(password);
  if (await db.user.findUnique({ where: { email } }))
    throw new Error(
      "Email đã tồn tại. Dùng npm run admin:grant -- email@example.com để cấp quyền.",
    );
  await db.user.create({
    data: {
      email,
      name,
      passwordHash: await passwordHash(password),
      role: "ADMIN",
      verifiedAt: new Date(),
    },
  });
  console.log(`Đã tạo tài khoản Admin ${email}. Đăng nhập bằng email và mật khẩu đã chọn.`);
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
