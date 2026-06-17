import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { safeSync } from '@/lib/sheets';
import { mapAttendanceRow, mapPassRow } from '@/lib/sheets-mappers';
import { logAdminAction } from '@/lib/audit';

type ExistingReservation = {
  id: string;
  status: 'reserved' | 'attended' | 'noshow' | 'cancelled';
  pass_id: string | null;
  checked_in_at: string | null;
};

type SessionRow = {
  id: string;
  name: string;
  type: string;
  date: string;
  start_time: string;
  end_time: string | null;
  status: string;
};

type MemberRow = {
  id: string;
  name: string;
  phone: string;
  is_active: boolean;
};

function normalizeDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function compactName(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, '');
}

async function findMember(name: string, phoneDigits: string): Promise<{ member?: MemberRow; ambiguous?: boolean }> {
  const nameKey = compactName(name);
  if (!nameKey) return {};

  // Phone is optional. When at least 4 digits are provided we narrow by phone
  // (full match if >= 8 digits, otherwise last-4). When phone is omitted we
  // match by name alone and rely on the ambiguous fallback to ask for a phone
  // only when more than one member shares the name.
  const hasPhone = phoneDigits.length >= 4;
  const phoneClause = hasPhone
    ? (phoneDigits.length >= 8
        ? `AND regexp_replace(phone, '\\D', '', 'g') = $2`
        : `AND right(regexp_replace(phone, '\\D', '', 'g'), 4) = $2`)
    : '';

  const params: string[] = [nameKey];
  if (hasPhone) params.push(phoneDigits.length >= 8 ? phoneDigits : phoneDigits.slice(-4));

  const rows = await dbGet<{ items: MemberRow[] }>(
    `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) AS items
       FROM (
         SELECT id, name, phone, is_active
           FROM members
          WHERE regexp_replace(name, '\\s+', '', 'g') = $1
            ${phoneClause}
          ORDER BY is_active DESC, created_at DESC
          LIMIT 3
       ) t`,
    params
  );

  const items = rows?.items ?? [];
  if (items.length === 1) return { member: items[0] };
  if (items.length > 1) return { ambiguous: true };
  return {};
}

async function findUsablePass(memberId: string, session: SessionRow) {
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

async function syncAttendance(reservationId: string) {
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
    return enriched;
  } catch {
    return null;
  }
}

async function maybeDeductCountPass(passId: string | null): Promise<number> {
  if (!passId) return 0;
  const pass = await dbGet<any>(`
    SELECT mp.*, pp.category
      FROM member_passes mp
      JOIN pass_products pp ON mp.product_id = pp.id
     WHERE mp.id = $1
  `, [passId]);

  if (!pass || pass.category !== 'count') return 0;
  if ((pass.remaining_count ?? 0) <= 0) {
    throw new Error('NO_REMAINING_COUNT');
  }

  await dbRun('UPDATE member_passes SET remaining_count = remaining_count - 1 WHERE id = $1', [passId]);
  await syncUpdatedPass(passId);
  return -1;
}

// POST /api/attendance/checkin - Admin/tablet field check-in by member name
// (phone optional; required only as a fallback to disambiguate same-name members).
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const body = await req.json();
    const sessionId = String(body?.sessionId ?? '').trim();
    const name = String(body?.name ?? '').trim();
    const phoneDigits = normalizeDigits(body?.phone);
    const allowWalkIn = body?.allowWalkIn === true;
    const skipPass = body?.skipPass === true;

    if (!sessionId || !name) {
      return NextResponse.json(
        { error: '세션과 이름을 입력해주세요.' },
        { status: 400 }
      );
    }

    const session = await dbGet<SessionRow>(
      'SELECT id, name, type, date, start_time, end_time, status FROM sessions WHERE id = $1',
      [sessionId]
    );
    if (!session) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
    if (session.status === 'cancelled') {
      return NextResponse.json({ error: '취소된 세션은 출석 처리할 수 없습니다' }, { status: 400 });
    }

    const found = await findMember(name, phoneDigits);
    if (found.ambiguous) {
      const ambiguousMessage = phoneDigits.length >= 4
        ? '동명이인/연락처 중복 후보가 있습니다. 연락처 전체 번호를 입력해주세요.'
        : '같은 이름의 회원이 여러 명입니다. 연락처(뒤 4자리 이상)를 함께 입력해주세요.';
      return NextResponse.json(
        { error: ambiguousMessage, code: 'AMBIGUOUS_MEMBER' },
        { status: 409 }
      );
    }
    if (!found.member) {
      const notFoundMessage = phoneDigits.length >= 4
        ? '일치하는 회원을 찾지 못했습니다. 이름과 연락처를 확인해주세요.'
        : '일치하는 회원을 찾지 못했습니다. 이름을 확인하거나 연락처를 함께 입력해주세요.';
      return NextResponse.json(
        { error: notFoundMessage, code: 'MEMBER_NOT_FOUND' },
        { status: 404 }
      );
    }
    if (!found.member.is_active) {
      return NextResponse.json(
        { error: '비활성 회원입니다. 관리자 화면에서 회원 상태를 확인해주세요.', code: 'INACTIVE_MEMBER' },
        { status: 403 }
      );
    }

    const member = found.member;
    const existing = await dbGet<ExistingReservation>(
      `SELECT id, status, pass_id, checked_in_at
         FROM reservations
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
      [member.id, sessionId]
    );

    let reservationId = existing?.id ?? '';
    let source: 'reserved_to_attended' | 'already_attended' | 'restored_cancelled' | 'restored_noshow' | 'walk_in' = 'walk_in';
    let passDelta = 0;
    let passId = existing?.pass_id ?? null;

    if (existing?.status === 'attended') {
      source = 'already_attended';
    } else if (existing?.status === 'reserved') {
      source = 'reserved_to_attended';
      await dbRun(
        `UPDATE reservations
            SET status = 'attended', checked_in_at = COALESCE(checked_in_at, NOW())
          WHERE id = $1`,
        [existing.id]
      );
    } else if (existing?.status === 'cancelled') {
      source = 'restored_cancelled';
      passDelta = await maybeDeductCountPass(existing.pass_id);
      await dbRun(
        `UPDATE reservations
            SET status = 'attended', checked_in_at = COALESCE(checked_in_at, NOW()), cancelled_at = NULL
          WHERE id = $1`,
        [existing.id]
      );
    } else if (existing?.status === 'noshow') {
      // Bulk no-show intentionally does not refund count passes, so avoid double deduction.
      source = 'restored_noshow';
      await dbRun(
        `UPDATE reservations
            SET status = 'attended', checked_in_at = COALESCE(checked_in_at, NOW())
          WHERE id = $1`,
        [existing.id]
      );
    } else {
      if (!allowWalkIn) {
        return NextResponse.json(
          { error: '이 세션에 예약이 없습니다. 현장 추가를 허용한 뒤 다시 처리해주세요.', code: 'NO_RESERVATION' },
          { status: 409 }
        );
      }

      const pass = skipPass ? null : await findUsablePass(member.id, session);
      if (!pass && !skipPass) {
        return NextResponse.json(
          { error: '예약이 없고 사용 가능한 수강권도 없습니다. 관리자 무료 처리 옵션이 필요한지 확인해주세요.', code: 'NO_USABLE_PASS' },
          { status: 409 }
        );
      }

      reservationId = genId('r');
      passId = pass?.id ?? null;
      await dbRun(
        `INSERT INTO reservations (id, member_id, session_id, status, reserved_at, checked_in_at, pass_id)
         VALUES ($1, $2, $3, 'attended', NOW(), NOW(), $4)`,
        [reservationId, member.id, sessionId, passId]
      );

      if (pass && pass.category === 'count') {
        await dbRun('UPDATE member_passes SET remaining_count = remaining_count - 1 WHERE id = $1', [pass.id]);
        await syncUpdatedPass(pass.id);
        passDelta = -1;
      }
    }

    const enriched = reservationId ? await syncAttendance(reservationId) : null;

    void logAdminAction(req, auth.memberId, {
      action: 'attendance.field_checkin',
      targetType: 'reservation',
      targetId: reservationId || existing?.id || null,
      targetName: session.name,
      summary: `${member.name} 현장 출석 처리 (${session.name} ${session.date} ${session.start_time})`,
      beforeValue: existing ? { status: existing.status } : null,
      afterValue: {
        status: 'attended',
        source,
        memberId: member.id,
        sessionId,
        passId,
        passDelta,
        allowWalkIn,
        skipPass,
      },
    });

    return NextResponse.json({
      success: true,
      alreadyAttended: source === 'already_attended',
      source,
      passDelta,
      member: { id: member.id, name: member.name, phone: member.phone },
      session: { id: session.id, name: session.name, date: session.date, startTime: session.start_time },
      reservationId: reservationId || existing?.id,
      checkedInAt: enriched?.checked_in_at ?? existing?.checked_in_at ?? new Date().toISOString(),
      message: source === 'already_attended' ? '이미 출석 처리되어 있습니다.' : '출석 처리되었습니다.',
    });
  } catch (error: any) {
    if (error?.message === 'NO_REMAINING_COUNT') {
      return NextResponse.json(
        { error: '수강권 잔여횟수가 부족합니다. 수강권을 조정한 뒤 다시 시도해주세요.', code: 'NO_REMAINING_COUNT' },
        { status: 409 }
      );
    }
    console.error('[attendance/checkin] error:', error);
    return NextResponse.json({ error: '현장 출석 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}
