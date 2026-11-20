// Bounded repository checks. Prints locations/rule IDs, never matched secrets.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const rules = [
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{40,}?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['OPENAI_TOKEN', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}\b/g],
  ['GITHUB_TOKEN', /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{30,}\b/g],
  ['AWS_ACCESS_KEY', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['ASSIGNED_SECRET', /\b(?:PAYOS_API_KEY|PAYOS_CHECKSUM_KEY|GHN_TOKEN|S3_SECRET_ACCESS_KEY|SMTP_PASSWORD|SESSION_SECRET|MFA_ENCRYPTION_KEY)["']?\s*[:=]\s*["']([A-Za-z0-9+/_=-]{24,})["']/g],
];
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
const all = [...new Set(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))];
const files = all.filter(file => /\.(?:tsx?|m?js|cjs|json|md|ya?ml|conf|sql|toml|env)$|Dockerfile|\.env\./.test(file) && !/^(?:\.local\/|node_modules\/)/.test(file) && fs.existsSync(file));
const findings = [];
const publicFiles = execFileSync('rg', ['--files', '--hidden', '--no-ignore', 'apps/web/public'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true }).trim().split(/\r?\n/);
for (const file of publicFiles.filter(file => /(?:^|[\\/])\.env(?:\.|$)|\.(?:key|pem|p12|pfx|dump|sql|map)$|(?:^|[\\/])(?:auth\.json|config\.toml)$/i.test(file))) findings.push({ rule: 'PUBLIC_SENSITIVE_FILE', file });
function secrets(content, file, history = false) {
  for (const [rule, expression] of rules) {
    expression.lastIndex = 0;
    for (const match of content.matchAll(expression)) findings.push({ rule, file, line: content.slice(0, match.index).split('\n').length, history });
  }
}
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  secrets(content, file);
  if (/^apps\/(api|worker)\/.+\.ts$/.test(file)) {
    for (const [rule, expression] of [['UNSAFE_SQL', /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(/g], ['RUNTIME_SHELL', /from\s*['"](?:node:)?child_process['"]/g]]) {
      for (const match of content.matchAll(expression)) findings.push({ rule, file, line: content.slice(0, match.index).split('\n').length });
    }
  }
  if (/\.tsx$/.test(file) && content.includes('dangerouslySetInnerHTML') && !content.includes('__html: serializeJsonLd(')) findings.push({ rule: 'HTML_SINK_REQUIRES_REVIEW', file });
}
const tracked = git(['ls-files', '-z']).split('\0');
for (const file of tracked.filter(file => /(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.example'))) findings.push({ rule: 'TRACKED_ENVIRONMENT', file });
let historyFiles = 0;
if (process.argv.includes('--history')) {
  const history = git(['log', '--all', '--format=', '-p', '--no-ext-diff', '--', '.', ':!apps/web/public', ':!package-lock.json']);
  let file = '(historical diff)';
  for (const section of history.split(/(?=^diff --git )/m)) {
    const match = /^diff --git a\/(.+) b\/(.+)$/m.exec(section);
    if (!match) continue;
    file = match[2]; historyFiles++;
    secrets(section.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n'), file, true);
  }
}
const report = { at: new Date().toISOString(), scope: 'Current tracked/untracked text source; optional reachable local Git history', files: files.length, historyFileRevisions: historyFiles, findings, limits: 'Pattern-based checks are not a proof of absence; GitHub/GitLab remote history, secret manager and third-party systems are outside scope.' };
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const output = path.resolve(process.argv[outputIndex + 1]);
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
if (findings.length) process.exitCode = 1;
