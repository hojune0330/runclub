import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * H2: CSRF protection via Origin/Referer check.
 *
 * Strategy:
 *   - All state-changing requests (POST/PUT/PATCH/DELETE) to /api/* must have
 *     a same-origin Origin or Referer header.
 *   - Authentication uses httpOnly cookie (sameSite=lax) which already mitigates
 *     simple cross-site cookie sending, but lax allows top-level POST forms.
 *     This middleware closes that gap.
 *   - GET / HEAD / OPTIONS are skipped (safe methods).
 *   - Public/unauthenticated APIs still benefit from this (defense in depth).
 *
 * Why not double-submit-cookie tokens? The httpOnly cookie + same-origin check
 * is equivalent in protection for our threat model and avoids a token plumbing
 * burden across the SPA.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only enforce on API mutations. Toss Payments webhooks are
  // server-to-server callbacks and do not include browser Origin/Referer
  // headers, so they must bypass CSRF and validate payloads in the route.
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (pathname === '/api/payments/webhook') return NextResponse.next();
  if (SAFE_METHODS.has(req.method)) return NextResponse.next();

  // Build the set of acceptable origins. We trust the request's own host
  // (same-origin requests from the SPA) and any explicitly allow-listed
  // origins via env (e.g., a custom domain that fronts this app).
  const host = req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const selfOrigin = host ? `${proto}://${host}` : null;

  const allowed = new Set<string>();
  if (selfOrigin) allowed.add(selfOrigin);
  // Always allow localhost during development
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }
  const extra = process.env.ALLOWED_ORIGINS;
  if (extra) {
    extra.split(',').map(s => s.trim()).filter(Boolean).forEach(o => allowed.add(o));
  }

  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const reqOrigin = origin ?? originOf(referer);

  // If neither Origin nor Referer is present we reject — modern browsers send
  // at least one for cross-site requests, but native fetch from the SPA always
  // includes Origin. Server-to-server callers should use API tokens (future).
  if (!reqOrigin) {
    return NextResponse.json(
      { error: 'CSRF 검증 실패: Origin 헤더 누락' },
      { status: 403 }
    );
  }

  if (!allowed.has(reqOrigin)) {
    return NextResponse.json(
      { error: 'CSRF 검증 실패: 허용되지 않은 Origin' },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
