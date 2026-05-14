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
    // PR-D1: `force=true` (관리자 전용) — 정원 초과 + 수강권 없음 우회.
    // `skipPass=true` (관리자 전용) — 수강권 차감 없이 무료/관리자 메모 처리.
    // `initialStatus` (관리자 전용) — 'reserved' | 'attended' 즉시 출석 표시 가능.
    const { sessionId, memberId, force, skipPass, initialStatus } = await req.json();
    const targetMemberId = auth.role === 'admin' && memberId ? memberId : auth.memberId;
    const isAdminForce = auth.role === 'admin' && (force === true);
    const isAdminSkipPass = auth.role === 'admin' && (skipPass === true);
    const startStatus: 'reserved' | 'attended' =
      auth.role === 'admin' && initialStatus === 'attended' ? 'attended' : 'reserved';


    // Get session — overbook_ratio 포함
    const session = await dbGet<any>(`
      SELECT s.*,
        (SELECT COUNT(*) FROM reservations r WHERE r.session_id = s.id AND r.status IN ('reserved', 'attended'))::int AS current_reservations
      FROM sessions s WHERE s.id = $1
    `, [sessionId]);

    if (!session) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
    if (session.status === 'cancelled' && !isAdminForce) {
      return NextResponse.json({ error: '취소된 세션입니다' }, { status: 400 });
    }

    // Check duplicate (예약/대기 모두 검사) — 단, 취소/노쇼 이력은 OK
    const existing = await dbGet(
      `SELECT id FROM reservations
        WHERE member_id = $1 AND session_id = $2
          AND status IN ('reserved','attended')`,
      [targetMemberId, sessionId]
    );
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

    // 정원 + 오버부킹 모두 차면 자동 대기 전환 — 단, 관리자 force 면 강제 추가
    if (isFull && !isAdminForce) {
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

    // 수강권 검증 — 관리자가 skipPass=true 면 무시.
    if (!pass && auth.role !== 'admin') {
      return NextResponse.json({ error: '사용 가능한 수강권이 없습니다' }, { status: 400 });
    }
    // 관리자 force 인데 skipPass 미명시 + pass 없음 → 차감할 패스 없음 (무료 처리로 간주).
    const usePass = !isAdminSkipPass && pass ? pass : null;

    const id = genId('r');
    await dbRun(`
      INSERT INTO reservations (id, member_id, session_id, status, reserved_at, checked_in_at, pass_id)
      VALUES ($1, $2, $3, $4, NOW(), $5, $6)
    `, [
      id,
      targetMemberId,
      sessionId,
      startStatus,
      startStatus === 'attended' ? new Date().toISOString() : null,
      usePass?.id || null,
    ]);

    // Deduct pass count if count-based
    if (usePass && usePass.category === 'count') {
      await dbRun('UPDATE member_passes SET remaining_count = remaining_count - 1 WHERE id = $1', [usePass.id]);

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
        `, [usePass.id]);
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

    // PR-D1: 관리자 강제 추가는 audit log 기록 (자기 예약은 routine action 이라 패스)
    if (auth.role === 'admin' && targetMemberId !== auth.memberId) {
      try {
        const target = await dbGet<any>(
          'SELECT name FROM members WHERE id = $1',
          [targetMemberId]
        );
        void logAdminAction(req, auth.memberId, {
          action: 'reservation.force_add',
          targetType: 'reservation',
          targetId: id,
          targetName: session.name,
          summary: `${target?.name ?? '?'} 회원을 ${session.name}(${session.date}) 에 ${startStatus === 'attended' ? '출석' : '예약'}으로 추가${isAdminForce ? ' (정원 초과 강제)' : ''}${isAdminSkipPass ? ' (수강권 미차감)' : ''}`,
          afterValue: {
            memberId: targetMemberId,
            sessionId,
            status: startStatus,
            force: isAdminForce,
            skipPass: isAdminSkipPass,
            passId: usePass?.id ?? null,
          },
        });
      } catch { /* swallow */ }
    }

    return NextResponse.json(
      {
        id,
        success: true,
        status: startStatus,
        // PR-C2: 클라이언트가 "정원 넘었지만 오버부킹 슬롯으로 들어감" UX
        // 를 띄울 수 있도록 슬롯 사용 여부를 알려준다.
        usedOverbookSlot: currentCount >= maxCapacity,
        forcedByAdmin: isAdminForce,
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

// PUT /api/reservations - Update status (cancel, attend, noshow, restore)
//
// PR-D1: 관리자가 모든 상태 전이를 자유롭게 할 수 있도록 확장.
// 회원은 여전히 본인 예약을 reserved → cancelled 만 가능.
// 관리자는 전이 행렬:
//
//     to →   reserved   attended   noshow   cancelled
//   from
//   reserved   —         OK         OK        OK
//   attended   OK*       —          OK        OK*
//   noshow     OK*       OK         —         OK
//   cancelled  OK*       OK*        OK*       —
//
//   * = 수강권 자동 환원/차감 발생 (count 형 패스만)
//
// 수강권 환원 규칙 (사용자 결정사항):
//   - 출석/예약 상태(=수강권 차감된 상태) → 비차감 상태(noshow/cancelled): +1 환원
//   - 비차감 상태(noshow/cancelled) → 출석/예약 상태: -1 차감 (잔여 0이면 거부)
//
// 비차감 카테고리: noshow / cancelled  (노쇼는 패널티성. 회원이 셀프 정정
//   요청해서 출석으로 바꾸면 그때 -1 차감되는 게 맞음)
// 차감 카테고리: reserved / attended
export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  try {
    const { reservationId, status } = await req.json();
    if (!reservationId || !status) {
      return NextResponse.json({ error: 'reservationId와 status가 필요합니다' }, { status: 400 });
    }

    const validStatuses = ['reserved', 'attended', 'noshow', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: '유효하지 않은 상태입니다' }, { status: 400 });
    }

    const reservation = await dbGet<any>('SELECT * FROM reservations WHERE id = $1', [reservationId]);
    if (!reservation) return NextResponse.json({ error: '예약을 찾을 수 없습니다' }, { status: 404 });

    // Permission check
    if (auth.role !== 'admin' && auth.memberId !== reservation.member_id) {
      return forbiddenResponse();
    }

    // Members can only cancel their own (and only from reserved state)
    if (auth.role !== 'admin') {
      if (status !== 'cancelled') {
        return forbiddenResponse('회원은 예약 취소만 가능합니다');
      }
      if (reservation.status !== 'reserved') {
        return NextResponse.json(
          { error: '예약 상태인 경우에만 취소할 수 있습니다. 그 외엔 정정 요청을 이용해주세요.' },
          { status: 400 }
        );
      }
    }

    // 변경 없음 — no-op
    if (reservation.status === status) {
      return NextResponse.json({ success: true, noop: true });
    }

    const prevStatus = reservation.status as 'reserved' | 'attended' | 'noshow' | 'cancelled';
    const nextStatus = status as 'reserved' | 'attended' | 'noshow' | 'cancelled';

    // 패스 차감 카테고리 정의
    const isDeducting = (s: string) => s === 'reserved' || s === 'attended';
    const wasDeducting = isDeducting(prevStatus);
    const willDeduct = isDeducting(nextStatus);

    // 차감 방향으로 전이할 때(=수강권 -1), 잔여횟수 사전 검증.
    let needCharge = !wasDeducting && willDeduct;
    let needRestore = wasDeducting && !willDeduct;

    if (needCharge && reservation.pass_id) {
      const pass = await dbGet<any>(
        `SELECT mp.*, pp.category
           FROM member_passes mp
           JOIN pass_products pp ON mp.product_id = pp.id
          WHERE mp.id = $1`,
        [reservation.pass_id]
      );
      if (pass && pass.category === 'count' && (pass.remaining_count ?? 0) <= 0) {
        return NextResponse.json(
          {
            error: '수강권 잔여횟수가 부족합니다. 관리자에게 문의해 수강권을 연장/조정해주세요.',
            code: 'NO_REMAINING_COUNT',
          },
          { status: 409 }
        );
      }
    }

    // UPDATE — checked_in_at / cancelled_at 도 맥락에 맞게 갱신
    const nowIso = new Date().toISOString();
    const checkedInAt =
      nextStatus === 'attended'
        ? (reservation.checked_in_at || nowIso)
        : reservation.checked_in_at; // 다른 상태로 가도 기존 값 보존(이력 가치)
    const cancelledAt =
      nextStatus === 'cancelled'
        ? nowIso
        : (nextStatus === 'reserved' ? null : reservation.cancelled_at);

    await dbRun(
      `UPDATE reservations
          SET status = $1,
              cancelled_at = $2,
              checked_in_at = $3
        WHERE id = $4`,
      [nextStatus, cancelledAt, checkedInAt, reservationId]
    );

    // 수강권 환원/차감 (count 형 패스만)
    if ((needCharge || needRestore) && reservation.pass_id) {
      const pass = await dbGet<any>(
        `SELECT mp.*, pp.category
           FROM member_passes mp
           JOIN pass_products pp ON mp.product_id = pp.id
          WHERE mp.id = $1`,
        [reservation.pass_id]
      );
      if (pass && pass.category === 'count') {
        const delta = needRestore ? 1 : -1;
        await dbRun(
          'UPDATE member_passes SET remaining_count = remaining_count + $1 WHERE id = $2',
          [delta, reservation.pass_id]
        );

        // Sheets mirror — 잔여횟수 변동
        try {
          const updatedPass = await dbGet<any>(
            `SELECT mp.id, mp.member_id, mp.product_id,
                    mp.total_count, mp.remaining_count,
                    mp.start_date, mp.expiry_date, mp.issued_date,
                    mp.price, mp.status, mp.paused_at,
                    m.name AS member_name,
                    pp.name AS product_name, pp.category
               FROM member_passes mp
               JOIN members m       ON mp.member_id = m.id
               JOIN pass_products pp ON mp.product_id = pp.id
              WHERE mp.id = $1`,
            [reservation.pass_id]
          );
          if (updatedPass) {
            void safeSync('passes', 'upsert', mapPassRow(updatedPass));
          }
        } catch { /* swallow */ }
      }
    }

    // 세션 마감/재오픈 자동 처리
    // - 차감 상태 → 비차감: 정원에서 1슬롯 비워졌으므로 closed → open 으로 복귀
    // - 비차감 → 차감 상태: 정원 다시 차오를 수 있음. 정원 도달했으면 closed.
    if (needRestore) {
      await dbRun(
        "UPDATE sessions SET status = 'open' WHERE id = $1 AND status = 'closed'",
        [reservation.session_id]
      );
    } else if (needCharge) {
      const sess = await dbGet<any>(
        `SELECT s.max_capacity, s.overbook_ratio,
                (SELECT COUNT(*) FROM reservations r
                  WHERE r.session_id = s.id AND r.status IN ('reserved','attended'))::int AS cnt
           FROM sessions s WHERE s.id = $1`,
        [reservation.session_id]
      );
      if (sess) {
        const maxCap = Number(sess.max_capacity) || 0;
        const ratio = sess.overbook_ratio != null ? Number(sess.overbook_ratio) : 0.10;
        const eff = maxCap + Math.ceil(maxCap * Math.max(0, Math.min(0.5, ratio)));
        if (sess.cnt >= eff) {
          await dbRun("UPDATE sessions SET status = 'closed' WHERE id = $1", [reservation.session_id]);
        }
      }
    }

    // Sheets mirror — 모든 상태 변동을 attendance 이벤트로 append
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

    // Audit log only for admin-driven status changes.
    if (auth.role === 'admin') {
      void logAdminAction(req, auth.memberId, {
        action: 'reservation.update_status',
        targetType: 'reservation',
        targetId: reservationId,
        targetName: enrichedRow?.session_name ?? null,
        summary: `예약 상태 변경 ${prevStatus} → ${nextStatus} (회원: ${enrichedRow?.member_name ?? '?'})`,
        beforeValue: { status: prevStatus },
        afterValue: {
          status: nextStatus,
          passDelta: needRestore ? +1 : needCharge ? -1 : 0,
        },
      });
    }

    return NextResponse.json({
      success: true,
      previousStatus: prevStatus,
      status: nextStatus,
      passDelta: needRestore ? +1 : needCharge ? -1 : 0,
    });
  } catch (error: any) {
    console.error('[reservations PUT] error:', error);
    return NextResponse.json({ error: '예약 상태 변경 중 오류가 발생했습니다' }, { status: 500 });
  }
}
