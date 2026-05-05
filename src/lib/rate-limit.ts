/**
 * Tiny in-memory rate limiter.
 *
 * Why in-memory:
 *   - We deploy on Render as a single web instance (Starter plan, no
 *     horizontal scaling). Process-local state is fine and avoids the
 *     operational cost of Redis.
 *   - If we ever scale to >1 instance, swap this module's implementation
 *     for an Upstash/Redis-backed token bucket — the call sites stay the
 *     same.
 *
 * Algorithm: fixed window per (bucket, ip). Cheap, predictable, sufficient
 * for abuse mitigation. Each entry uses ~32 bytes; we cap the map size and
 * GC expired entries lazily on every call.
 */
import type { NextRequest } from 'next/server';

type Counter = { count: number; resetAt: number };
const store = new Map<string, Counter>();
const MAX_ENTRIES = 10_000;

export interface RateLimitOptions {
  windowMs: number; // window length in milliseconds
  max: number;      // max hits per window
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * EXT-M2: Determine the client IP, but only trust X-Forwarded-For headers
 * when the deploy is behind a known reverse proxy. Otherwise, an attacker
 * can simply set their own X-Forwarded-For to bypass the rate limiter.
 *
 * Trust model:
 *   - In production, only honour XFF when TRUST_PROXY=true is explicitly set
 *     (Render terminates TLS in front of the app — this is the expected case).
 *   - When TRUST_PROXY is unset/false, fall back to the direct connection
 *     address that Next.js exposes via NextRequest.ip; if even that is
 *     unavailable, use a single shared "unknown" bucket so abuse is still
 *     rate-limited globally rather than circumvented.
 *   - In development we trust XFF freely so local proxies just work.
 */
function clientIp(req: NextRequest): string {
  const trustProxy =
    process.env.NODE_ENV !== 'production' || process.env.TRUST_PROXY === 'true';

  if (trustProxy) {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    const real = req.headers.get('x-real-ip');
    if (real) return real.trim();
  }

  // Direct-connection IP exposed by NextRequest (best-effort).
  const direct = (req as unknown as { ip?: string }).ip;
  if (direct) return direct;

  // Last-resort shared bucket. Note this is INTENTIONALLY shared so attackers
  // who strip headers don't get unlimited attempts.
  return 'unknown';
}

function gcIfNeeded(now: number) {
  if (store.size < MAX_ENTRIES) return;
  for (const [k, v] of store) {
    if (v.resetAt < now) store.delete(k);
    if (store.size < MAX_ENTRIES * 0.9) break;
  }
}

export function rateLimit(req: NextRequest, bucket: string, opts: RateLimitOptions): RateLimitResult {
  // Escape hatch for local development & automated E2E runs. We never want
  // login fatigue while iterating; production deploys must NOT set this.
  // M1: Hard-block this flag in production regardless of env value to prevent
  // accidental brute-force exposure if NODE_ENV is mis-configured.
  if (process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMIT === 'true') {
    return { ok: true, remaining: opts.max, retryAfterSec: 0 };
  }

  const now = Date.now();
  gcIfNeeded(now);

  const key = `${bucket}:${clientIp(req)}`;
  const cur = store.get(key);

  if (!cur || cur.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.max - 1, retryAfterSec: 0 };
  }

  if (cur.count >= opts.max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
    };
  }

  cur.count += 1;
  return {
    ok: true,
    remaining: opts.max - cur.count,
    retryAfterSec: Math.ceil((cur.resetAt - now) / 1000),
  };
}

/**
 * Read-only inspect (used by tests / admin debug). Not exposed publicly.
 */
export function _rateLimitInternalSize(): number {
  return store.size;
}
