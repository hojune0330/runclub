import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Public summary stats for the landing page (active member count, weekly
 * sessions, total attendance — aggregate numbers only, no PII).
 *
 * EXT-H2: Per-IP rate limit to prevent DB connection-pool drain via direct
 * origin pounding (e.g., when no CDN fronts the app).
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'public-stats', { windowMs: 60_000, max: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

    const memberRow = await dbGet<{ c: string }>(
      `SELECT COUNT(*) AS c FROM members WHERE is_active = TRUE`
    );

    const upcomingRow = await dbGet<{ c: string }>(
      `SELECT COUNT(*) AS c FROM sessions WHERE date >= $1 AND date <= $2 AND status != 'cancelled'`,
      [today, weekAhead]
    );

    const attendedRow = await dbGet<{ c: string }>(
      `SELECT COUNT(*) AS c FROM reservations r
         JOIN sessions s ON s.id = r.session_id
        WHERE r.status = 'attended' AND s.date >= $1`,
      [monthAgo]
    );

    const sessionTypeRows = await dbAll<{ type: string; c: string }>(
      `SELECT type, COUNT(*) AS c FROM sessions
        WHERE date >= $1 AND date <= $2 AND status != 'cancelled'
        GROUP BY type`,
      [today, weekAhead]
    );

    return NextResponse.json(
      {
        activeMembers: Number(memberRow?.c ?? 0),
        upcomingSessionsThisWeek: Number(upcomingRow?.c ?? 0),
        attendedLast30Days: Number(attendedRow?.c ?? 0),
        sessionTypesThisWeek: sessionTypeRows.reduce((acc, r) => {
          acc[r.type] = Number(r.c);
          return acc;
        }, {} as Record<string, number>),
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
      }
    );
  } catch (err: any) {
    console.error('[public/stats] error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
