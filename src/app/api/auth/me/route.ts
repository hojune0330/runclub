import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { validateName, validateEmail, validateText, validatePassword } from '@/lib/validation';
import { readJsonBody } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { safeSync } from '@/lib/sheets';
import { mapMemberRow } from '@/lib/sheets-mappers';
import bcrypt from 'bcryptjs';

export async function GET(req: NextRequest) {
  // EXT-I5: Per-IP rate limit on this endpoint. The SPA legitimately polls
  // /api/auth/me on bootstrap and after auth changes, but a bot using stolen
  // tokens or fishing for valid sessions can call this thousands of times.
  // 120/min is comfortably above any legitimate UI usage.
  const rl = rateLimit(req, 'auth-me', { windowMs: 60_000, max: 120 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  // Return 200 with `null`-shaped payload when not authenticated so that
  // public visitors don't see noisy 401 errors in the browser console while
  // the AuthContext is bootstrapping. Authenticated users get the full user.
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  const member = await dbGet(`
    SELECT id, name, phone, email, role, join_date, is_active, memo, profile_image, must_change_password
    FROM members WHERE id = $1
  `, [auth.memberId]);

  if (!member) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  // EXT-I1: `members.memo` is an admin-side note about the member (e.g.,
  // payment status, behavioural flags). It must NEVER be returned to the
  // member themselves — only to admins viewing the member list. The member
  // does not need their own admin memo and exposing it here let any
  // logged-in user read what the operator wrote about them.
  const isAdmin = member.role === 'admin';

  return NextResponse.json({
    id: member.id,
    name: member.name,
    phone: member.phone,
    email: member.email,
    role: member.role,
    joinDate: member.join_date,
    isActive: !!member.is_active,
    // Admins can see their own memo (it's their data); regular members cannot.
    memo: isAdmin ? member.memo : undefined,
    profileImage: member.profile_image,
    mustChangePassword: !!member.must_change_password,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  // EXT-I9: Per-IP rate limit on profile updates — prevents an attacker who
  // has briefly captured a session from running rapid edits.
  const rl = rateLimit(req, 'auth-me-put', { windowMs: 60_000, max: 10 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    // EXT-H1: bound body size; previously unprotected.
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
    const { name, email, memo, currentPassword } = body as Record<string, unknown>;

    // EXT-H6: validate optional fields (length, control chars). Note: role/phone
    // are intentionally NOT updatable via this self-service endpoint to prevent
    // privilege escalation or contact-handle hijack.
    let safeName: string | null = null;
    if (name !== undefined && name !== null && name !== '') {
      const c = validateName(name);
      if (!c.ok) return NextResponse.json({ error: c.message }, { status: 400 });
      safeName = c.value!;
    }
    let safeEmail: string | null | undefined = undefined;
    let emailChanged = false;
    if (email !== undefined && email !== null) {
      const c = validateEmail(email);
      if (!c.ok) return NextResponse.json({ error: c.message }, { status: 400 });
      safeEmail = c.value ?? null;
      emailChanged = true;
    }
    let safeMemo: string | null = null;
    if (memo !== undefined && memo !== null) {
      const c = validateText(memo, { max: 2000, field: '메모' });
      if (!c.ok) return NextResponse.json({ error: c.message }, { status: 400 });
      safeMemo = c.value ?? null;
    }

    // EXT-I9: Email is the contact handle a future password-reset flow will
    // rely on. If a session token is briefly stolen (e.g., via a shared
    // device left logged in), we don't want the attacker to silently swap
    // the email and lock the legitimate user out. Require the current
    // password as a re-authentication step whenever email changes.
    if (emailChanged) {
      if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
        return NextResponse.json(
          { error: '이메일 변경에는 현재 비밀번호 확인이 필요합니다', requiresPassword: true },
          { status: 400 }
        );
      }
      // Sanity-check shape (avoid hashing absurd inputs).
      const pwShape = validatePassword(currentPassword);
      // We don't reject on shape failure here because the *current* password
      // pre-dates the latest policy; only check length-bounds defensively.
      if (currentPassword.length > 256) {
        return NextResponse.json({ error: '현재 비밀번호가 일치하지 않습니다' }, { status: 401 });
      }
      const row = await dbGet<{ password_hash: string }>(
        'SELECT password_hash FROM members WHERE id = $1',
        [auth.memberId]
      );
      if (!row) return unauthorizedResponse();
      const ok = await bcrypt.compare(currentPassword, row.password_hash);
      if (!ok) {
        return NextResponse.json({ error: '현재 비밀번호가 일치하지 않습니다' }, { status: 401 });
      }
      void pwShape; // referenced to keep validation imported even if unused
    }

    // EXT-I9: Build the UPDATE so we only touch columns the caller actually
    // provided. Previously `email = $2` always wrote the column, so passing
    // no email field would silently null it out.
    const sets: string[] = [];
    const params: any[] = [];
    if (safeName !== null) {
      params.push(safeName);
      sets.push(`name = $${params.length}`);
    }
    if (emailChanged) {
      params.push(safeEmail);
      sets.push(`email = $${params.length}`);
    }
    if (memo !== undefined && memo !== null) {
      params.push(safeMemo);
      sets.push(`memo = $${params.length}`);
    }
    if (sets.length === 0) {
      return NextResponse.json({ success: true, noop: true });
    }
    sets.push('updated_at = NOW()');
    params.push(auth.memberId);
    const sql = `UPDATE members SET ${sets.join(', ')} WHERE id = $${params.length}`;
    await dbRun(sql, params);

    // Sheets mirror — re-read post-update so the row reflects final state
    try {
      const updated = await dbGet<any>(
        `SELECT id, name, phone, email, role, join_date, is_active, memo
         FROM members WHERE id = $1`, [auth.memberId]
      );
      if (updated) {
        void safeSync('members', 'upsert', mapMemberRow(updated));
      }
    } catch { /* swallow — never break the response */ }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[auth/me PUT] error:', error);
    return NextResponse.json({ error: '프로필 업데이트 중 오류가 발생했습니다' }, { status: 500 });
  }
}
