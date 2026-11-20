// Safe in both server and browser bundles; this module contains no secrets.
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({
    '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029',
  })[character]!);
}

export function safeLocalRedirect(value: string | null | undefined, fallback = '/tai-khoan'): string {
  if (!value || !value.startsWith('/') || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const base = 'https://local.invalid';
    const parsed = new URL(value, base);
    return parsed.origin === base ? parsed.pathname + parsed.search + parsed.hash : fallback;
  } catch { return fallback; }
}
