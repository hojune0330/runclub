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
  /**
   * 200명 단톡방 가입 폭주 hotfix:
   * 같은 NAT/캐리어 IP 뒤에 수십~수백 명이 묶여 있으면 IP 단일 키로는
   * 정상 사용자가 서로를 막아버린다 (예: 회원 A가 5번 시도하면 같은
   * 와이파이의 회원 B,C,D 도 모두 차단). extraKey 를 주면 동일 IP 라도
   * 사용자 식별값 (예: 정규화된 전화번호) 별로 카운터가 분리된다.
   *
   * 보안 영향: extraKey 는 호출 측이 사용자 입력을 *정규화한 뒤* 넘겨야
   * 한다. 그렇지 않으면 공격자가 010-1234-5678 / 01012345678 처럼 형식만
   * 바꿔 카운터를 우회할 수 있다. register 엔드포인트는 normalizePhone()
   * 결과를 넘기므로 안전.
   */
  extraKey?: string;
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

  // 200명 단톡방 동시 가입 hotfix:
  // extraKey 가 주어지면 IP 단독이 아닌 IP+extraKey 복합 키로 카운트.
  // 같은 NAT 뒤 다른 회원은 서로 막지 않는다.
  const ip = clientIp(req);
  const key = opts.extraKey
    ? `${bucket}:${ip}:${opts.extraKey}`
    : `${bucket}:${ip}`;
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
