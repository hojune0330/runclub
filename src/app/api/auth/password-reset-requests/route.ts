import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { dbAll, dbGet, dbRun, dbTx, ensureSchema, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { normalizePhone, validateName, validateText } from '@/lib/validation';

const GENERIC_RESET_MESSAGE =
  '요청이 접수되었습니다. 가입 정보가 확인되면 관리자가 임시 비밀번호를 발급해 안내드립니다.';

function generateTempPassword(): string {
  // Avoid visually ambiguous characters (0/O, 1/l/I) for hand-off readability.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  if (!/\d/.test(out)) out = out.slice(0, -1) + '7';
  if (!/[A-Za-z]/.test(out)) out = 'A' + out.slice(1);
  return out;
}

function mapRow(r: any) {
  return {
    id: r.id,
    memberId: r.member_id,
    memberName: r.member_name,
    memberPhone: r.member_phone,
    memberRole: r.member_role,
    memberIsActive: r.member_is_active,
    requestName: r.request_name,
    requestPhone: r.request_phone,
    requesterNote: r.requester_note,
    status: r.status,
    requestedAt: r.requested_at,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    resolvedByName: r.resolved_by_name,
    resolutionNote: r.resolution_note,
  };
}

// GET /api/auth/password-reset-requests
// 관리자 전용: 로그인 불가 회원이 제출한 비밀번호 재설정 요청 인박스.
export async function GET(req: NextRequest) {
  await ensureSchema();
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const status = req.nextUrl.searchParams.get('status');
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 100));
  const params: any[] = [];
  let where = '';
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    params.push(status);
    where = `WHERE pr.status = $${params.length}`;
  }
  params.push(limit);

  const rows = await dbAll<any>(
    `SELECT pr.*,
            m.name AS member_name,
            m.phone AS member_phone,
            m.role AS member_role,
            m.is_active AS member_is_active,
            adm.name AS resolved_by_name
       FROM password_reset_requests pr
       JOIN members m ON pr.member_id = m.id
  LEFT JOIN members adm ON pr.resolved_by = adm.id
       ${where}
       ORDER BY CASE pr.status WHEN 'pending' THEN 0 ELSE 1 END,
                pr.requested_at DESC
       LIMIT $${params.length}`,
    params
  );

  return NextResponse.json({
    requests: rows.map(mapRow),
    pendingCount: rows.filter(r => r.status === 'pending').length,
  });
}

// POST /api/auth/password-reset-requests
// 공개 엔드포인트: 이름+휴대폰으로 재설정 도움 요청. 계정 존재 여부는 응답으로 노출하지 않는다.
export async function POST(req: NextRequest) {
  await ensureSchema();

  const ipLimit = rateLimit(req, 'password-reset-request-ip', { windowMs: 60_000, max: 60 });
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${ipLimit.retryAfterSec}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSec) } }
    );
  }

  try {
    const body = await req.json();
    const nameCheck = validateName(body?.name);
    const phone = normalizePhone(body?.phone);
    const noteCheck = validateText(body?.note, { max: 300, field: '요청 메모' });

    if (!nameCheck.ok) return NextResponse.json({ error: nameCheck.message }, { status: 400 });
    if (!phone) return NextResponse.json({ error: '휴대폰 번호 형식이 올바르지 않습니다' }, { status: 400 });
    if (!noteCheck.ok) return NextResponse.json({ error: noteCheck.message }, { status: 400 });

    const phoneLimit = rateLimit(req, 'password-reset-request-phone', {
      windowMs: 10 * 60_000,
      max: 5,
      extraKey: phone,
    });
    if (!phoneLimit.ok) {
      return NextResponse.json(
        { error: `요청이 너무 많습니다. ${phoneLimit.retryAfterSec}초 후 다시 시도해주세요.` },
        { status: 429, headers: { 'Retry-After': String(phoneLimit.retryAfterSec) } }
      );
    }

    const member = await dbGet<{ id: string; name: string; phone: string; is_active: boolean }>(
      `SELECT id, name, phone, is_active
         FROM members
        WHERE phone = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))
        LIMIT 1`,
      [phone, nameCheck.value]
    );

    // Enumeration 방지: 정보가 맞지 않거나 비활성 계정이어도 동일 성공 응답.
    if (!member || !member.is_active) {
      return NextResponse.json({ success: true, message: GENERIC_RESET_MESSAGE });
    }

    const existing = await dbGet<{ id: string }>(
      `SELECT id FROM password_reset_requests
        WHERE member_id = $1 AND status = 'pending'
        LIMIT 1`,
      [member.id]
    );

    if (existing) {
      await dbRun(
        `UPDATE password_reset_requests
            SET request_name = $2,
                request_phone = $3,
                requester_note = $4,
                requested_at = NOW()
          WHERE id = $1`,
        [existing.id, nameCheck.value, phone, noteCheck.value ?? null]
      );
    } else {
      await dbRun(
        `INSERT INTO password_reset_requests
           (id, member_id, request_name, request_phone, requester_note, status, requested_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
        [genId('prr'), member.id, nameCheck.value, phone, noteCheck.value ?? null]
      );
    }

    return NextResponse.json({ success: true, message: GENERIC_RESET_MESSAGE });
  } catch (error: any) {
    console.error('[password-reset-requests POST] error:', error?.message ?? error);
    // 실패 세부 정보를 공개하지 않는다. 사용자는 운영자 문의 경로로 이어지면 충분하다.
    return NextResponse.json({ success: true, message: GENERIC_RESET_MESSAGE });
  }
}

// PATCH /api/auth/password-reset-requests
// 관리자 전용: approve → 임시 비밀번호 발급 + 강제 변경, reject → 요청 종료.
export async function PATCH(req: NextRequest) {
  await ensureSchema();
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const body = await req.json();
    const { id, action, note } = body as {
      id?: string;
      action?: 'approve' | 'reject';
      note?: string;
    };
    if (!id || typeof id !== 'string' || id.length > 80) {
      return NextResponse.json({ error: '요청 ID가 올바르지 않습니다' }, { status: 400 });
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action은 approve 또는 reject 이어야 합니다' }, { status: 400 });
    }

    const request = await dbGet<any>(
      `SELECT pr.*, m.name AS member_name, m.phone AS member_phone, m.role AS member_role, m.is_active AS member_is_active
         FROM password_reset_requests pr
         JOIN members m ON pr.member_id = m.id
        WHERE pr.id = $1`,
      [id]
    );
    if (!request) return NextResponse.json({ error: '요청을 찾을 수 없습니다' }, { status: 404 });
    if (request.status !== 'pending') {
      return NextResponse.json({ error: '이미 처리된 요청입니다' }, { status: 400 });
    }
    if (request.member_id === auth.memberId) {
      return NextResponse.json(
        { error: '본인 계정은 마이페이지의 비밀번호 변경을 사용해 주세요' },
        { status: 400 }
      );
    }

    const resolutionNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : null;

    if (action === 'reject') {
      await dbRun(
        `UPDATE password_reset_requests
            SET status = 'rejected',
                resolution_note = $2,
                resolved_at = NOW(),
                resolved_by = $3
          WHERE id = $1 AND status = 'pending'`,
        [id, resolutionNote, auth.memberId]
      );
      void logAdminAction(req, auth.memberId, {
        action: 'password_reset_request.reject',
        targetType: 'member',
        targetId: request.member_id,
        targetName: request.member_name,
        summary: `${request.member_name} 회원의 비밀번호 재설정 요청 거절`,
        beforeValue: { requestId: id, requestedAt: request.requested_at },
        afterValue: { resolutionNote },
      });
      return NextResponse.json({ success: true });
    }

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 12);

    const approved = await dbTx(async client => {
      const locked = await client.query(
        `SELECT pr.*, m.name AS member_name
           FROM password_reset_requests pr
           JOIN members m ON pr.member_id = m.id
          WHERE pr.id = $1
          FOR UPDATE`,
        [id]
      );
      const row = locked.rows[0];
      if (!row || row.status !== 'pending') return null;

      await client.query(
        `UPDATE members
            SET password_hash = $1,
                must_change_password = TRUE,
                token_version = token_version + 1,
                failed_login_count = 0,
                locked_until = NULL,
                updated_at = NOW()
          WHERE id = $2`,
        [hash, row.member_id]
      );
      await client.query(
        `UPDATE password_reset_requests
            SET status = 'approved',
                resolution_note = $2,
                resolved_at = NOW(),
                resolved_by = $3
          WHERE id = $1`,
        [id, resolutionNote ?? '임시 비밀번호 발급 완료', auth.memberId]
      );
      return row;
    });

    if (!approved) {
      return NextResponse.json({ error: '이미 처리된 요청입니다' }, { status: 400 });
    }

    void logAdminAction(req, auth.memberId, {
      action: 'password_reset_request.approve',
      targetType: 'member',
      targetId: request.member_id,
      targetName: request.member_name,
      summary: `${request.member_name} 회원의 재설정 요청 승인 및 임시 비밀번호 발급`,
      beforeValue: { requestId: id, requestedAt: request.requested_at },
      afterValue: { mustChangePassword: true, tokenRevoked: true },
    });

    return NextResponse.json({
      success: true,
      memberId: request.member_id,
      memberName: request.member_name,
      tempPassword,
      message: `초기 비밀번호: ${tempPassword} (최초 로그인 시 변경 필요)`,
    });
  } catch (error: any) {
    console.error('[password-reset-requests PATCH] error:', error?.message ?? error);
    return NextResponse.json(
      { error: '비밀번호 재설정 요청 처리 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
