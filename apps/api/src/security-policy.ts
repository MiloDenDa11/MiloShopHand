import { isIP } from 'node:net';
import { recoveryDelivery } from './mail-policy';

export function proxyTrust(value = ''): false | string[] {
  if (!value.trim()) return false;
  const entries = value.split(',').map(entry => entry.trim());
  if (entries.some(entry => {
    const [address, prefix, extra] = entry.split('/');
    const family = isIP(address);
    return !family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) === 0 || Number(prefix) > (family === 4 ? 32 : 128)));
  })) throw new Error('TRUST_PROXY must list explicit trusted IP addresses/CIDRs, never a hop count or wildcard');
  return entries;
}

export function validateRuntimeConfig(config: NodeJS.ProcessEnv) {
  if (!config.SESSION_SECRET || config.SESSION_SECRET.length < 64) throw new Error('Configure a strong SESSION_SECRET');
  if (config.JWT_SECRET && config.JWT_SECRET.length < 64) throw new Error('JWT_SECRET must contain at least 64 characters');
  if (!/^[a-f0-9]{64}$/i.test(config.MFA_ENCRYPTION_KEY || '')) throw new Error('MFA_ENCRYPTION_KEY must contain 32 bytes in hex');
  proxyTrust(config.TRUST_PROXY);
  const app = new URL(config.APP_URL || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(app.protocol)) throw new Error('APP_URL must use HTTP or HTTPS');
  if (app.username || app.password || app.pathname !== '/' || app.search || app.hash) throw new Error('APP_URL must be an origin without credentials, path or query');
  if (config.NODE_ENV !== 'production') return;
  if (app.protocol !== 'https:') throw new Error('HTTPS APP_URL required in production');
  if (config.PAYMENT_PROVIDER !== 'payos' || config.SHIPPING_PROVIDER !== 'ghn') throw new Error('Production requires configured payOS/GHN providers');
  if (recoveryDelivery(config) !== 'email') throw new Error('Production requires configured SMTP with TLS and credentials for Gmail');
  if (!config.REDIS_URL || !config.DATABASE_URL) throw new Error('Production requires DATABASE_URL and REDIS_URL');
  for (const key of ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY', 'GHN_TOKEN', 'GHN_SHOP_ID', 'GHN_FROM_DISTRICT_ID', 'GHN_FROM_WARD_CODE'])
    if (!config[key]) throw new Error(`Production requires ${key}`);
  const ghn = new URL(config.GHN_BASE_URL || '');
  if (ghn.protocol !== 'https:' || !['online-gateway.ghn.vn', 'dev-online-gateway.ghn.vn'].includes(ghn.hostname) || ghn.username || ghn.password || ghn.port || ghn.search || ghn.hash)
    throw new Error('GHN_BASE_URL must use an official HTTPS GHN endpoint');
  if (/local-only|development|change.?me|replace.?me|example.?secret/i.test(config.SESSION_SECRET)) throw new Error('Development secrets are forbidden in production');
}

export function privilegedDatabaseRole(role: { rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolbypassrls: boolean; ownsDatabase?: boolean; ownsSchema?: boolean }) {
  return role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolbypassrls || role.ownsDatabase || role.ownsSchema;
}
