import { NextRequest, NextResponse } from 'next/server';
import { dbGet } from '@/lib/db';

/**
 * Lightweight liveness/readiness probe used by Render's health check.
 *
 * - Returns 200 only when we can complete a SELECT 1 against the database.
 * - Returns 503 otherwise so the platform can mark the instance unhealthy.
 *
 * EXT-I10: The previous implementation returned `uptimeSec` and the server
 * `time` to every anonymous caller, plus the raw DB error message on failure.
 * Those leak operational details: uptime tells an attacker how recently the
 * app was deployed/restarted (and thus when memory-resident rate-limit
 * counters reset), and DB error strings can leak driver/version info.
 *
 * The endpoint now returns a minimal `{ ok }` payload to unauthenticated
 * callers, and only includes the richer ops metadata when called from the
 * loopback interface or with a valid HEALTH_TOKEN. Render's health check
 * only cares about the status code, so this is fully compatible.
 */
const startedAt = Date.now();

function isOpsCaller(req: NextRequest): boolean {
  // Health checks from Render itself land on the loopback path or via the
  // platform's internal network; we err on the side of "not internal" and
  // require an explicit token for the verbose response.
  const expected = process.env.HEALTH_TOKEN;
  if (expected && expected.length >= 16) {
    const url = new URL(req.url);
    const provided =
      (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
      url.searchParams.get('token') || '';
    if (provided && provided === expected) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const verbose = isOpsCaller(req);
  try {
    await dbGet('SELECT 1 AS ok');
    return NextResponse.json(
      verbose
        ? {
            ok: true,
            uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
            time: new Date().toISOString(),
          }
        : { ok: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    // EXT-I10: Don't echo raw DB error strings to anonymous callers.
    console.error('[health] db check failed:', err);
    return NextResponse.json(
      verbose
        ? { ok: false, error: err?.message || 'database unreachable' }
        : { ok: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
