import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * PR-5: Admin-issued password reset.
 *
 * POST /api/members/[id]/reset-password
 *  - Admin only.
 *  - Generates a fresh strong temporary password (10 chars, letters + digits).
 *  - Stores bcrypt hash, sets must_change_password=TRUE, bumps token_version
 *    so any outstanding JWT for that user is immediately invalidated.
 *  - Returns the plaintext temp password ONCE in the response so the admin
 *    can hand it to the member. It is never persisted in plaintext nor logged.
 *
 * The endpoint deliberately does NOT touch the Google Sheet — password state
 * is sensitive and must never appear there.
 */

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const { id } = await params;
  if (!id || typeof id !== 'string' || id.length > 64) {
    return NextResponse.json({ error: '잘못된 회원 ID입니다' }, { status: 400 });
  }

  try {
    const member = await dbGet<{ id: string; name: string; phone: string; role: string }>(
      'SELECT id, name, phone, role FROM members WHERE id = $1',
      [id]
    );
    if (!member) {
      return NextResponse.json({ error: '회원을 찾을 수 없습니다' }, { status: 404 });
    }

    // Defence in depth: prevent admin from accidentally resetting their own
    // password via this endpoint (they should use the self-service flow).
    if (member.id === auth.memberId) {
      return NextResponse.json(
        { error: '본인 계정은 마이페이지의 비밀번호 변경을 사용해 주세요' },
        { status: 400 }
      );
    }

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 12);

    // Bumping token_version invalidates every JWT previously issued for this
    // user — they will be forced to log in again with the new temp password.
    await dbRun(
      `UPDATE members
         SET password_hash = $1,
             must_change_password = TRUE,
             token_version = token_version + 1,
             failed_login_count = 0,
             locked_until = NULL,
             updated_at = NOW()
       WHERE id = $2`,
      [hash, id]
    );

    void logAdminAction(req, auth.memberId, {
      action: 'member.reset_password',
      targetType: 'member',
      targetId: member.id,
      targetName: member.name,
      summary: '관리자가 임시 비밀번호 재발급 (해시 변경, 토큰 무효화)',
      // NOTE: never include the plaintext password in the audit log.
    });

    return NextResponse.json({
      success: true,
      memberId: member.id,
      memberName: member.name,
      tempPassword,
      message: `초기 비밀번호: ${tempPassword} (최초 로그인 시 변경 필요)`,
    });
  } catch (error: any) {
    // Never log or expose the password — only the failure reason.
    console.error('[members reset-password] error:', error?.message ?? error);
    return NextResponse.json(
      { error: '비밀번호 재설정 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
