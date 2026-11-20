import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV !== 'production';
  const https = process.env.APP_URL?.startsWith('https://');
  const storage = process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL).origin : '';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''} https://maps.googleapis.com https://maps.gstatic.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${storage} https://*.googleapis.com https://*.gstatic.com https://*.google.com`,
    "connect-src 'self' blob: https://*.googleapis.com https://*.gstatic.com",
    "worker-src 'self' blob:", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
    ...(!development && https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  // Always overwrite inbound values; a client cannot pick its own CSP nonce.
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/((?!api/|uploads/|_next/static/|_next/image|collection-ai/|collection-legacy/|collection-v2/|collection-spin/|product-media/|products/|fonts/|favicon.ico).*)'] };
