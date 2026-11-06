import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compose = ["compose", "--env-file", path.join(root, ".env"), "-f", path.join(root, "infra/compose.yaml")];
function docker(args, capture = false) {
  const result = spawnSync("docker", args, {
    cwd: root, windowsHide: true, encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(capture ? result.stderr.trim() : `Docker command exited ${result.status}`);
  return result.stdout?.trim();
}
const exec = (args, capture = false) => docker([...compose, "exec", "-T", "postgres", ...args], capture);
const temporary = `/tmp/milo-${randomUUID()}.dump`;
let copied = false;
try {
  const [operation, file, ...options] = process.argv.slice(2);
  if (operation === "backup") {
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    const target = path.resolve(file || path.join(root, ".local/backups", `milo-${stamp}.dump`));
    if (fs.existsSync(target)) throw new Error(`Backup already exists: ${target}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    exec(["pg_dump", "-U", "milo", "-d", "milo", "--format=custom", "--no-owner", "--no-privileges", "--file", temporary]);
    copied = true;
    docker([...compose, "cp", `postgres:${temporary}`, target]);
    console.log(`Backup saved: ${target}`);
  } else if (operation === "restore") {
    const database = options[0] === "--database" && options.length === 2 ? options[1] : "milo_restore";
    if (!file || (options.length && !(options[0] === "--database" && options.length === 2))) {
      throw new Error("Usage: npm run db:restore -- <backup.dump> [--database milo_restore]");
    }
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(database) || ["postgres", "template0", "template1"].includes(database)) {
      throw new Error("Use a lowercase application database name (letters, digits, underscores).");
    }
    const input = path.resolve(file);
    if (!fs.statSync(input).isFile()) throw new Error("Backup must be a regular file.");
    const exists = exec(["psql", "-X", "-U", "milo", "-d", "postgres", "-Atc", `SELECT 1 FROM pg_database WHERE datname='${database}'`], true);
    if (exists) {
      const objects = exec(["psql", "-X", "-U", "milo", "-d", database, "-Atc", "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'"], true);
      if (objects !== "0") throw new Error(`Refusing to overwrite non-empty database: ${database}. Choose a new --database.`);
    }
    docker([...compose, "cp", input, `postgres:${temporary}`]);
    copied = true;
    // Validate the archive before creating a database or running its contents.
    exec(["pg_restore", "--list", temporary], true);
    if (!exists) exec(["createdb", "-U", "milo", "--template=template0", "--encoding=UTF8", "--locale=C", database]);
    exec(["pg_restore", "-U", "milo", "-d", database, "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", temporary]);
    console.log(`Restored into database: ${database}`);
  } else {
    throw new Error("Usage: node scripts/docker-db.mjs backup [file.dump] | restore <file.dump> [--database name]");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (copied) {
    try { exec(["rm", "-f", temporary]); } catch { /* Keep the original failure visible. */ }
  }
}
