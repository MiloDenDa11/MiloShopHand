import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--port", process.env.BENCHMARK_PORT || "3200"], {
  cwd: path.join(root, "apps/web"),
  env: { ...process.env, NEXT_BUILD_DIR: ".next-benchmark", API_INTERNAL_URL: process.env.API_INTERNAL_URL || "http://localhost:4000" },
  stdio: "inherit", windowsHide: true,
});
child.on("exit", code => { process.exitCode = code || 0; });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
