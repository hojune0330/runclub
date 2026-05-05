import { NextRequest, NextResponse } from 'next/server';
import { dbAll } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Public (no-auth) endpoint returning upcoming sessions for landing/marketing pages.
 * Returns only non-sensitive fields — no member info, no waitlist details, no memos.
 *
 * Query params:
 *   limit (default 20, max 200) — max number of sessions to return
 *   days  (default 14, max 90)  — look-ahead window in days from today
 *
 * EXT-H2: Although Cache-Control hints help when a CDN sits in front of the
 * app, on a direct Render origin every request hits the DB. Apply a generous
 * but firm per-IP rate limit so an attacker can't drain the connection pool.
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'public-sessions', { windowMs: 60_000, max: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  const limit = Math.min(
    200,
    Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10) || 20)
  );
  const days = Math.min(
    90,
    Math.max(1, parseInt(req.nextUrl.searchParams.get('days') || '14', 10) || 14)
  );

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const toDate = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);

  try {
    const rows = await dbAll<any>(
      `SELECT s.id, s.name, s.type, s.date, s.start_time, s.end_time,
              s.location, s.max_capacity, s.is_indoor, s.status,
              (SELECT COUNT(*)::int FROM reservations r
                WHERE r.session_id = s.id AND r.status IN ('reserved','attended')) AS current_reservations
         FROM sessions s
        WHERE s.date >= $1 AND s.date <= $2 AND s.status != 'cancelled'
        ORDER BY s.date, s.start_time
        LIMIT $3`,
      [today, toDate, limit]
    );

    const sessions = rows.map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      date: s.date,
      startTime: s.start_time,
      endTime: s.end_time,
      location: s.location || '',
      isIndoor: !!s.is_indoor,
      capacity: s.max_capacity,
      reserved: s.current_reservations,
      // Derived state only — never expose member details
      remaining: Math.max(0, s.max_capacity - s.current_reservations),
      isFull: s.current_reservations >= s.max_capacity,
    }));

    return NextResponse.json(
      { sessions, count: sessions.length },
      {
        headers: {
          // Cache 60s at the edge, allow stale revalidation
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err: any) {
    console.error('[public/sessions] error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
