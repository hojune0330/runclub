import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

// JWT secret resolution.
// - Production: JWT_SECRET MUST be set; we throw at startup if missing.
// - Development / test: a stable fallback secret is used so devs can run the
//   app without env setup. Runtime warns once when the fallback is used.
const RAW_SECRET = process.env.JWT_SECRET;
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD && (!RAW_SECRET || RAW_SECRET.length < 32)) {
  throw new Error(
    'JWT_SECRET is required in production and must be at least 32 characters. ' +
      'Set JWT_SECRET in your environment (e.g. Render dashboard).'
  );
}

if (!RAW_SECRET) {
  // Only emit the warning on the server boot, not on every request.
  if (typeof globalThis !== 'undefined' && !(globalThis as any).__jwtWarned) {
    (globalThis as any).__jwtWarned = true;
    console.warn(
      '[auth] JWT_SECRET not set — using insecure development fallback. ' +
        'Set JWT_SECRET in production.'
    );
  }
}

const JWT_SECRET = new TextEncoder().encode(
  RAW_SECRET || 'dev-only-insecure-fallback-do-not-use-in-production-please'
);

export interface TokenPayload extends JWTPayload {
  memberId: string;
  role: 'admin' | 'member';
  name: string;
  // EXT-H7: token_version snapshot at issue time. Verification compares this
  // against the current members.token_version; if they differ, the token is
  // considered revoked even though its JWT signature is still valid.
  tv?: number;
}

export async function createToken(payload: {
  memberId: string;
  role: string;
  name: string;
  tokenVersion?: number;
}): Promise<string> {
  return new SignJWT({
    memberId: payload.memberId,
    role: payload.role,
    name: payload.name,
    tv: payload.tokenVersion ?? 0,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export async function getAuthFromRequest(req: NextRequest): Promise<TokenPayload | null> {
  let token: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const cookie = req.cookies.get('token');
    if (cookie?.value) token = cookie.value;
  }
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  // EXT-H7: Compare embedded tv against the current member's token_version.
  // A mismatch (e.g., after password change or admin-forced revoke) means
  // the token is logically revoked, even though its signature is valid.
  // Imported lazily to avoid a circular dependency between auth and db.
  const { dbGet } = await import('./db');
  const row = await dbGet<{ token_version: number; is_active: boolean }>(
    'SELECT token_version, is_active FROM members WHERE id = $1',
    [payload.memberId]
  );
  if (!row) return null;
  if (!row.is_active) return null;
  if ((payload.tv ?? 0) !== (row.token_version ?? 0)) return null;

  return payload;
}

export function unauthorizedResponse(message: string = '인증이 필요합니다') {
  return Response.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message: string = '권한이 없습니다') {
  return Response.json({ error: message }, { status: 403 });
}

/**
 * Attach the auth cookie to a response with production-safe defaults.
 * - httpOnly: JS can't read it.
 * - secure: only over HTTPS in production (Render provides HTTPS automatically).
 * - sameSite: 'lax' is the right default for first-party usage; CSRF-safe for
 *   GET/HEAD and only allows top-level navigations to send the cookie.
 * - 7-day max-age, matching the JWT expiry.
 */
export function setAuthCookie(res: NextResponse, token: string) {
  res.cookies.set('token', token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
}

export function clearAuthCookie(res: NextResponse) {
  res.cookies.set('token', '', {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}
