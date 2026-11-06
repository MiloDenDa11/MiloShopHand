import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// Never copy a live database, dependencies, build output, or Git metadata over
// another checkout. Local application files are synchronized separately below.
const excluded = new Set([
  ".git", "node_modules", ".local", ".next", ".next-redesign", "dist",
  "coverage", "playwright-report", "test-results", ".turbo", ".cache", "uploads",
]);
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function index(root, current = root, files = new Map()) {
  if (!fs.existsSync(current)) return files;
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (excluded.has(entry.name) || /\.(tsbuildinfo|log)$/.test(entry.name)) continue;
    const file = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${file}`);
    if (entry.isDirectory()) index(root, file, files);
    else if (entry.isFile()) {
      const stat = fs.statSync(file);
      files.set(path.relative(root, file), { hash: hash(file), mtime: stat.mtimeMs });
    }
  }
  return files;
}

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  const stat = fs.statSync(from);
  fs.utimesSync(to, stat.atime, stat.mtime);
}

export function syncProject(source, destination, apply = false, { includeEnv = false } = {}) {
  source = fs.realpathSync(source);
  destination = fs.realpathSync(destination);
  const inside = (a, b) => {
    const relative = path.relative(a, b);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  };
  if (inside(source, destination) || inside(destination, source)) {
    throw new Error("Source and destination must be separate, non-nested directories.");
  }
  const a = index(source);
  const b = index(destination);
  // These are application files, not PostgreSQL data files or disposable QA logs.
  for (const subdir of [".local/mail", ".local/return-images", "uploads"]) {
    index(source, path.join(source, subdir), a);
    index(destination, path.join(destination, subdir), b);
  }
  const changes = [];
  for (const relative of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const src = a.get(relative);
    const dst = b.get(relative);
    if (src?.hash === dst?.hash) continue;
    const action = relative === ".env" && !includeEnv ? "keep-local-environment"
      : !dst ? "copy-new" : !src ? "keep-destination-only"
      : src.mtime > dst.mtime ? "update-from-source"
      : src.mtime < dst.mtime ? "keep-newer-destination" : "conflict";
    changes.push({ path: relative, action, source: src, destination: dst });
  }
  const conflicts = changes.filter((change) => change.action === "conflict");
  if (apply && conflicts.length) {
    throw new Error(`Equal timestamps with different contents; no files changed: ${conflicts.map((c) => c.path).join(", ")}`);
  }
  const report = { source, destination, applied: apply, changes, git: "preserved" };
  if (!apply) return report;
  const sourceGit = path.join(source, ".git");
  const destinationGit = path.join(destination, ".git");
  if (fs.existsSync(sourceGit) && !fs.existsSync(destinationGit) && !fs.lstatSync(sourceGit).isDirectory()) {
    throw new Error("Source uses a Git worktree; initialize destination Git separately.");
  }

  // Recheck the entire plan before modifying anything if an editor changed files.
  for (const change of changes) {
    for (const [root, expected] of [[source, change.source], [destination, change.destination]]) {
      const file = path.join(root, change.path);
      if (expected ? !fs.existsSync(file) || hash(file) !== expected.hash : fs.existsSync(file)) {
        throw new Error(`File changed during comparison; rerun sync: ${file}`);
      }
    }
  }
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const backup = path.join(destination, ".local", "sync-backups", stamp);
  fs.mkdirSync(backup, { recursive: true });
  report.backup = backup;
  // Save both variants before the first overwrite, including both secret files.
  for (const change of changes) {
    for (const [label, root, exists] of [["source", source, change.source], ["destination", destination, change.destination]]) {
      if (exists) copy(path.join(root, change.path), path.join(backup, label, change.path));
    }
  }
  fs.writeFileSync(path.join(backup, "manifest.json"), JSON.stringify(report, null, 2));
  for (const change of changes) {
    if (!["copy-new", "update-from-source"].includes(change.action)) continue;
    const from = path.join(source, change.path);
    const to = path.join(destination, change.path);
    if (change.path === ".env" && change.destination) {
      // Use secrets belonging to the latest database, retaining destination-only keys.
      const latest = fs.readFileSync(from, "utf8");
      const previous = fs.readFileSync(to, "utf8");
      const keys = new Set([...latest.matchAll(/^\s*([\w]+)=/gm)].map((m) => m[1]));
      const unique = previous.split(/\r?\n/).filter((line) => {
        const match = /^\s*([\w]+)=/.exec(line);
        return match && !keys.has(match[1]);
      });
      fs.writeFileSync(to, latest.trimEnd() + "\n" + (unique.length ? unique.join("\n") + "\n" : ""));
    } else copy(from, to);
  }
  if (fs.existsSync(sourceGit) && !fs.existsSync(destinationGit)) {
    fs.cpSync(sourceGit, destinationGit, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
    report.git = "copied-to-empty-destination";
  }
  fs.writeFileSync(path.join(backup, "manifest.json"), JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const source = args.find((arg) => !arg.startsWith("--"));
    if (!source) throw new Error("Usage: node scripts/sync-project.mjs <source> [--apply] [--include-env]");
    const report = syncProject(source, process.cwd(), args.includes("--apply"), { includeEnv: args.includes("--include-env") });
    const counts = {};
    for (const change of report.changes) counts[change.action] = (counts[change.action] || 0) + 1;
    console.log(JSON.stringify({ source: report.source, destination: report.destination, applied: report.applied, counts, backup: report.backup, git: report.git, changes: !report.applied ? report.changes.filter((change) => change.action !== "keep-destination-only").map(({ path, action }) => ({ path, action })) : undefined }, null, 2));
    if (report.changes.some((change) => change.action === "conflict")) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
