import fs from "node:fs";
import { randomBytes } from "node:crypto";
if (!fs.existsSync(".env")) {
  let value = fs.readFileSync(".env.example", "utf8");
  for (const key of [
    "SESSION_SECRET",
    "MFA_ENCRYPTION_KEY",
    "DEV_WEBHOOK_SECRET",
  ])
    value = value.replace(
      `${key}=`,
      `${key}=${randomBytes(32).toString("hex")}`,
    );
  fs.writeFileSync(".env", value);
  console.log("Created ignored .env with random development secrets.");
} else console.log(".env exists; preserved.");
