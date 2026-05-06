import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun } from '@/lib/db';
import { createToken, getAuthFromRequest, setAuthCookie, unauthorizedResponse } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { validatePassword } from '@/lib/validation';
import { readJsonBody } from '@/lib/http';
import { safeSync } from '@/lib/sheets';
import { mapMemberRow } from '@/lib/sheets-mappers';
import bcrypt from 'bcryptjs';

// PUT /api/auth/password - Change password (current user only)
export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  // 5 changes per IP per hour is plenty for legitimate use.
  const rl = rateLimit(req, 'password', { windowMs: 60 * 60_000, max: 5 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    let body: any;
    try {
      body = await readJsonBody(req);
    } catch (e: any) {
      if (e?.name === 'BodyTooLargeError') {
        return NextResponse.json({ error: '요청 본문이 너무 큽니다' }, { status: 413 });
      }
      throw e;
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
    }
    const { currentPassword, newPassword } = body as Record<string, unknown>;

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      return NextResponse.json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요' }, { status: 400 });
    }
    // EXT-H5: Bound length before bcrypt to prevent CPU exhaustion.
    if (currentPassword.length > 64) {
      return NextResponse.json({ error: '현재 비밀번호가 일치하지 않습니다' }, { status: 401 });
    }

    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.ok) {
      return NextResponse.json({ error: pwCheck.message }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ error: '새 비밀번호는 현재 비밀번호와 달라야 합니다' }, { status: 400 });
    }

    const member = await dbGet<{ password_hash: string; name: string; role: string; token_version: number }>(
      'SELECT password_hash, name, role, token_version FROM members WHERE id = $1',
      [auth.memberId]
    );
    if (!member) return unauthorizedResponse();

    const valid = await bcrypt.compare(currentPassword, member.password_hash);
    if (!valid) {
      return NextResponse.json({ error: '현재 비밀번호가 일치하지 않습니다' }, { status: 401 });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    // EXT-H7 (full): Bump token_version atomically with the password update so
    // every previously-issued JWT for this user becomes invalid the next time
    // it is presented (getAuthFromRequest compares tv against members.token_version).
    const updated = await dbGet<{ token_version: number }>(
      `UPDATE members
         SET password_hash = $1,
             must_change_password = FALSE,
             token_version = token_version + 1,
             updated_at = NOW()
       WHERE id = $2
       RETURNING token_version`,
      [hash, auth.memberId]
    );

    const newToken = await createToken({
      memberId: auth.memberId,
      role: member.role,
      name: member.name,
      tokenVersion: updated?.token_version ?? (member.token_version ?? 0) + 1,
    });

    // Sheets mirror — touch only the 최종동기화 column by re-reading the row.
    try {
      const row = await dbGet<any>(
        `SELECT id, name, phone, email, role, join_date, is_active, memo
         FROM members WHERE id = $1`, [auth.memberId]
      );
      if (row) {
        void safeSync('members', 'upsert', mapMemberRow(row));
      }
    } catch { /* swallow — never break the response */ }

    const response = NextResponse.json({ success: true, message: '비밀번호가 변경되었습니다' });
    setAuthCookie(response, newToken);
    return response;
  } catch (error: any) {
    console.error('[auth/password] error:', error);
    return NextResponse.json({ error: '비밀번호 변경 중 오류가 발생했습니다' }, { status: 500 });
  }
}
