import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { safeSync } from '@/lib/sheets';
import { mapAttendanceRow, mapPassRow } from '@/lib/sheets-mappers';

async function findUsablePass(memberId: string, session: { id: string; type: string }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return dbGet<any>(`
    SELECT mp.*, pp.applicable_sessions, pp.category, pp.name AS product_name,
           m.name AS member_name
      FROM member_passes mp
      JOIN pass_products pp ON mp.product_id = pp.id
      JOIN members m ON mp.member_id = m.id
     WHERE mp.member_id = $1 AND mp.status = 'active' AND mp.expiry_date >= $3
       AND (pp.category != 'count' OR mp.remaining_count > 0)
       AND (
         EXISTS (
           SELECT 1 FROM pass_product_tag_map ptm
            WHERE ptm.product_id = pp.id AND ptm.tag_id = '*'
         )
         OR EXISTS (
           SELECT 1
             FROM pass_product_tag_map ptm
             JOIN session_tag_map stm ON stm.tag_id = ptm.tag_id
            WHERE ptm.product_id = pp.id
              AND stm.session_id = $4
         )
         OR (
           NOT EXISTS (SELECT 1 FROM session_tag_map WHERE session_id = $4)
           AND (pp.applicable_sessions = 'all' OR pp.applicable_sessions LIKE $2)
         )
         OR (
           NOT EXISTS (SELECT 1 FROM pass_product_tag_map WHERE product_id = pp.id)
           AND (pp.applicable_sessions = 'all' OR pp.applicable_sessions LIKE $2)
         )
       )
     ORDER BY mp.expiry_date ASC
     LIMIT 1
  `, [memberId, `%${session.type}%`, todayStr, session.id]);
}

async function syncUpdatedPass(passId: string | null) {
  if (!passId) return;
  try {
    const updatedPass = await dbGet<any>(`
      SELECT mp.id, mp.member_id, mp.product_id,
             mp.total_count, mp.remaining_count,
             mp.start_date, mp.expiry_date, mp.issued_date,
             mp.price, mp.status, mp.paused_at,
             mp.payment_status, mp.payment_method, mp.payment_amount,
             mp.paid_at, mp.transaction_id, mp.discount_amount, mp.discount_reason,
             m.name AS member_name,
             pp.name AS product_name, pp.category
        FROM member_passes mp
        JOIN members m       ON mp.member_id = m.id
        JOIN pass_products pp ON mp.product_id = pp.id
       WHERE mp.id = $1
    `, [passId]);
    if (updatedPass) void safeSync('passes', 'upsert', mapPassRow(updatedPass));
  } catch { /* swallow */ }
}

async function deductCountPassIfNeeded(passId: string | null): Promise<number> {
  if (!passId) return 0;
  const pass = await dbGet<any>(`
    SELECT mp.*, pp.category
      FROM member_passes mp
      JOIN pass_products pp ON mp.product_id = pp.id
     WHERE mp.id = $1
  `, [passId]);
  if (!pass || pass.category !== 'count') return 0;
  if ((pass.remaining_count ?? 0) <= 0) throw new Error('NO_REMAINING_COUNT');
  await dbRun('UPDATE member_passes SET remaining_count = remaining_count - 1 WHERE id = $1', [passId]);
  await syncUpdatedPass(passId);
  return -1;
}

async function appendAttendanceSync(reservationId: string) {
  try {
    const enriched = await dbGet<any>(`
      SELECT r.id, r.member_id, r.session_id, r.status, r.checked_in_at, r.pass_id,
             m.name AS member_name,
             s.name AS session_name, s.date AS session_date,
             s.start_time AS session_start_time
        FROM reservations r
        JOIN members m  ON r.member_id  = m.id
        JOIN sessions s ON r.session_id = s.id
       WHERE r.id = $1
    `, [reservationId]);
    if (enriched) void safeSync('attendance', 'append', mapAttendanceRow(enriched));
  } catch { /* swallow */ }
}

// POST /api/qr/verify - Member scans QR to check in
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  // EXT-C2: Rate-limit verify attempts (replay/brute mitigation).
  // Field check-in often happens from one venue Wi-Fi/IP, so allow enough
  // legitimate scans while still blocking brute-force/replay loops.
  const rl = rateLimit(req, 'qr-verify', { windowMs: 60_000, max: 60 });
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
      id: string;
      name: string;
      type: string;
      start_time: string;
      end_time: string | null;
      date: string;
      status: string;
    }>(
      'SELECT id, name, type, start_time, end_time, date, status FROM sessions WHERE id = $1',
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
    const sessionDate = String(session.date).slice(0, 10);
    if (sessionDate !== todayKst) {
      return NextResponse.json(
        { error: '오늘 세션의 QR이 아닙니다' },
        { status: 400 }
      );
    }
    const sessionStart = new Date(`${sessionDate}T${session.start_time}:00+09:00`);
    const sessionEnd = session.end_time
      ? new Date(`${sessionDate}T${session.end_time}:00+09:00`)
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

    // Find any prior reservation state. If none exists, a valid pass can create
    // an attended walk-in reservation on site.
    const reservation = await dbGet<{ id: string; status: string; pass_id: string | null }>(
      `SELECT id, status, pass_id FROM reservations
        WHERE member_id = $1 AND session_id = $2
        ORDER BY CASE status
                   WHEN 'attended' THEN 1
                   WHEN 'reserved' THEN 2
                   WHEN 'cancelled' THEN 3
                   WHEN 'noshow' THEN 4
                   ELSE 5
                 END,
                 reserved_at DESC
        LIMIT 1`,
      [auth.memberId, sessionId]
    );

    if (reservation?.status === 'attended') {
      return NextResponse.json(
        { success: true, alreadyAttended: true, message: '이미 출석 처리되어 있습니다', sessionName: session.name, sessionTime: session.start_time },
      );
    }

    let reservationId = reservation?.id ?? '';
    let walkIn = false;
    let passDelta = 0;

    if (reservation?.status === 'reserved') {
      await dbRun(
        `UPDATE reservations SET status = 'attended', checked_in_at = COALESCE(checked_in_at, NOW()) WHERE id = $1`,
        [reservation.id]
      );
    } else if (reservation?.status === 'cancelled') {
      // cancelled is a non-deducted state. Restoring to attended consumes the
      // original pass again if it is count-based.
      passDelta = await deductCountPassIfNeeded(reservation.pass_id);
      await dbRun(
        `UPDATE reservations
            SET status = 'attended', checked_in_at = COALESCE(checked_in_at, NOW()), cancelled_at = NULL
          WHERE id = $1`,
        [reservation.id]
      );
    } else if (reservation?.status === 'noshow') {
      // Bulk no-show is intentionally penalty-based and does not refund count
      // passes, so do not double-deduct when the member is corrected on site.
      await dbRun(
        `UPDATE reservations SET status = 'attended', checked_in_at = COALESCE(checked_in_at, NOW()) WHERE id = $1`,
        [reservation.id]
      );
    } else {
      const pass = await findUsablePass(auth.memberId, session);
      if (!pass) {
        return NextResponse.json(
          { error: '예약이 없고 이 세션에 사용할 수 있는 수강권도 없습니다. 코치에게 현장 확인을 요청해주세요.' },
          { status: 400 }
        );
      }

      const newReservationId = genId('r');
      const inserted = await dbGet<{ id: string }>(
        `INSERT INTO reservations (id, member_id, session_id, status, reserved_at, checked_in_at, pass_id)
         VALUES ($1, $2, $3, 'attended', NOW(), NOW(), $4)
         ON CONFLICT (member_id, session_id, status) DO NOTHING
         RETURNING id`,
        [newReservationId, auth.memberId, sessionId, pass.id]
      );

      if (!inserted) {
        const existingAttended = await dbGet<{ id: string }>(
          `SELECT id FROM reservations
            WHERE member_id = $1 AND session_id = $2 AND status = 'attended'
            ORDER BY checked_in_at DESC NULLS LAST, reserved_at DESC
            LIMIT 1`,
          [auth.memberId, sessionId]
        );
        if (existingAttended) {
          return NextResponse.json(
            { success: true, alreadyAttended: true, message: '이미 출석 처리되어 있습니다', sessionName: session.name, sessionTime: session.start_time },
          );
        }
        throw new Error('WALK_IN_INSERT_CONFLICT');
      }

      reservationId = inserted.id;
      walkIn = true;

      if (pass.category === 'count') {
        await dbRun('UPDATE member_passes SET remaining_count = remaining_count - 1 WHERE id = $1', [pass.id]);
        await syncUpdatedPass(pass.id);
        passDelta = -1;
      }
    }

    await appendAttendanceSync(reservationId);

    return NextResponse.json({
      success: true,
      walkIn,
      passDelta,
      message: walkIn ? '현장 출석 확인! 예약 없이 수강권으로 바로 출석 처리되었습니다.' : '출석 확인!',
      sessionName: session.name,
      sessionTime: session.start_time,
    });
  } catch (error: any) {
    if (error?.message === 'NO_REMAINING_COUNT') {
      return NextResponse.json(
        { error: '수강권 잔여횟수가 부족합니다. 코치에게 현장 확인을 요청해주세요.' },
        { status: 409 }
      );
    }
    console.error('[qr/verify] error:', error);
    return NextResponse.json({ error: '출석 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}
