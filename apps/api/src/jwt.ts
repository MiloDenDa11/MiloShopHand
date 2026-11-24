import jwt from 'jsonwebtoken';
import { createHmac, randomUUID } from 'node:crypto';

export const ACCESS_SECONDS = 15 * 60;
export const SESSION_MILLISECONDS = 7 * 86400000;
const issuer = 'miloshophand';
const audience = 'miloshophand-web';
const key = (config: Record<string, string | undefined>) => {
  const secret = config.JWT_SECRET || config.SESSION_SECRET;
  if (!secret || secret.length < 64) throw Error('Configure a strong JWT_SECRET or SESSION_SECRET');
  return createHmac('sha256', secret).update('miloshophand:access-jwt:v1').digest();
};
export function accessToken(userId: string, sessionId: string, config: Record<string, string | undefined>, now = Date.now()) {
  return jwt.sign({ sid: sessionId, kind: 'access', iat: Math.floor(now / 1000) }, key(config), {
    algorithm: 'HS256', subject: userId, issuer, audience, jwtid: randomUUID(), expiresIn: ACCESS_SECONDS,
  });
}
export function verifyAccessClaims(token: string, config: Record<string, string | undefined>, now = Date.now()) {
  const value = jwt.verify(token, key(config), { algorithms: ['HS256'], issuer, audience, clockTimestamp: Math.floor(now / 1000), maxAge: ACCESS_SECONDS });
  if (typeof value === 'string' || value.kind !== 'access' || typeof value.sub !== 'string' || typeof value.sid !== 'string' || !/^jwt:[a-f0-9]{64}$/.test(value.sid) || typeof value.jti !== 'string') throw Error('Invalid access claims');
  return { userId: value.sub, sessionId: value.sid, expiresAt: Math.min(value.exp ?? Infinity, (value.iat || 0) + ACCESS_SECONDS) * 1000 };
}
export function verifyAccess(token: string, config: Record<string, string | undefined>, now = Date.now()) {
  const { userId, sessionId } = verifyAccessClaims(token, config, now);
  return { userId, sessionId };
}
export const isExpiredAccess = (error: unknown) => error instanceof jwt.TokenExpiredError;
