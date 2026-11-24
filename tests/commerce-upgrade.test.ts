import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Writable } from 'node:stream';
import jwt from 'jsonwebtoken';
import { accessToken, verifyAccess } from '../apps/api/src/jwt';
import { cloudinaryAvatars, avatarIdValid } from '../apps/api/src/avatar';
import { cancellationSchema, buyerCanCancel } from '../packages/shared/src';
const config = { JWT_SECRET: 'a'.repeat(64) }, sid = `jwt:${'b'.repeat(64)}`, now = 1800000000000;
test('JWT ký đúng HS256, hạn 15 phút, không chứa email/role và từ chối token sửa đổi', () => {
  const token = accessToken('fixture-user', sid, config, now);
  assert.deepEqual(verifyAccess(token, config, now), { userId: 'fixture-user', sessionId: sid });
  const decoded = jwt.decode(token) as jwt.JwtPayload; assert.equal(decoded.exp! - decoded.iat!, 900); assert.equal(decoded.role, undefined); assert.equal(decoded.email, undefined);
  assert.throws(() => verifyAccess(token, config, now + 901000));
  const parts = token.split('.'); parts[1] = Buffer.from(JSON.stringify({ ...decoded, sub: 'attacker' })).toString('base64url');
  assert.throws(() => verifyAccess(parts.join('.'), config, now));
  assert.throws(() => verifyAccess(token, { JWT_SECRET: 'c'.repeat(64) }, now));
});
test('JWT khóa algorithm, issuer, audience và loại token; không chấp nhận none', () => {
  const secret = createHmac('sha256', config.JWT_SECRET).update('miloshophand:access-jwt:v1').digest();
  for (const change of [{ iss: 'wrong' }, { aud: 'wrong' }, { kind: 'refresh' }]) {
    const token = jwt.sign({ sub: 'fixture-user', sid, kind: 'access', iss: 'miloshophand', aud: 'miloshophand-web', iat: now / 1000, jti: 'test', ...change }, secret, { algorithm: 'HS256', expiresIn: 900 });
    assert.throws(() => verifyAccess(token, config, now));
  }
  assert.throws(() => verifyAccess(jwt.sign({ sub: 'fixture-user', sid }, null, { algorithm: 'none' }), config, now));
});
test('Cloudinary dùng upload có ký phía server, tên ngẫu nhiên và URL HTTPS đúng cloud', async () => {
  let uploaded: any, removed = '';
  const uploader = { upload_stream: (options: any, done: Function) => {
    uploaded = options;
    return new Writable({ write(_chunk, _encoding, callback) { callback(); }, final(callback) { done(null, { public_id: options.public_id, secure_url: `https://res.cloudinary.com/fixture/image/upload/v1/${options.public_id}.webp`, resource_type: 'image', format: 'webp' }); callback(); } });
  }, destroy: async (publicId: string) => { removed = publicId; return { result: 'ok' }; } };
  const provider = cloudinaryAvatars({ CLOUDINARY_CLOUD_NAME: 'fixture', CLOUDINARY_API_KEY: 'fixture-key', CLOUDINARY_API_SECRET: 'fixture-secret' }, uploader as any);
  const result = await provider.upload(Buffer.from('synthetic normalized webp'), 'fixture-user');
  assert.equal(avatarIdValid(result.publicId), true); assert.equal(uploaded.overwrite, false); assert.equal(uploaded.resource_type, 'image'); assert.deepEqual(uploaded.allowed_formats, ['webp']);
  assert.ok(!result.publicId.includes('fixture-user'));
  await provider.remove(result.publicId); assert.equal(removed, result.publicId);
  await assert.rejects(provider.remove('other-folder/arbitrary-image'));
});
test('chưa cấu hình Cloudinary không upload; lỗi nhà cung cấp không lộ nội dung nội bộ', async () => {
  let calls = 0;
  const uploader = { upload_stream: (_options: any, done: Function) => { calls++; return new Writable({ write(_chunk, _encoding, callback) { callback(); }, final(callback) { done(new Error('private fixture provider detail')); callback(); } }); } };
  const disabled = cloudinaryAvatars({}, uploader as any); assert.equal(disabled.enabled, false);
  await assert.rejects(disabled.upload(Buffer.from('fixture'), 'fixture')); assert.equal(calls, 0);
  const enabled = cloudinaryAvatars({ CLOUDINARY_CLOUD_NAME: 'fixture', CLOUDINARY_API_KEY: 'fixture', CLOUDINARY_API_SECRET: 'fixture' }, uploader as any);
  await assert.rejects(enabled.upload(Buffer.from('fixture'), 'fixture'), error => error instanceof Error && !error.message.includes('private fixture')); assert.equal(calls, 1);
});
test('hủy đơn chỉ trước duyệt; lý do bắt buộc, kiểm tra OTHER và chặn mass assignment', () => {
  assert.equal(buyerCanCancel('PENDING_PAYMENT'), true); assert.equal(buyerCanCancel('PENDING_CONFIRMATION'), true);
  for (const status of ['CONFIRMED', 'PACKING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED']) assert.equal(buyerCanCancel(status), false);
  assert.equal(cancellationSchema.safeParse({}).success, false); assert.equal(cancellationSchema.safeParse({ reasonCode: 'OTHER' }).success, false);
  assert.equal(cancellationSchema.safeParse({ reasonCode: 'OTHER', detail: 'Muốn thay đổi lựa chọn' }).success, true);
  assert.equal(cancellationSchema.safeParse({ reasonCode: 'DUPLICATE', status: 'COMPLETED' }).success, false);
});
