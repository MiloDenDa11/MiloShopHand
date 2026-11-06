import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
const pg = new EmbeddedPostgres({
  databaseDir: ".local/postgres",
  user: "milo",
  password: "milo_local",
  port: 5432,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  autoRehydrateSymlinks: true,
  onLog: () => {},
  onError: console.error,
});
if (!fs.existsSync(".local/postgres/PG_VERSION")) await pg.initialise();
await pg.start();
const c = pg.getPgClient();
await c.connect();
const found = await c.query("SELECT 1 FROM pg_database WHERE datname='milo'");
await c.end();
if (!found.rowCount) {
  const admin = pg.getPgClient();
  await admin.connect();
  await admin.query(
    "CREATE DATABASE milo ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'",
  );
  await admin.end();
}
console.log("PostgreSQL ready on localhost:5432; persistent .local/postgres.");
for (const s of ["SIGINT", "SIGTERM"])
  process.on(s, async () => {
    await pg.stop();
    process.exit(0);
  });
setInterval(() => {}, 30000);
