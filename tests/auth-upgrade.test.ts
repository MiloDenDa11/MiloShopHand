import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleConfig, verifiedGoogleClaims, googleProvider } from '../apps/api/src/google-auth';
import { hash } from '../apps/api/src/core';
import { recoveryDelivery } from '../apps/api/src/mail-policy';
import { recoveryCodeHash, recoveryEmailHash } from '../apps/api/src/password-recovery';
const id = 'synthetic.apps.googleusercontent.com', nonce = 'synthetic-nonce';
const claims = () => ({ iss: 'https://accounts.google.com', aud: id, exp: Math.floor(Date.now() / 1000) + 600, nonce, sub: '123456789', email_verified: true, email: 'Fixture@Gmail.com', name: 'Synthetic customer' });
test('Google config gates incomplete credentials and requires HTTPS in production', () => {
  assert.equal(googleConfig({}).enabled, false);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: 'fixture', APP_URL: 'http://localhost:3000' }).enabled, true);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: 'fixture', APP_URL: 'http://localhost:3000', NODE_ENV: 'production' }).enabled, false);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: 'fixture', APP_URL: 'https://milo.example.test' }).callback, 'https://milo.example.test/api/v1/auth/google/callback');
});
test('Google auth URL uses PKCE, nonce, state and only identity scopes, no Gmail access or offline token', () => {
  const provider = googleProvider({ GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: 'fixture', APP_URL: 'http://localhost:3000' });
  const url = new URL(provider.authorization({ state: 'state', nonce, challenge: 'challenge' }));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256'); assert.equal(url.searchParams.get('nonce'), nonce);
  assert.equal(url.searchParams.get('state'), 'state'); assert.equal(url.searchParams.get('access_type'), 'online');
  assert.deepEqual(url.searchParams.get('scope')!.split(' '), ['openid', 'email', 'profile']);
});
test('Google claims reject forged context, unverified email, expired token and wrong identity', () => {
  for (const change of [{ iss: 'https://evil.test' }, { aud: 'another-client' }, { azp: 'another-client' }, { exp: 0 }, { nonce: 'another-nonce' }, { email_verified: false }, { sub: '../unsafe' }, { email: 'invalid' }]) assert.throws(() => verifiedGoogleClaims({ ...claims(), ...change }, hash(nonce), id));
  assert.equal(verifiedGoogleClaims(claims(), hash(nonce), id).email, 'fixture@gmail.com');
});
test('Google email authority distinguishes Gmail, Workspace and third-party addresses', () => {
  assert.equal(verifiedGoogleClaims(claims(), hash(nonce), id).authoritative, true);
  assert.equal(verifiedGoogleClaims({ ...claims(), email: 'customer@example.test' }, hash(nonce), id).authoritative, false);
  assert.equal(verifiedGoogleClaims({ ...claims(), email: 'customer@example.test', hd: 'example.test' }, hash(nonce), id).authoritative, true);
});
test('Gmail SMTP requires application password and TLS; file delivery is development only', () => {
  const config = { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'fixture@gmail.com', SMTP_PASSWORD: 'synthetic app password' };
  assert.equal(recoveryDelivery(config), 'email'); assert.equal(recoveryDelivery({ ...config, SMTP_PASSWORD: '' }), 'unavailable');
  assert.equal(recoveryDelivery({ ...config, SMTP_SECURE: 'false' }), 'unavailable');
  assert.equal(recoveryDelivery({ ...config, SMTP_PORT: '587', SMTP_SECURE: 'false' }), 'email');
  assert.equal(recoveryDelivery({ EMAIL_PROVIDER: 'file', NODE_ENV: 'production' }), 'unavailable');
  assert.equal(recoveryDelivery({ EMAIL_PROVIDER: 'file', NODE_ENV: 'development' }), 'local');
});
test('recovery hashes are secret-bound and challenge-bound, emails normalized', () => {
  assert.equal(recoveryEmailHash(' Fixture@Gmail.com ', 'one'), recoveryEmailHash('fixture@gmail.com', 'one'));
  assert.notEqual(recoveryEmailHash('fixture@gmail.com', 'one'), recoveryEmailHash('fixture@gmail.com', 'two'));
  assert.notEqual(recoveryCodeHash('a', '123456', 'one'), recoveryCodeHash('b', '123456', 'one'));
  assert.notEqual(recoveryCodeHash('a', '123456', 'one'), hash('123456'));
});
