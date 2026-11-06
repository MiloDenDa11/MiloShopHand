import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncProject } from "../scripts/sync-project.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "milo-sync-"));
  const source = path.join(root, "source");
  const destination = path.join(root, "destination");
  fs.mkdirSync(source);
  fs.mkdirSync(destination);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (dir, file, value, seconds) => {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
    fs.utimesSync(target, seconds, seconds);
  };
  return { source, destination, write };
}

test("dry run changes nothing; apply preserves newer and destination-only files with both backups", (t) => {
  const { source, destination, write } = fixture(t);
  write(source, "new.txt", "new", 2);
  write(source, "update.txt", "latest", 2);
  write(destination, "update.txt", "old", 1);
  write(source, "keep.txt", "older", 1);
  write(destination, "keep.txt", "latest destination", 2);
  write(destination, "only.txt", "keep", 1);
  syncProject(source, destination);
  assert.equal(fs.existsSync(path.join(destination, "new.txt")), false);
  const result = syncProject(source, destination, true);
  assert.equal(fs.readFileSync(path.join(destination, "update.txt"), "utf8"), "latest");
  assert.equal(fs.readFileSync(path.join(destination, "keep.txt"), "utf8"), "latest destination");
  assert.equal(fs.readFileSync(path.join(result.backup, "destination", "update.txt"), "utf8"), "old");
  assert.equal(fs.readFileSync(path.join(result.backup, "source", "keep.txt"), "utf8"), "older");
  assert.equal(fs.readFileSync(path.join(destination, "only.txt"), "utf8"), "keep");
});

test("equal timestamps with different contents abort before any writes", (t) => {
  const { source, destination, write } = fixture(t);
  write(source, "a.txt", "new", 2);
  write(destination, "a.txt", "old", 1);
  write(source, "conflict.txt", "source", 1);
  write(destination, "conflict.txt", "destination", 1);
  assert.throws(() => syncProject(source, destination, true), /no files changed/);
  assert.equal(fs.readFileSync(path.join(destination, "a.txt"), "utf8"), "old");
});

test("excludes raw databases and dependencies, copies private uploads and preserves destination Git", (t) => {
  const { source, destination, write } = fixture(t);
  for (const file of [".local/postgres/PG_VERSION", "node_modules/test/index.js", ".next/cache", ".git/config"]) write(source, file, "excluded", 2);
  write(destination, ".git/config", "destination Git", 1);
  write(source, ".local/return-images/photo.webp", "private image", 2);
  syncProject(source, destination, true);
  assert.equal(fs.existsSync(path.join(destination, ".local/postgres/PG_VERSION")), false);
  assert.equal(fs.existsSync(path.join(destination, "node_modules/test/index.js")), false);
  assert.equal(fs.readFileSync(path.join(destination, ".git/config"), "utf8"), "destination Git");
  assert.equal(fs.readFileSync(path.join(destination, ".local/return-images/photo.webp"), "utf8"), "private image");
});

test("explicit environment sync retains destination-only keys and backs up old secrets", (t) => {
  const { source, destination, write } = fixture(t);
  write(source, ".env", "SECRET=latest\nNEW=value\n", 2);
  write(destination, ".env", "SECRET=old\nLOCAL=preserved\n", 1);
  const result = syncProject(source, destination, true, { includeEnv: true });
  assert.equal(fs.readFileSync(path.join(destination, ".env"), "utf8"), "SECRET=latest\nNEW=value\nLOCAL=preserved\n");
  assert.match(fs.readFileSync(path.join(result.backup, "destination/.env"), "utf8"), /SECRET=old/);
});

test("default sync preserves local secrets even when source environment is newer", (t) => {
  const { source, destination, write } = fixture(t);
  write(source, ".env", "SECRET=source\n", 2);
  write(destination, ".env", "SECRET=local\n", 1);
  syncProject(source, destination, true);
  assert.equal(fs.readFileSync(path.join(destination, ".env"), "utf8"), "SECRET=local\n");
});

test("rejects nested source and destination", (t) => {
  const { source } = fixture(t);
  const child = path.join(source, "child");
  fs.mkdirSync(child);
  assert.throws(() => syncProject(source, child, true), /non-nested/);
});
