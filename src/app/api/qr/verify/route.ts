import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

// POST /api/qr/verify - Member scans QR to check in
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  // EXT-C2: Rate-limit verify attempts (replay/brute mitigation).
  // 20 attempts per IP per minute is far above legitimate usage.
  const rl = rateLimit(req, 'qr-verify', { windowMs: 60_000, max: 20 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    const { sessionId, token } = await req.json();
    if (typeof sessionId !== 'string' || typeof token !== 'string' || !sessionId || !token) {
      return NextResponse.json({ error: 'sessionId와 token이 필요합니다' }, { status: 400 });
    }
    // Reject obviously malformed tokens early (prevents DB lookup pressure).
    if (token.length > 128 || sessionId.length > 64) {
      return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
    }

    // Verify QR token
    const qrToken = await dbGet(`
      SELECT * FROM qr_tokens WHERE session_id = $1 AND token = $2 AND expires_at > NOW()
    `, [sessionId, token]);

    if (!qrToken) {
      return NextResponse.json({ error: 'QR 코드가 만료되었거나 유효하지 않습니다. 다시 시도해주세요.' }, { status: 400 });
    }

    // EXT-C2: Validate that the session is actually happening today and within
    // a sane check-in window (start - 60min ~ end + 60min). Without this, a
    // captured QR could be replayed across days/sessions.
    const session = await dbGet<{
      name: string;
      start_time: string;
      end_time: string | null;
      date: string;
      status: string;
    }>(
      'SELECT name, start_time, end_time, date, status FROM sessions WHERE id = $1',
      [sessionId]
    );
    if (!session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
    }
    if (session.status === 'cancelled') {
      return NextResponse.json({ error: '취소된 세션입니다' }, { status: 400 });
    }

    // Compute KST-aware window. Server may run in UTC; sessions are stored as
    // local date + start_time in Asia/Seoul for the gym.
    const nowKst = new Date(Date.now() + 9 * 60 * 60_000); // shift to KST clock
    const todayKst = nowKst.toISOString().slice(0, 10);
    if (session.date !== todayKst) {
      return NextResponse.json(
        { error: '오늘 세션의 QR이 아닙니다' },
        { status: 400 }
      );
    }
    const sessionStart = new Date(`${session.date}T${session.start_time}:00+09:00`);
    const sessionEnd = session.end_time
      ? new Date(`${session.date}T${session.end_time}:00+09:00`)
      : new Date(sessionStart.getTime() + 90 * 60_000);
    const checkInOpen = sessionStart.getTime() - 60 * 60_000;
    const checkInClose = sessionEnd.getTime() + 60 * 60_000;
    const realNow = Date.now();
    if (realNow < checkInOpen || realNow > checkInClose) {
      return NextResponse.json(
        { error: '출석 가능 시간이 아닙니다 (세션 시작 60분 전부터 종료 60분 후까지)' },
        { status: 400 }
      );
    }

    // Find the member's reservation for this session
    const reservation = await dbGet<{ id: string; status: string }>(
      `SELECT id, status FROM reservations
        WHERE member_id = $1 AND session_id = $2 AND status IN ('reserved','attended')`,
      [auth.memberId, sessionId]
    );

    if (!reservation) {
      return NextResponse.json({ error: '이 세션에 예약이 없습니다' }, { status: 400 });
    }
    if (reservation.status === 'attended') {
      return NextResponse.json(
        { success: true, alreadyAttended: true, message: '이미 출석 처리되어 있습니다', sessionName: session.name, sessionTime: session.start_time },
      );
    }

    // Mark as attended
    await dbRun(
      `UPDATE reservations SET status = 'attended', checked_in_at = NOW() WHERE id = $1`,
      [reservation.id]
    );

    return NextResponse.json({
      success: true,
      message: '출석 확인!',
      sessionName: session.name,
      sessionTime: session.start_time,
    });
  } catch (error: any) {
    console.error('[qr/verify] error:', error);
    return NextResponse.json({ error: '출석 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}
