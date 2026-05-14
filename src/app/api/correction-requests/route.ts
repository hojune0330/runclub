import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/audit';
import { safeSync } from '@/lib/sheets';
import { mapPassRow, mapAttendanceRow } from '@/lib/sheets-mappers';

// ─── PR-D1: Correction Requests (회원 셀프 정정 요청) ────────────────────
//
// 회원이 직접 처리할 수 없는 상황을 위한 요청 큐:
//   - 이미 출석/노쇼 확정되어 self-cancel 이 안 됨
//   - 마감 시간 경과로 self-cancel 불가
//   - QR 잘못 찍어서 다른 사람 출석으로 들어감
//
// SLA: 세션 시작 시각 + 48시간 이내에만 요청 가능 (사용자 결정사항)
//      그 외엔 직접 문의로 유도.

const REASON_CODES = [
  'attended_marked_noshow',
  'noshow_marked_attended',
  'want_cancel',
  'swapped_with_other',
  'other',
] as const;
type ReasonCode = typeof REASON_CODES[number];

const CORRECTION_WINDOW_HOURS = 48;

// 요청 코드를 승인 시 적용할 reservation status 로 매핑.
// other / swapped_with_other 는 자동 매핑이 모호하므로 관리자가 수동으로
// 결정 (인박스 UI 에서 드롭다운으로 표시).
const REASON_TO_STATUS: Record<ReasonCode, string | null> = {
  attended_marked_noshow: 'attended',  // 노쇼 표시 → 출석으로 복원
  noshow_marked_attended: 'noshow',    // 출석 표시 → 노쇼로 정정
  want_cancel: 'cancelled',            // 취소 요청 → 취소
  swapped_with_other: null,            // 수동 결정
  other: null,                          // 수동 결정
};

// ───────────────────────────────────────────────────────────────────────
// GET /api/correction-requests
//   - 관리자: 모든 요청 (?status=pending 으로 인박스만 필터링 가능)
//   - 회원: 본인 요청만
// ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  const statusFilter = req.nextUrl.searchParams.get('status');
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 100));

  const conditions: string[] = [];
  const params: any[] = [];

  if (auth.role !== 'admin') {
    params.push(auth.memberId);
    conditions.push(`cr.member_id = $${params.length}`);
  }
  if (statusFilter && ['pending', 'approved', 'rejected', 'withdrawn'].includes(statusFilter)) {
    params.push(statusFilter);
    conditions.push(`cr.status = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const rows = await dbAll<any>(
    `SELECT cr.*,
            m.name AS member_name, m.phone AS member_phone,
            s.name AS session_name, s.date AS session_date,
            s.start_time AS session_start_time, s.type AS session_type,
            r.status AS reservation_status,
            adm.name AS resolved_by_name
       FROM correction_requests cr
       JOIN members m   ON cr.member_id  = m.id
       JOIN sessions s  ON cr.session_id = s.id
       JOIN reservations r ON cr.reservation_id = r.id
  LEFT JOIN members adm ON cr.resolved_by = adm.id
       ${where}
       ORDER BY
         CASE cr.status WHEN 'pending' THEN 0 ELSE 1 END,
         cr.requested_at DESC
       LIMIT $${params.length}`,
    params
  );

  const isAdmin = auth.role === 'admin';
  return NextResponse.json({
    requests: rows.map(r => ({
      id: r.id,
      reservationId: r.reservation_id,
      memberId: r.member_id,
      memberName: r.member_name,
      memberPhone: isAdmin ? r.member_phone : null,
      sessionId: r.session_id,
      sessionName: r.session_name,
      sessionDate: r.session_date,
      sessionStartTime: r.session_start_time,
      sessionType: r.session_type,
      reservationStatus: r.reservation_status,
      reasonCode: r.reason_code,
      detail: r.detail,
      status: r.status,
      resolutionNote: r.resolution_note,
      appliedStatus: r.applied_status,
      requestedAt: r.requested_at,
      resolvedAt: r.resolved_at,
      resolvedBy: r.resolved_by,
      resolvedByName: r.resolved_by_name,
    })),
    pendingCount: rows.filter(r => r.status === 'pending').length,
  });
}

// ───────────────────────────────────────────────────────────────────────
// POST /api/correction-requests
//   회원/관리자 본인이 정정 요청 생성.
// Body: { reservationId, reasonCode, detail? }
// ───────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  // 도배 방지 — 10분에 5건까지
  const rl = rateLimit(req, 'correction', { windowMs: 10 * 60_000, max: 5 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    const body = await req.json();
    const { reservationId, reasonCode, detail } = body as {
      reservationId?: string;
      reasonCode?: string;
      detail?: string;
    };

    if (!reservationId || !reasonCode) {
      return NextResponse.json(
        { error: 'reservationId와 reasonCode가 필요합니다' },
        { status: 400 }
      );
    }
    if (!REASON_CODES.includes(reasonCode as ReasonCode)) {
      return NextResponse.json({ error: '유효하지 않은 요청 사유입니다' }, { status: 400 });
    }
    if (reasonCode === 'other' && (!detail || detail.trim().length < 5)) {
      return NextResponse.json(
        { error: '기타 사유는 상세 내용을 5자 이상 입력해주세요' },
        { status: 400 }
      );
    }
    if (detail && detail.length > 1000) {
      return NextResponse.json({ error: '상세 내용은 1000자 이내로 입력해주세요' }, { status: 400 });
    }

    const reservation = await dbGet<any>(
      `SELECT r.*, s.date AS s_date, s.start_time AS s_start, s.name AS s_name
         FROM reservations r
         JOIN sessions s ON r.session_id = s.id
        WHERE r.id = $1`,
      [reservationId]
    );
    if (!reservation) {
      return NextResponse.json({ error: '예약을 찾을 수 없습니다' }, { status: 404 });
    }

    // 본인 예약만 — 관리자도 본인 예약에 대해서만 직접 요청 (대리는 audit log 가 일반 액션에서 잡음)
    if (reservation.member_id !== auth.memberId) {
      return forbiddenResponse('본인의 예약에 대해서만 정정 요청할 수 있습니다');
    }

    // SLA 가드 — 세션 시작 +48h 이내
    const sessionStart = new Date(`${reservation.s_date}T${reservation.s_start}:00`);
    const deadline = new Date(sessionStart.getTime() + CORRECTION_WINDOW_HOURS * 3600 * 1000);
    if (new Date() > deadline) {
      return NextResponse.json(
        {
          error: `정정 요청 가능 기한이 지났습니다. (세션 시작 후 ${CORRECTION_WINDOW_HOURS}시간 이내) 운영자에게 직접 문의해주세요.`,
          code: 'CORRECTION_WINDOW_EXPIRED',
        },
        { status: 400 }
      );
    }

    // 동일 reservation 의 pending 요청 중복 방지는 UNIQUE INDEX 가 처리.
    // 사용자 친화적 메시지를 위해 미리 확인.
    const existing = await dbGet<any>(
      `SELECT id FROM correction_requests
        WHERE reservation_id = $1 AND status = 'pending'`,
      [reservationId]
    );
    if (existing) {
      return NextResponse.json(
        { error: '이미 처리 대기 중인 정정 요청이 있습니다', code: 'PENDING_EXISTS' },
        { status: 409 }
      );
    }

    const id = genId('cr');
    await dbRun(
      `INSERT INTO correction_requests
         (id, reservation_id, member_id, session_id, reason_code, detail, status, requested_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())`,
      [
        id,
        reservationId,
        auth.memberId,
        reservation.session_id,
        reasonCode,
        detail ? detail.trim() : null,
      ]
    );

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error: any) {
    console.error('[correction-requests POST] error:', error);
    return NextResponse.json(
      { error: '정정 요청 생성 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

// ───────────────────────────────────────────────────────────────────────
// PATCH /api/correction-requests
//   관리자: 승인(approve) / 거절(reject)
//   회원: 본인 요청 철회(withdraw)
// Body:
//   { id, action: 'approve', targetStatus?: 'reserved'|'attended'|'noshow'|'cancelled', note? }
//   { id, action: 'reject', note: string }
//   { id, action: 'withdraw' }
// ───────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  try {
    const body = await req.json();
    const { id, action, targetStatus, note } = body as {
      id?: string;
      action?: 'approve' | 'reject' | 'withdraw';
      targetStatus?: string;
      note?: string;
    };
    if (!id || !action) {
      return NextResponse.json({ error: 'id와 action이 필요합니다' }, { status: 400 });
    }

    const cr = await dbGet<any>(
      `SELECT cr.*, r.status AS reservation_status, r.pass_id,
              s.name AS session_name, s.date AS session_date,
              m.name AS member_name
         FROM correction_requests cr
         JOIN reservations r ON cr.reservation_id = r.id
         JOIN sessions s     ON cr.session_id = s.id
         JOIN members m      ON cr.member_id = m.id
        WHERE cr.id = $1`,
      [id]
    );
    if (!cr) {
      return NextResponse.json({ error: '정정 요청을 찾을 수 없습니다' }, { status: 404 });
    }
    if (cr.status !== 'pending') {
      return NextResponse.json(
        { error: '이미 처리된 요청입니다' },
        { status: 400 }
      );
    }

    // 회원 철회
    if (action === 'withdraw') {
      if (cr.member_id !== auth.memberId) {
        return forbiddenResponse();
      }
      await dbRun(
        `UPDATE correction_requests
            SET status = 'withdrawn', resolved_at = NOW(), resolved_by = $2
          WHERE id = $1`,
        [id, auth.memberId]
      );
      return NextResponse.json({ success: true });
    }

    // 이하 관리자 전용
    if (auth.role !== 'admin') return forbiddenResponse();

    if (action === 'reject') {
      if (!note || note.trim().length < 2) {
        return NextResponse.json(
          { error: '거절 사유는 2자 이상 입력해주세요' },
          { status: 400 }
        );
      }
      await dbRun(
        `UPDATE correction_requests
            SET status = 'rejected',
                resolution_note = $2,
                resolved_at = NOW(),
                resolved_by = $3
          WHERE id = $1`,
        [id, note.trim(), auth.memberId]
      );

      void logAdminAction(req, auth.memberId, {
        action: 'correction_request.reject',
        targetType: 'reservation',
        targetId: cr.reservation_id,
        targetName: cr.session_name,
        summary: `${cr.member_name} 회원의 정정 요청 거절 (사유: ${cr.reason_code})`,
        beforeValue: { reasonCode: cr.reason_code, detail: cr.detail },
        afterValue: { resolutionNote: note.trim() },
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'approve') {
      // 최종 적용할 status — 사유에 따라 자동 매핑 or 관리자 지정값
      const autoMapped = REASON_TO_STATUS[cr.reason_code as ReasonCode];
      const desired = (targetStatus && ['reserved', 'attended', 'noshow', 'cancelled'].includes(targetStatus))
        ? targetStatus
        : autoMapped;
      if (!desired) {
        return NextResponse.json(
          { error: '이 사유는 적용할 상태(targetStatus)를 지정해주세요' },
          { status: 400 }
        );
      }

      // 이미 그 상태라면 그냥 closed 처리
      const prevStatus = cr.reservation_status as 'reserved' | 'attended' | 'noshow' | 'cancelled';
      if (prevStatus === desired) {
        await dbRun(
          `UPDATE correction_requests
              SET status = 'approved',
                  applied_status = $2,
                  resolution_note = $3,
                  resolved_at = NOW(),
                  resolved_by = $4
            WHERE id = $1`,
          [id, desired, note?.trim() || '이미 해당 상태로 적용되어 있음', auth.memberId]
        );
        return NextResponse.json({ success: true, noop: true });
      }

      // ── 1) reservation 상태 전이 + 수강권 환원/차감 (PUT 핸들러와 동일 로직) ──
      const isDeducting = (s: string) => s === 'reserved' || s === 'attended';
      const wasDeducting = isDeducting(prevStatus);
      const willDeduct = isDeducting(desired);
      const needCharge = !wasDeducting && willDeduct;
      const needRestore = wasDeducting && !willDeduct;

      if (needCharge && cr.pass_id) {
        const pass = await dbGet<any>(
          `SELECT mp.*, pp.category
             FROM member_passes mp
             JOIN pass_products pp ON mp.product_id = pp.id
            WHERE mp.id = $1`,
          [cr.pass_id]
        );
        if (pass && pass.category === 'count' && (pass.remaining_count ?? 0) <= 0) {
          return NextResponse.json(
            {
              error: '회원의 수강권 잔여횟수가 부족합니다. 수강권 조정 후 다시 승인해주세요.',
              code: 'NO_REMAINING_COUNT',
            },
            { status: 409 }
          );
        }
      }

      const nowIso = new Date().toISOString();
      // 현재 reservation 의 checked_in_at / cancelled_at 도 함께 갱신
      const reservationRow = await dbGet<any>(
        'SELECT checked_in_at, cancelled_at FROM reservations WHERE id = $1',
        [cr.reservation_id]
      );
      const checkedInAt =
        desired === 'attended'
          ? (reservationRow?.checked_in_at || nowIso)
          : reservationRow?.checked_in_at;
      const cancelledAt =
        desired === 'cancelled'
          ? nowIso
          : (desired === 'reserved' ? null : reservationRow?.cancelled_at);

      await dbRun(
        `UPDATE reservations
            SET status = $1, cancelled_at = $2, checked_in_at = $3
          WHERE id = $4`,
        [desired, cancelledAt, checkedInAt, cr.reservation_id]
      );

      // 수강권 환원/차감
      if ((needCharge || needRestore) && cr.pass_id) {
        const pass = await dbGet<any>(
          `SELECT mp.*, pp.category
             FROM member_passes mp
             JOIN pass_products pp ON mp.product_id = pp.id
            WHERE mp.id = $1`,
          [cr.pass_id]
        );
        if (pass && pass.category === 'count') {
          const delta = needRestore ? 1 : -1;
          await dbRun(
            'UPDATE member_passes SET remaining_count = remaining_count + $1 WHERE id = $2',
            [delta, cr.pass_id]
          );

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
              [cr.pass_id]
            );
            if (updatedPass) {
              void safeSync('passes', 'upsert', mapPassRow(updatedPass));
            }
          } catch { /* swallow */ }
        }
      }

      // 세션 마감/재오픈
      if (needRestore) {
        await dbRun(
          "UPDATE sessions SET status = 'open' WHERE id = $1 AND status = 'closed'",
          [cr.session_id]
        );
      } else if (needCharge) {
        const sess = await dbGet<any>(
          `SELECT s.max_capacity, s.overbook_ratio,
                  (SELECT COUNT(*) FROM reservations r
                    WHERE r.session_id = s.id AND r.status IN ('reserved','attended'))::int AS cnt
             FROM sessions s WHERE s.id = $1`,
          [cr.session_id]
        );
        if (sess) {
          const maxCap = Number(sess.max_capacity) || 0;
          const ratio = sess.overbook_ratio != null ? Number(sess.overbook_ratio) : 0.10;
          const eff = maxCap + Math.ceil(maxCap * Math.max(0, Math.min(0.5, ratio)));
          if (sess.cnt >= eff) {
            await dbRun("UPDATE sessions SET status = 'closed' WHERE id = $1", [cr.session_id]);
          }
        }
      }

      // Attendance 시트 미러
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
        `, [cr.reservation_id]);
        if (enriched) void safeSync('attendance', 'append', mapAttendanceRow(enriched));
      } catch { /* swallow */ }

      // ── 2) 정정 요청 close ──
      await dbRun(
        `UPDATE correction_requests
            SET status = 'approved',
                applied_status = $2,
                resolution_note = $3,
                resolved_at = NOW(),
                resolved_by = $4
          WHERE id = $1`,
        [id, desired, note?.trim() || null, auth.memberId]
      );

      void logAdminAction(req, auth.memberId, {
        action: 'correction_request.approve',
        targetType: 'reservation',
        targetId: cr.reservation_id,
        targetName: cr.session_name,
        summary: `${cr.member_name} 회원 정정 요청 승인: ${prevStatus} → ${desired}`,
        beforeValue: { status: prevStatus, reasonCode: cr.reason_code, detail: cr.detail },
        afterValue: { status: desired, passDelta: needRestore ? +1 : needCharge ? -1 : 0 },
      });

      return NextResponse.json({
        success: true,
        previousStatus: prevStatus,
        status: desired,
        passDelta: needRestore ? +1 : needCharge ? -1 : 0,
      });
    }

    return NextResponse.json({ error: '유효하지 않은 action 입니다' }, { status: 400 });
  } catch (error: any) {
    console.error('[correction-requests PATCH] error:', error);
    return NextResponse.json(
      { error: '정정 요청 처리 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
