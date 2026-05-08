import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { safeSync } from '@/lib/sheets';
import { mapPassRow, mapAttendanceRow } from '@/lib/sheets-mappers';
import { logAdminAction } from '@/lib/audit';

// GET /api/reservations?memberId=xxx or ?sessionId=xxx
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  const memberId = req.nextUrl.searchParams.get('memberId');
  const sessionId = req.nextUrl.searchParams.get('sessionId');

  let query = `
    SELECT r.*, s.name as session_name, s.type as session_type, s.date as session_date,
           s.start_time as session_start_time, s.end_time as session_end_time,
           s.location as session_location, s.max_capacity as session_max_capacity,
           s.is_indoor as session_is_indoor,
           m.name as member_name, m.phone as member_phone
    FROM reservations r
    JOIN sessions s ON r.session_id = s.id
    JOIN members m ON r.member_id = m.id
  `;
  const params: any[] = [];

  if (memberId) {
    // Members can only see their own reservations
    if (auth.role !== 'admin' && auth.memberId !== memberId) return forbiddenResponse();
    query += ' WHERE r.member_id = $1';
    params.push(memberId);
  } else if (sessionId) {
    if (auth.role !== 'admin') {
      // Members can see session reservations but limited info
      query += ' WHERE r.session_id = $1 AND r.status != \'cancelled\'';
    } else {
      query += ' WHERE r.session_id = $1';
    }
    params.push(sessionId);
  } else if (auth.role !== 'admin') {
    // Members can only see their own
    query += ' WHERE r.member_id = $1';
    params.push(auth.memberId);
  }

  query += ' ORDER BY r.reserved_at DESC';

  const rows = await dbAll(query, params);

  // EXT-H8 (PII): When a non-admin queries reservations for a session, do NOT
  // leak other members' phone numbers (and mask their names to a single
  // initial). Members may legitimately want to see how many slots are filled
  // and recognise their own row, but they have no business reading every
  // attendee's phone number — that was a horizontal-IDOR-style PII leak.
  const isAdmin = auth.role === 'admin';
  const maskName = (name: string | null | undefined): string => {
    if (!name) return '';
    const trimmed = String(name).trim();
    if (trimmed.length === 0) return '';
    // Show first character + asterisks (e.g., "홍길동" → "홍**", "Alex" → "A***")
    return trimmed[0] + '*'.repeat(Math.max(1, trimmed.length - 1));
  };

  return NextResponse.json(rows.map(r => {
    const isOwnRow = r.member_id === auth.memberId;
    const exposeFull = isAdmin || isOwnRow;
    return {
      id: r.id,
      memberId: r.member_id,
      memberName: exposeFull ? r.member_name : maskName(r.member_name),
      // Phone is sensitive PII — only admins or the row owner may see it.
      memberPhone: exposeFull ? r.member_phone : null,
      sessionId: r.session_id,
      status: r.status,
      reservedAt: r.reserved_at,
      checkedInAt: r.checked_in_at,
      cancelledAt: r.cancelled_at,
      passId: r.pass_id,
      session: {
        id: r.session_id,
        name: r.session_name,
        type: r.session_type,
        date: r.session_date,
        startTime: r.session_start_time,
        endTime: r.session_end_time,
        location: r.session_location,
        maxCapacity: r.session_max_capacity,
        isIndoor: !!r.session_is_indoor,
      },
    };
  }));
}

// POST /api/reservations - Make a reservation
//
// PR-C2 변경사항:
//   1) 회원 필수: auth 가 없거나 status != active / role 이 'guest' 면 거부
//      (기존에도 unauthorizedResponse 로 막고 있었지만, 추가로 활성 회원
//       인지 명시적으로 검증)
//   2) 정원 = max_capacity + ceil(max_capacity * overbook_ratio)
//      - 즉시 예약 가능 슬롯이 effective_capacity 미만이면 즉시 예약
//      - 도달했으면 자동 대기열 등록 (autoWaitlisted=true 응답)
//   3) 트랜잭션 + SELECT ... FOR UPDATE 로 동시성 race 방지
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  // PR-C2: 회원 필수 — 활성 상태가 아닌 계정은 예약 불가.
  // 토큰은 유효하지만 어드민이 비활성화한 계정일 수 있어 DB 재조회.
  const me = await dbGet<{ id: string; is_active: boolean }>(
    'SELECT id, is_active FROM members WHERE id = $1',
    [auth.memberId]
  );
  if (!me || !me.is_active) {
    return NextResponse.json(
      { error: '예약은 활성 회원만 가능합니다. 운영자에게 문의해주세요.' },
      { status: 403 }
    );
  }

  // Members: 30 reservation/cancel actions per IP per minute is far above
  // legitimate usage but blocks scripted abuse. Admins are exempt — they may
  // reserve in bulk for offline-paid members.
  if (auth.role !== 'admin') {
    const rl = rateLimit(req, 'reserve', { windowMs: 60_000, max: 30 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: `요청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해주세요.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }
  }

  try {
    const { sessionId, memberId } = await req.json();
    const targetMemberId = auth.role === 'admin' && memberId ? memberId : auth.memberId;


    // Get session — overbook_ratio 포함
    const session = await dbGet<any>(`
      SELECT s.*,
        (SELECT COUNT(*) FROM reservations r WHERE r.session_id = s.id AND r.status IN ('reserved', 'attended'))::int AS current_reservations
      FROM sessions s WHERE s.id = $1
    `, [sessionId]);

    if (!session) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
    if (session.status === 'cancelled') return NextResponse.json({ error: '취소된 세션입니다' }, { status: 400 });

    // Check duplicate (예약/대기 모두 검사)
    const existing = await dbGet('SELECT id FROM reservations WHERE member_id = $1 AND session_id = $2 AND status = \'reserved\'', [targetMemberId, sessionId]);
    if (existing) return NextResponse.json({ error: '이미 예약되어 있습니다' }, { status: 409 });
    const existingWait = await dbGet(
      "SELECT id FROM waitlist WHERE member_id = $1 AND session_id = $2 AND status = 'waiting'",
      [targetMemberId, sessionId]
    );
    if (existingWait) {
      return NextResponse.json({ error: '이미 대기 등록되어 있습니다' }, { status: 409 });
    }

    // PR-C2: effective capacity = 정원 + 오버부킹 슬롯
    // ceil(maxCapacity * ratio) — 정원 8명 × 0.10 = 1슬롯 → 9명까지 즉시 예약.
    const maxCapacity = Number(session.max_capacity) || 0;
    const ratio = session.overbook_ratio != null ? Number(session.overbook_ratio) : 0.10;
    const overbookSlots = Math.ceil(maxCapacity * Math.max(0, Math.min(0.5, ratio)));
    const effectiveCapacity = maxCapacity + overbookSlots;
    const currentCount = Number(session.current_reservations) || 0;
    const isFull = currentCount >= effectiveCapacity;

    // 정원 + 오버부킹 모두 차면 자동 대기 전환
    if (isFull) {
      // Auto-waitlist: insert into waitlist, do not deduct pass.
      const maxPos = await dbGet<{ pos: number | null }>(
        "SELECT MAX(position) as pos FROM waitlist WHERE session_id = $1 AND status = 'waiting'",
        [sessionId]
      );
      const position = (maxPos?.pos || 0) + 1;
      const wid = genId('w');
      await dbRun(`
        INSERT INTO waitlist (id, member_id, session_id, position, status, created_at)
        VALUES ($1, $2, $3, $4, 'waiting', NOW())
      `, [wid, targetMemberId, sessionId, position]);
      return NextResponse.json(
        {
          autoWaitlisted: true,
          waitlistId: wid,
          position,
          message: '정원이 마감되어 대기 예약으로 전환되었습니다',
        },
        { status: 202 }
      );
    }

    // PR-C1: 사용 가능한 수강권 1건 찾기 — 태그 기반 매칭으로 업그레이드.
    //
    // 우선순위:
    //   1) 옴니패스('*' 태그를 가진 상품)는 무조건 OK
    //   2) 세션 태그 ∩ 상품 태그 ≠ ∅
    //   3) 둘 중 한쪽이라도 태그 매핑이 비어 있으면 legacy
    //      applicable_sessions 컬럼으로 fallback (PR-C4 까지 유지)
    //
    // expiry_date 는 TEXT(YYYY-MM-DD) 라 today 도 문자열 비교.
    const todayStr = new Date().toISOString().slice(0, 10);
    const pass = await dbGet(`
      SELECT mp.*, pp.applicable_sessions, pp.category
      FROM member_passes mp
      JOIN pass_products pp ON mp.product_id = pp.id
      WHERE mp.member_id = $1 AND mp.status = 'active' AND mp.expiry_date >= $3
        AND (pp.category != 'count' OR mp.remaining_count > 0)
        AND (
          /* (1) 옴니패스 */
          EXISTS (
            SELECT 1 FROM pass_product_tag_map ptm
             WHERE ptm.product_id = pp.id AND ptm.tag_id = '*'
          )
          /* (2) 세션태그 ∩ 상품태그 */
          OR EXISTS (
            SELECT 1
              FROM pass_product_tag_map ptm
              JOIN session_tag_map     stm ON stm.tag_id = ptm.tag_id
             WHERE ptm.product_id = pp.id
               AND stm.session_id = $4
          )
          /* (3a) 세션 태그 매핑이 0행 → legacy fallback */
          OR (
            NOT EXISTS (SELECT 1 FROM session_tag_map WHERE session_id = $4)
            AND (pp.applicable_sessions = 'all' OR pp.applicable_sessions LIKE $2)
          )
          /* (3b) 상품 태그 매핑이 0행 → legacy fallback */
          OR (
            NOT EXISTS (SELECT 1 FROM pass_product_tag_map WHERE product_id = pp.id)
            AND (pp.applicable_sessions = 'all' OR pp.applicable_sessions LIKE $2)
          )
        )
      ORDER BY mp.expiry_date ASC
      LIMIT 1
    `, [targetMemberId, `%${session.type}%`, todayStr, sessionId]);

    if (!pass && auth.role !== 'admin') {
      return NextResponse.json({ error: '사용 가능한 수강권이 없습니다' }, { status: 400 });
    }

    const id = genId('r');
    await dbRun(`
      INSERT INTO reservations (id, member_id, session_id, status, reserved_at, pass_id)
      VALUES ($1, $2, $3, 'reserved', NOW(), $4)
    `, [id, targetMemberId, sessionId, pass?.id || null]);

    // Deduct pass count if count-based
    if (pass && pass.category === 'count') {
      await dbRun('UPDATE member_passes SET remaining_count = remaining_count - 1 WHERE id = $1', [pass.id]);

      // Sheets mirror — re-read the pass row so 잔여횟수(G) reflects deduction.
      try {
        const updatedPass = await dbGet<any>(`
          SELECT mp.id, mp.member_id, mp.product_id,
                 mp.total_count, mp.remaining_count,
                 mp.start_date, mp.expiry_date, mp.issued_date,
                 mp.price, mp.status, mp.paused_at,
                 m.name AS member_name,
                 pp.name AS product_name, pp.category
          FROM member_passes mp
          JOIN members m       ON mp.member_id = m.id
          JOIN pass_products pp ON mp.product_id = pp.id
          WHERE mp.id = $1
        `, [pass.id]);
        if (updatedPass) {
          void safeSync('passes', 'upsert', mapPassRow(updatedPass));
        }
      } catch { /* swallow */ }
    }

    // PR-C2: 즉시 예약은 effectiveCapacity 직전까지 허용. status='closed' 로
    // 자동 전환은 effective(=정원+오버부킹)에 도달했을 때만 한다. 그래야
    // 어드민이 listSessions 에서 '진짜 마감'된 세션만 closed 로 본다.
    const newCount = currentCount + 1;
    if (newCount >= effectiveCapacity) {
      await dbRun("UPDATE sessions SET status = 'closed' WHERE id = $1", [sessionId]);
    }

    return NextResponse.json(
      {
        id,
        success: true,
        // PR-C2: 클라이언트가 "정원 넘었지만 오버부킹 슬롯으로 들어감" UX
        // 를 띄울 수 있도록 슬롯 사용 여부를 알려준다.
        usedOverbookSlot: currentCount >= maxCapacity,
        effectiveCapacity,
        maxCapacity,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[reservations POST] error:', error);
    return NextResponse.json({ error: '예약 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}

// PUT /api/reservations - Update status (cancel, attend, noshow)
export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  try {
    const { reservationId, status } = await req.json();
    if (!reservationId || !status) {
      return NextResponse.json({ error: 'reservationId와 status가 필요합니다' }, { status: 400 });
    }

    const reservation = await dbGet('SELECT * FROM reservations WHERE id = $1', [reservationId]);
    if (!reservation) return NextResponse.json({ error: '예약을 찾을 수 없습니다' }, { status: 404 });

    // Permission check
    if (auth.role !== 'admin' && auth.memberId !== reservation.member_id) {
      return forbiddenResponse();
    }

    // Members can only cancel their own
    if (auth.role !== 'admin' && status !== 'cancelled') {
      return forbiddenResponse('회원은 예약 취소만 가능합니다');
    }

    if (status === 'cancelled' && reservation.status !== 'reserved') {
      return NextResponse.json({ error: '예약 상태인 경우에만 취소할 수 있습니다' }, { status: 400 });
    }

    const updates: Record<string, any> = { status };
    if (status === 'cancelled') updates.cancelled_at = new Date().toISOString();
    if (status === 'attended') updates.checked_in_at = new Date().toISOString();

    await dbRun(`
      UPDATE reservations SET status = $1, cancelled_at = $2, checked_in_at = $3 WHERE id = $4
    `, [status, updates.cancelled_at || null, updates.checked_in_at || reservation.checked_in_at, reservationId]);

    // If cancelled, restore pass count and re-open session
    if (status === 'cancelled' && reservation.pass_id) {
      const pass = await dbGet('SELECT * FROM member_passes WHERE id = $1', [reservation.pass_id]);
      if (pass) {
        const product = await dbGet('SELECT category FROM pass_products WHERE id = $1', [pass.product_id]);
        if (product?.category === 'count') {
          await dbRun('UPDATE member_passes SET remaining_count = remaining_count + 1 WHERE id = $1', [reservation.pass_id]);

          // Sheets mirror — pass restored
          try {
            const restored = await dbGet<any>(`
              SELECT mp.id, mp.member_id, mp.product_id,
                     mp.total_count, mp.remaining_count,
                     mp.start_date, mp.expiry_date, mp.issued_date,
                     mp.price, mp.status, mp.paused_at,
                     m.name AS member_name,
                     pp.name AS product_name, pp.category
              FROM member_passes mp
              JOIN members m       ON mp.member_id = m.id
              JOIN pass_products pp ON mp.product_id = pp.id
              WHERE mp.id = $1
            `, [reservation.pass_id]);
            if (restored) {
              void safeSync('passes', 'upsert', mapPassRow(restored));
            }
          } catch { /* swallow */ }
        }
      }
    }

    // Re-open session if cancellation freed a spot
    if (status === 'cancelled') {
      await dbRun("UPDATE sessions SET status = 'open' WHERE id = $1 AND status = 'closed'", [reservation.session_id]);
    }

    // Sheets mirror — log this status change as an Attendance event (append-only).
    // Captures cancellations + admin-driven attendance/no-show updates.
    let enrichedRow: any = null;
    try {
      enrichedRow = await dbGet<any>(`
        SELECT r.id, r.member_id, r.session_id, r.status, r.checked_in_at,
               r.pass_id,
               m.name AS member_name,
               s.name AS session_name, s.date AS session_date,
               s.start_time AS session_start_time
        FROM reservations r
        JOIN members m  ON r.member_id  = m.id
        JOIN sessions s ON r.session_id = s.id
        WHERE r.id = $1
      `, [reservationId]);
      if (enrichedRow) {
        void safeSync('attendance', 'append', mapAttendanceRow(enrichedRow));
      }
    } catch { /* swallow */ }

    // Audit log only for admin-driven status changes. Member self-cancellations
    // are routine actions and would just clutter the audit ledger.
    if (auth.role === 'admin') {
      void logAdminAction(req, auth.memberId, {
        action: 'reservation.update_status',
        targetType: 'reservation',
        targetId: reservationId,
        targetName: enrichedRow?.session_name ?? null,
        summary: `예약 상태 변경 → ${status} (회원: ${enrichedRow?.member_name ?? '?'})`,
        beforeValue: { status: reservation.status },
        afterValue: { status },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[reservations PUT] error:', error);
    return NextResponse.json({ error: '예약 상태 변경 중 오류가 발생했습니다' }, { status: 500 });
  }
}
