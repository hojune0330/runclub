import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { normalizePhone } from '@/lib/validation';
import { readJsonBody } from '@/lib/http';
import bcrypt from 'bcryptjs';

// EXT-C4 (account enumeration): A single, generic message is returned for
// "no such phone" AND "wrong password". Active/inactive distinction is also
// folded into the same response so attackers can't enumerate registered
// numbers by status code or message.
const GENERIC_LOGIN_FAIL = '연락처 또는 비밀번호가 올바르지 않습니다';

// EXT-I8: Per-account lockout policy. Login rate limiting is split into:
//   1) a very high per-IP flood guard, so 100+ legitimate members behind the
//      same venue/NAT IP can still log in at once;
//   2) a per-IP+phone limiter, so brute-force attempts against one account are
//      still contained even when many users share the same network.
// Numbers are deliberately generous so large classes/events don't lock out.
const LOCKOUT_FAIL_THRESHOLD = 7;
const LOCKOUT_WINDOW_MS = 15 * 60_000;

export async function POST(req: NextRequest) {
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
    const { phone: phoneRaw, password } = body as Record<string, unknown>;

    // Large on-site events can put 100+ members behind the same NAT/carrier IP.
    // Do NOT use a low per-IP login cap. Instead, keep only a high flood guard
    // plus a per-account guard below.
    const flood = rateLimit(req, 'login-flood', { windowMs: 60_000, max: 600 });
    if (!flood.ok) {
      return NextResponse.json(
        { error: `로그인 요청이 일시적으로 많습니다. ${flood.retryAfterSec}초 후 다시 시도해주세요.` },
        { status: 429, headers: { 'Retry-After': String(flood.retryAfterSec) } }
      );
    }

    if (typeof phoneRaw !== 'string' || typeof password !== 'string' || !phoneRaw || !password) {
      return NextResponse.json({ error: '연락처와 비밀번호를 입력해주세요' }, { status: 400 });
    }
    // EXT-H5: Bound the password length BEFORE bcrypt to prevent CPU
    // exhaustion via huge payloads. 64 chars matches our policy ceiling.
    if (password.length > 64) {
      return NextResponse.json({ error: GENERIC_LOGIN_FAIL }, { status: 401 });
    }
    const phone = normalizePhone(phoneRaw);
    if (!phone) {
      const invalidRl = rateLimit(req, 'login-invalid-phone', { windowMs: 60_000, max: 120 });
      if (!invalidRl.ok) {
        return NextResponse.json(
          { error: `로그인 시도가 너무 많습니다. ${invalidRl.retryAfterSec}초 후 다시 시도해주세요.` },
          { status: 429, headers: { 'Retry-After': String(invalidRl.retryAfterSec) } }
        );
      }
      // Still return the generic message — don't reveal whether the format
      // was even valid (helps against scripted enum).
      return NextResponse.json({ error: GENERIC_LOGIN_FAIL }, { status: 401 });
    }

    const accountRl = rateLimit(req, 'login-account', {
      windowMs: 5 * 60_000,
      max: 30,
      extraKey: phone,
    });
    if (!accountRl.ok) {
      return NextResponse.json(
        { error: `로그인 시도가 너무 많습니다. ${accountRl.retryAfterSec}초 후 다시 시도해주세요.` },
        { status: 429, headers: { 'Retry-After': String(accountRl.retryAfterSec) } }
      );
    }

    const member = await dbGet<any>(`
      SELECT id, name, phone, email, password_hash, role, join_date, is_active, memo,
             must_change_password, token_version, failed_login_count, locked_until
      FROM members WHERE phone = $1
    `, [phone]);

    if (!member || !member.is_active) {
      // Run a dummy bcrypt compare to keep response timing roughly constant
      // and prevent timing-based account enumeration.
      await bcrypt.compare(
        password,
        '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.F3Dj5CYy7L7qqGq0Kj8aPjKP2gEa'
      );
      return NextResponse.json({ error: GENERIC_LOGIN_FAIL }, { status: 401 });
    }

    // EXT-I8: If the account is currently locked, reject without even
    // running bcrypt. We still return the generic message — telling the
    // caller "this account is locked" would itself be an enumeration oracle.
    if (member.locked_until && new Date(member.locked_until).getTime() > Date.now()) {
      console.warn('[auth/login] locked account attempt:', member.id);
      return NextResponse.json({ error: GENERIC_LOGIN_FAIL }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, member.password_hash);
    if (!valid) {
      // EXT-I8: Increment failure counter. When it crosses the threshold,
      // set locked_until to now + window. Counter is reset to 0 on success.
      const nextCount = (member.failed_login_count ?? 0) + 1;
      if (nextCount >= LOCKOUT_FAIL_THRESHOLD) {
        const lockUntil = new Date(Date.now() + LOCKOUT_WINDOW_MS).toISOString();
        await dbRun(
          `UPDATE members SET failed_login_count = $1, locked_until = $2 WHERE id = $3`,
          [nextCount, lockUntil, member.id]
        );
        console.warn('[auth/login] account locked:', member.id);
      } else {
        await dbRun(
          `UPDATE members SET failed_login_count = $1 WHERE id = $2`,
          [nextCount, member.id]
        );
      }
      return NextResponse.json({ error: GENERIC_LOGIN_FAIL }, { status: 401 });
    }

    // EXT-I8: Successful login — clear failure state.
    if ((member.failed_login_count ?? 0) > 0 || member.locked_until) {
      await dbRun(
        `UPDATE members SET failed_login_count = 0, locked_until = NULL WHERE id = $1`,
        [member.id]
      );
    }

    const token = await createToken({
      memberId: member.id,
      role: member.role,
      name: member.name,
      tokenVersion: member.token_version ?? 0,
    });

    // Token is delivered ONLY via httpOnly cookie to mitigate XSS token theft.
    const response = NextResponse.json({
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        email: member.email,
        role: member.role,
        joinDate: member.join_date,
        isActive: !!member.is_active,
        // EXT-I1: same admin-memo-leak fix — only admins see their own memo.
        memo: member.role === 'admin' ? member.memo : undefined,
        mustChangePassword: !!member.must_change_password,
      },
    });

    setAuthCookie(response, token);
    return response;
  } catch (error: any) {
    console.error('[auth/login] error:', error);
    return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}
