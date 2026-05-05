import { NextRequest, NextResponse } from 'next/server';
import { seedDatabase } from '@/lib/db';

/**
 * Database seed endpoint.
 *
 * Security:
 *   - In production, this endpoint is DISABLED unless `ALLOW_SEED=true`.
 *   - When enabled, callers MUST provide the `SEED_TOKEN` environment value
 *     either as `Authorization: Bearer <token>` or `?token=<token>`.
 *   - Locally (NODE_ENV !== 'production'), seeding is allowed without a token
 *     so developers can reset their dev DB freely.
 */
// EXT-H3: Constant-time string compare to prevent timing-based token recovery.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorized(req: NextRequest): { ok: true } | { ok: false; reason: string; status: number } {
  const isProd = process.env.NODE_ENV === 'production';

  // EXT-H3: Even in non-production, require SEED_TOKEN if one is configured.
  // This prevents an externally-exposed staging/preview deploy from being
  // freely seedable by anyone who finds the URL.
  const expected = process.env.SEED_TOKEN;

  if (!isProd) {
    if (!expected) return { ok: true };
    const url = new URL(req.url);
    const provided =
      (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
      url.searchParams.get('token') || '';
    if (!provided || !timingSafeEqual(provided, expected)) {
      return { ok: false, status: 401, reason: 'Invalid or missing seed token.' };
    }
    return { ok: true };
  }

  if (process.env.ALLOW_SEED !== 'true') {
    return { ok: false, status: 403, reason: 'Seeding is disabled in this environment.' };
  }

  if (!expected || expected.length < 16) {
    return { ok: false, status: 500, reason: 'SEED_TOKEN is not configured on the server.' };
  }

  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get('token');
  const authHeader = req.headers.get('authorization') || '';
  const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const provided = tokenFromHeader || tokenFromQuery;

  if (!provided || !timingSafeEqual(provided, expected)) {
    return { ok: false, status: 401, reason: 'Invalid or missing seed token.' };
  }

  return { ok: true };
}

async function handle(req: NextRequest) {
  const auth = isAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const result = await seedDatabase();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: '시드 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}

// EXT-H3: Only POST mutates state. GET is removed — historically GET could be
// triggered by browser preloads, link previews, or curlable URLs, all of which
// are inappropriate for a destructive admin operation.
export async function POST(req: NextRequest) {
  return handle(req);
}
