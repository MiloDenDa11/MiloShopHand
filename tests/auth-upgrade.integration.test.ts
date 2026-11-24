import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { Db, hash, csrfToken, seal, unseal, env } from '../apps/api/src/core';
import { passwordHash, AuthController } from '../apps/api/src/auth';
import { PasswordRecoveryService } from '../apps/api/src/password-recovery';
import { GoogleAuthService, GoogleAuthController, type GoogleProfile, type GoogleProvider } from '../apps/api/src/google-auth';
import { authenticator } from '../apps/api/src/two-factor';
const dbUrl = new URL(process.env.DATABASE_URL!);
if (process.env.TRY_ON_TEST_DATABASE_URL !== process.env.DATABASE_URL || dbUrl.hostname !== '127.0.0.1' || dbUrl.pathname !== '/milo_try_on_test') throw Error('Fresh isolated test database required');
const db = new Db(), originalPassword = 'Synthetic initial password for Milo tests!', nextPassword = 'Synthetic changed password for Milo tests!';
let base: string, child: ChildProcess, logs = '', ph: string;
const errorCode = (code: string) => (error: any) => error?.getResponse?.()?.code === code;
async function user(extra: any = {}) { return db.user.create({ data: { email: `${randomUUID()}@gmail.com`, name: 'Synthetic customer', passwordHash: ph, verifiedAt: new Date(), ...extra } }); }
async function requestFor(actor?: any) {
  if (!actor) return { headers: { 'user-agent': 'Synthetic test' }, ip: '127.0.0.1' } as any;
  const raw = randomBytes(32).toString('hex'); const session = await db.session.create({ data: { id: hash(raw), userId: actor.id, csrf: csrfToken(), agent: 'Synthetic fixture', expiresAt: new Date(Date.now() + 3600000), reauthenticatedAt: new Date() } });
  return { actor, session, headers: { 'user-agent': 'Synthetic test' }, ip: '127.0.0.1', raw } as any;
}
async function http(actor?: any) {
  const cookies = new Map<string, string>();
  if (actor) { const req = await requestFor(actor); cookies.set('milo_sid', req.raw); cookies.set('milo_csrf', req.session.csrf); }
  async function call(path: string, body?: any, method = body === undefined ? 'GET' : 'POST', origin = base) {
    const response = await fetch(`${base}/api/v1${path}`, { method, redirect: 'manual', headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), Origin: origin, 'X-CSRF-Token': cookies.get('milo_csrf') || '', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) { const pair = value.split(';')[0], at = pair.indexOf('='); cookies.set(pair.slice(0, at), pair.slice(at + 1)); }
    return { status: response.status, headers: response.headers, data: (response.headers.get('content-type') || '').includes('json') ? await response.json() : await response.text() };
  }
  if (!actor) await call('/auth/csrf');
  return { cookies, call };
}
function recoveryClock() { let time = Date.now(); const service = new PasswordRecoveryService(db, env, () => new Date(time)); return { service, advance: (milliseconds: number) => { time += milliseconds; } }; }
async function codeFor(id: string) {
  const event = await db.outboxEvent.findUniqueOrThrow({ where: { key: `recovery:${id}` } }), payload: any = event.payload;
  assert.equal(payload.text, undefined); assert.equal(typeof payload.encryptedText, 'string');
  const code = unseal(payload.encryptedText).match(/\b\d{6}\b/)![0]; assert.equal(JSON.stringify(payload).includes(code), false); return code;
}
function providerFor(profile: GoogleProfile) {
  const capture: any = {};
  const provider: GoogleProvider = { enabled: true, authorization(input) { Object.assign(capture, input); return `https://accounts.google.com/o/oauth2/v2/auth?state=${input.state}`; }, async profile(input) { capture.exchange = input; return profile; } };
  return { service: new GoogleAuthService(db, provider), capture };
}
async function googleLogin(service: GoogleAuthService, req = { headers: {} } as any, next?: string) {
  const started = await service.start({ mode: 'login', next }, req); const state = new URL(started.url).searchParams.get('state')!;
  return { started, state, result: await service.callback({ state, code: 'synthetic-code' }, started.browser, req) };
}
before(async () => {
  await db.$connect(); ph = await passwordHash(originalPassword);
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = (probe.address() as any).port; await new Promise<void>(resolve => probe.close(() => resolve())); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--tsconfig', 'apps/api/tsconfig.json', 'apps/api/src/main.ts'], { windowsHide: true, env: { ...process.env, APP_URL: base, API_PORT: String(port), API_HOST: '127.0.0.1', REDIS_URL: 'redis://127.0.0.1:1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout!, child.stderr!]) stream.on('data', data => { logs = (logs + data).slice(-6000); });
  const deadline = Date.now() + 90000; while (Date.now() < deadline) { if (child.exitCode !== null) throw Error(logs); try { if ((await fetch(`${base}/api/v1/config`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 200)); } throw Error('Fixture API timed out');
});
after(async () => { if (child?.pid && child.exitCode === null) { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill(); } await db.$disconnect(); });
test('known, unknown and disabled emails have indistinguishable recovery responses; codes encrypted and never returned', async () => {
  const actor = await user(), disabled = await user({ disabled: true }), clock = recoveryClock();
  const results = await Promise.all([clock.service.request(actor.email), clock.service.request(`${randomUUID()}@gmail.com`), clock.service.request(disabled.email)]);
  assert.deepEqual(results.map(row => Object.keys(row).sort()), Array(3).fill(Object.keys(results[0]).sort()));
  assert.equal(new Set(results.map(row => row.message)).size, 1); assert.equal(new Set(results.map(row => row.delivery)).size, 1);
  const code = await codeFor(results[0].challengeId); assert.equal(JSON.stringify(results).includes(code), false);
  for (const row of results.slice(1)) assert.equal(await db.outboxEvent.count({ where: { key: `recovery:${row.challengeId}` } }), 0);
});
test('persistent resend cooldown, three-per-15-min limit and replacement of old code/proof', async () => {
  const actor = await user(), { service, advance } = recoveryClock(), first = await service.request(actor.email), code = await codeFor(first.challengeId);
  const proof = await service.verify(first.challengeId, code);
  await assert.rejects(service.request(actor.email), errorCode('RECOVERY_SEND_LIMIT')); advance(61000);
  await service.request(actor.email); await assert.rejects(service.reset({ challengeId: first.challengeId, resetToken: proof.resetToken, password: nextPassword }), errorCode('RECOVERY_TOKEN_INVALID'));
  advance(61000); await service.request(actor.email); advance(61000); await assert.rejects(service.request(actor.email), errorCode('RECOVERY_SEND_LIMIT'));
});
test('five concurrent wrong attempts are committed; even correct code is rejected after lockout', async () => {
  const actor = await user(), { service } = recoveryClock(), challenge = await service.request(actor.email), code = await codeFor(challenge.challengeId), wrong = code === '000000' ? '111111' : '000000';
  await Promise.all(Array.from({ length: 5 }, () => assert.rejects(service.verify(challenge.challengeId, wrong), errorCode('RECOVERY_CODE_INVALID'))));
  const row = await db.passwordRecovery.findUniqueOrThrow({ where: { id: challenge.challengeId } }); assert.equal(row.attempts, 5); assert.ok(row.consumedAt);
  await assert.rejects(service.verify(row.id, code), errorCode('RECOVERY_CODE_INVALID'));
});
test('email code expiry and one-use verification; reset proof expires after at most five minutes', async () => {
  const actor = await user(), { service, advance } = recoveryClock(), first = await service.request(actor.email), code = await codeFor(first.challengeId);
  advance(600001); await assert.rejects(service.verify(first.challengeId, code), errorCode('RECOVERY_CODE_INVALID'));
  const second = await service.request(actor.email), proof = await service.verify(second.challengeId, await codeFor(second.challengeId));
  await assert.rejects(service.verify(second.challengeId, await codeFor(second.challengeId)), errorCode('RECOVERY_CODE_INVALID')); advance(300001);
  await assert.rejects(service.reset({ challengeId: second.challengeId, resetToken: proof.resetToken, password: nextPassword }), errorCode('RECOVERY_TOKEN_INVALID'));
});
test('password recovery consumes proof atomically, revokes sessions, enables local password, preserves active MFA', async () => {
  const actor = await user({ role: 'SELLER' }); await requestFor(actor); await requestFor(actor);
  await db.externalIdentity.create({ data: { userId: actor.id, provider: 'GOOGLE', subject: randomUUID(), email: actor.email, passwordEnabled: false } });
  const mfa = await db.mFA.create({ data: { userId: actor.id, enabledAt: new Date(), encryptedSecret: seal('JBSWY3DPEHPK3PXP'), recoveryHashes: [hash('recoveryfixture')], lastCounter: 0 } });
  const { service } = recoveryClock(), request = await service.request(actor.email), proof = await service.verify(request.challengeId, await codeFor(request.challengeId));
  const input = { challengeId: request.challengeId, resetToken: proof.resetToken, password: nextPassword };
  const results = await Promise.allSettled([service.reset(input), service.reset(input)]); assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await db.session.count({ where: { userId: actor.id } }), 0); assert.deepEqual(await db.mFA.findUnique({ where: { userId: actor.id } }), mfa);
  assert.equal((await db.externalIdentity.findUniqueOrThrow({ where: { userId_provider: { userId: actor.id, provider: 'GOOGLE' } } })).passwordEnabled, true);
  const browser = await http(); const login = await browser.call('/auth/login', { email: actor.email, password: nextPassword }); assert.equal(login.data.code, 'MFA_REQUIRED');
});
test('legacy reset links and new recovery challenges invalidate each other; existing emailed links still work once', async () => {
  const actor = await user(), controller = new AuthController(db), { service } = recoveryClock(), challenge = await service.request(actor.email);
  await controller.forgot({ email: actor.email }); await assert.rejects(service.verify(challenge.challengeId, await codeFor(challenge.challengeId)), errorCode('RECOVERY_CODE_INVALID'));
  const old = await db.authToken.findFirstOrThrow({ where: { userId: actor.id, purpose: 'RESET', usedAt: null } });
  const event = await db.outboxEvent.findUniqueOrThrow({ where: { key: `reset:${old.hash}` } }); const token = unseal((event.payload as any).encryptedText).match(/token=([a-f0-9]+)/)![1];
  await controller.reset({ token, password: nextPassword }); await assert.rejects(controller.reset({ token, password: originalPassword }), errorCode('TOKEN_INVALID'));
  const other = await user(); await controller.forgot({ email: other.email }); await service.request(other.email);
  assert.equal(await db.authToken.count({ where: { userId: other.id, purpose: 'RESET', usedAt: null } }), 0);
});
test('recovery HTTP rejects CSRF, malformed code, weak password and reset without verified proof; no login session', async () => {
  const browser = await http(), actor = await user();
  assert.equal((await browser.call('/auth/recovery/request', { email: actor.email }, 'POST', 'https://evil.test')).status, 403);
  assert.equal((await browser.call('/auth/recovery/verify', { challengeId: randomUUID(), code: 'abc' })).status, 422);
  assert.equal((await browser.call('/auth/recovery/reset', { challengeId: randomUUID(), resetToken: 'a'.repeat(64), password: 'short' })).status, 422);
  assert.equal((await browser.call('/auth/recovery/reset', { challengeId: randomUUID(), resetToken: 'a'.repeat(64), password: nextPassword })).status, 400);
  const request = await browser.call('/auth/recovery/request', { email: actor.email }); assert.equal(request.status, 201); assert.equal(browser.cookies.has('milo_sid'), false);
});
test('OAuth state binds browser, PKCE verifier and nonce, expires and cannot be replayed; safe return URL', async () => {
  const profile = { subject: randomUUID(), email: `${randomUUID()}@gmail.com`, name: 'Synthetic Google', authoritative: true }, { service, capture } = providerFor(profile), req = await requestFor();
  const start = await service.start({ mode: 'login', next: 'https://evil.test' }, req), state = new URL(start.url).searchParams.get('state')!;
  const stored: any = (await db.storeSetting.findUniqueOrThrow({ where: { key: `google-state:${hash(state)}` } })).value;
  assert.equal(createHash('sha256').update(unseal(stored.encryptedVerifier)).digest('base64url'), capture.challenge); assert.equal(hash(capture.nonce), stored.nonceHash);
  await assert.rejects(service.callback({ state, code: 'synthetic' }, 'wrong-browser', req), errorCode('GOOGLE_STATE_INVALID'));
  const result = await service.callback({ state, code: 'synthetic' }, start.browser, req); assert.equal(result.next, '/tai-khoan');
  await assert.rejects(service.callback({ state, code: 'synthetic' }, start.browser, req), errorCode('GOOGLE_STATE_INVALID'));
  const expired = await service.start({ mode: 'login' }, req), expiredState = new URL(expired.url).searchParams.get('state')!;
  await db.storeSetting.update({ where: { key: `google-state:${hash(expiredState)}` }, data: { value: { ...stored, expiresAt: 1 } } });
  await assert.rejects(service.callback({ state: expiredState, code: 'synthetic' }, start.browser, req), errorCode('GOOGLE_STATE_INVALID'));
});
test('Google creates only USER; no email auto-merge, no signup for non-authoritative email, no disabled-account login', async () => {
  const existing = await user(), collision = providerFor({ subject: randomUUID(), email: existing.email, name: 'Synthetic', authoritative: true });
  await assert.rejects(googleLogin(collision.service), errorCode('GOOGLE_LINK_REQUIRED')); assert.equal(await db.externalIdentity.count({ where: { userId: existing.id } }), 0);
  await assert.rejects(googleLogin(providerFor({ subject: randomUUID(), email: `${randomUUID()}@example.test`, name: 'Synthetic', authoritative: false }).service), errorCode('GOOGLE_EMAIL_UNTRUSTED'));
  const profile = { subject: randomUUID(), email: `${randomUUID()}@gmail.com`, name: 'Synthetic', authoritative: true }, fixture = providerFor(profile); await googleLogin(fixture.service);
  const created = await db.user.findUniqueOrThrow({ where: { email: profile.email } }); assert.equal(created.role, 'USER'); assert.ok(created.verifiedAt);
  await db.user.update({ where: { id: created.id }, data: { disabled: true } }); await assert.rejects(googleLogin(fixture.service), errorCode('GOOGLE_IDENTITY_INVALID'));
});
test('Google linking needs fresh reauthentication, same email and initiating session; no wrong-account binding', async () => {
  const actor = await user(), req = await requestFor(actor), fixture = providerFor({ subject: randomUUID(), email: actor.email, name: actor.name, authoritative: true });
  await assert.rejects(fixture.service.start({ mode: 'link' }, await requestFor()), errorCode('UNAUTHENTICATED'));
  const stale = { ...req, session: { ...req.session, reauthenticatedAt: new Date(1) } }; await assert.rejects(fixture.service.start({ mode: 'link' }, stale), errorCode('REAUTH_REQUIRED'));
  const start = await fixture.service.start({ mode: 'link' }, req), state = new URL(start.url).searchParams.get('state')!;
  await assert.rejects(fixture.service.callback({ state, code: 'fixture' }, start.browser, { ...req, session: { ...req.session, id: 'other-session' } }), errorCode('GOOGLE_SESSION_CHANGED'));
  const wrong = providerFor({ subject: randomUUID(), email: 'other@gmail.com', name: 'Wrong', authoritative: true }), wrongStart = await wrong.service.start({ mode: 'link' }, req);
  await assert.rejects(wrong.service.callback({ state: new URL(wrongStart.url).searchParams.get('state')!, code: 'fixture' }, wrongStart.browser, req), errorCode('GOOGLE_EMAIL_MISMATCH'));
  const good = await fixture.service.start({ mode: 'link' }, req); await fixture.service.callback({ state: new URL(good.url).searchParams.get('state')!, code: 'fixture' }, good.browser, req);
  assert.equal(await db.externalIdentity.count({ where: { userId: actor.id } }), 1);
});
test('Google pending ticket requires staff MFA before JWT; single-use ticket and secure cookies', async () => {
  const actor = await user({ role: 'ADMIN' }), subject = randomUUID(); await db.externalIdentity.create({ data: { userId: actor.id, provider: 'GOOGLE', subject, email: actor.email } });
  await db.mFA.create({ data: { userId: actor.id, encryptedSecret: seal('JBSWY3DPEHPK3PXP'), recoveryHashes: [], lastCounter: 0, enabledAt: new Date() } });
  const fixture = providerFor({ subject, email: actor.email, name: actor.name, authoritative: true }), login = await googleLogin(fixture.service); assert.equal(login.result.mode, 'login');
  const browser = await http(); browser.cookies.set('milo_google_login', (login.result as any).pending);
  assert.equal((await browser.call('/auth/google/complete', {})).data.code, 'MFA_REQUIRED'); assert.equal(browser.cookies.has('milo_sid'), false);
  assert.equal((await browser.call('/auth/google/complete', { otp: 'invalid' })).data.code, 'MFA_INVALID');
  const success = await browser.call('/auth/google/complete', { otp: authenticator('JBSWY3DPEHPK3PXP').generate() }); assert.equal(success.status, 201); assert.equal(success.data.auth.type, 'JWT');
  const set = success.headers.getSetCookie(); assert.ok(set.find(value => value.startsWith('milo_access=') && /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)));
  browser.cookies.set('milo_google_login', (login.result as any).pending); assert.equal((await browser.call('/auth/google/complete', {})).data.code, 'GOOGLE_LOGIN_EXPIRED');
});
test('Google unlink prevents removal of last login method; password change invalidates outstanding OAuth tickets', async () => {
  const actor = await user(), req = await requestFor(actor), controller = new GoogleAuthController(db);
  await db.externalIdentity.create({ data: { userId: actor.id, provider: 'GOOGLE', subject: randomUUID(), email: actor.email, passwordEnabled: false } });
  await assert.rejects(controller.unlink({}, req), errorCode('LOCAL_PASSWORD_REQUIRED'));
  const pending = await db.authToken.create({ data: { userId: actor.id, purpose: 'GOOGLE_LOGIN', hash: hash(randomUUID()), expiresAt: new Date(Date.now() + 300000) } });
  await new AuthController(db).changePassword({ currentPassword: originalPassword, password: nextPassword }, req);
  assert.ok((await db.authToken.findUniqueOrThrow({ where: { id: pending.id } })).usedAt);
  await controller.unlink({}, req); assert.equal(await db.externalIdentity.count({ where: { userId: actor.id } }), 0);
});
test('unconfigured Google stays disabled, callback failures never expose raw provider error or issue sessions', async () => {
  const browser = await http(); assert.equal((await browser.call('/auth/google/config')).data.enabled, false);
  assert.equal((await browser.call('/auth/google/start', { mode: 'login' })).data.code, 'GOOGLE_UNAVAILABLE');
  const result = await browser.call(`/auth/google/callback?state=${'a'.repeat(64)}&error=secret-provider-data`); assert.equal(result.status, 303);
  assert.equal(result.headers.get('referrer-policy'), 'no-referrer'); assert.match(result.headers.get('cache-control') || '', /no-store/);
  assert.equal(result.headers.get('location')?.includes('secret-provider-data'), false); assert.equal(browser.cookies.has('milo_sid'), false);
});
test('admin settings exclude temporary Google and MFA authentication state', async () => {
  const admin = await user({ role: 'ADMIN' }), browser = await http(admin);
  await db.storeSetting.create({ data: { key: `google-state:${randomUUID()}`, value: { encryptedVerifier: 'synthetic-private-state' } } });
  await db.storeSetting.create({ data: { key: `mfa-setup:${admin.id}`, value: { encryptedSecret: 'synthetic-private-mfa' } } });
  const result = await browser.call('/admin/data/settings'); assert.equal(result.status, 200);
  assert.equal(result.data.some((row: any) => /^(login:|mfa-setup:|google-state:)/.test(row.key)), false);
});
