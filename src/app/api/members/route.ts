import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { normalizePhone, validateName, validateEmail, validateText } from '@/lib/validation';
import { readJsonBody } from '@/lib/http';
import { safeSync } from '@/lib/sheets';
import { mapMemberRow } from '@/lib/sheets-mappers';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Generate a strong temporary password (10 chars: letters + digits).
 * Used for admin-issued accounts; the user is forced to change it on first login.
 */
function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  // Ensure at least one digit and one letter
  if (!/\d/.test(out)) out = out.slice(0, -1) + '7';
  if (!/[A-Za-z]/.test(out)) out = 'A' + out.slice(1);
  return out;
}

// GET /api/members - Admin only (list all), member gets own info
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const members = await dbAll(`
    SELECT id, name, phone, email, role, join_date, is_active, memo, profile_image
    FROM members ORDER BY join_date DESC
  `, []);

  return NextResponse.json(members.map(m => ({
    id: m.id,
    name: m.name,
    phone: m.phone,
    email: m.email,
    role: m.role,
    joinDate: m.join_date,
    isActive: !!m.is_active,
    memo: m.memo,
    profileImage: m.profile_image,
  })));
}

// POST /api/members - Admin only (register a member)
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

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
    const { name, phone, email, memo } = body as Record<string, unknown>;

    const nameCheck = validateName(name);
    if (!nameCheck.ok) return NextResponse.json({ error: nameCheck.message }, { status: 400 });

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json({ error: '올바른 휴대폰 번호 형식이 아닙니다 (010-XXXX-XXXX)' }, { status: 400 });
    }

    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) return NextResponse.json({ error: emailCheck.message }, { status: 400 });

    // EXT-H6: bound memo length.
    const memoCheck = validateText(memo, { max: 2000, field: '메모' });
    if (!memoCheck.ok) return NextResponse.json({ error: memoCheck.message }, { status: 400 });

    const existing = await dbGet('SELECT id FROM members WHERE phone = $1', [normalizedPhone]);
    if (existing) return NextResponse.json({ error: '이미 등록된 연락처입니다' }, { status: 409 });

    const id = genId('m');
    // C3: Generate a strong random temp password and force change on first login.
    const defaultPassword = generateTempPassword();
    const hash = await bcrypt.hash(defaultPassword, 12);
    const joinDate = new Date().toISOString().split('T')[0];

    await dbRun(`
      INSERT INTO members (id, name, phone, email, password_hash, role, join_date, is_active, memo, must_change_password, token_version)
      VALUES ($1, $2, $3, $4, $5, 'member', $6, TRUE, $7, TRUE, 0)
    `, [id, nameCheck.value!, normalizedPhone, emailCheck.value ?? null, hash, joinDate, memoCheck.value ?? null]);

    // Sheets mirror (fire-and-forget)
    void safeSync('members', 'upsert', mapMemberRow({
      id, name: nameCheck.value!, phone: normalizedPhone,
      email: emailCheck.value ?? null, role: 'member',
      join_date: joinDate, is_active: true, memo: memoCheck.value ?? null,
    }));

    return NextResponse.json({
      id, name: nameCheck.value!, phone: normalizedPhone, email: emailCheck.value ?? null,
      joinDate, isActive: true, memo: memoCheck.value ?? null,
      defaultPassword,
      defaultPasswordMessage: `초기 비밀번호: ${defaultPassword} (최초 로그인 시 변경 필요)`,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[members POST] error:', error);
    return NextResponse.json({ error: '회원 등록 중 오류가 발생했습니다' }, { status: 500 });
  }
}

// PUT /api/members - Admin update member
export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

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
    const { id, name, phone, email, isActive, memo } = body as Record<string, unknown>;
    if (typeof id !== 'string' || !id || id.length > 64) {
      return NextResponse.json({ error: 'id 필요' }, { status: 400 });
    }

    // EXT-H6: validate name/email/memo lengths if provided
    let safeName: string | null = null;
    if (name !== undefined && name !== null && name !== '') {
      const c = validateName(name);
      if (!c.ok) return NextResponse.json({ error: c.message }, { status: 400 });
      safeName = c.value!;
    }
    let safeEmail: string | null = null;
    if (email !== undefined && email !== null) {
      const c = validateEmail(email);
      if (!c.ok) return NextResponse.json({ error: c.message }, { status: 400 });
      safeEmail = c.value ?? null;
    }
    let safeMemo: string | null = null;
    if (memo !== undefined && memo !== null) {
      const c = validateText(memo, { max: 2000, field: '메모' });
      if (!c.ok) return NextResponse.json({ error: c.message }, { status: 400 });
      safeMemo = c.value ?? null;
    }

    // H5: Validate and normalize phone if provided
    let normalizedPhone: string | null = null;
    if (phone !== undefined && phone !== null && phone !== '') {
      normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return NextResponse.json({ error: '올바른 휴대폰 번호 형식이 아닙니다' }, { status: 400 });
      }
      // Prevent collision with another member's phone
      const conflict = await dbGet(
        'SELECT id FROM members WHERE phone = $1 AND id <> $2',
        [normalizedPhone, id]
      );
      if (conflict) {
        return NextResponse.json({ error: '이미 등록된 연락처입니다' }, { status: 409 });
      }
    }

    // EXT-H7 (full): If admin deactivates a member, bump token_version so any
    // outstanding JWTs for that user are immediately invalidated server-side.
    const willDeactivate = isActive === false;
    if (willDeactivate) {
      await dbRun(
        `UPDATE members SET name = COALESCE($1, name), phone = COALESCE($2, phone), email = $3,
           is_active = FALSE, memo = $4, token_version = token_version + 1, updated_at = NOW()
         WHERE id = $5`,
        [safeName, normalizedPhone, safeEmail, safeMemo, id]
      );
    } else {
      await dbRun(`
        UPDATE members SET name = COALESCE($1, name), phone = COALESCE($2, phone), email = $3,
          is_active = COALESCE($4, is_active), memo = $5, updated_at = NOW()
        WHERE id = $6
      `, [safeName, normalizedPhone, safeEmail, isActive !== undefined ? !!isActive : null, safeMemo, id]);
    }

    // Sheets mirror — re-read post-update so the row reflects final state
    try {
      const updated = await dbGet<any>(
        `SELECT id, name, phone, email, role, join_date, is_active, memo
         FROM members WHERE id = $1`, [id]
      );
      if (updated) {
        void safeSync('members', 'upsert', mapMemberRow(updated));
      }
    } catch { /* swallow — never break the response */ }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[members PUT] error:', error);
    return NextResponse.json({ error: '회원 정보 수정 중 오류가 발생했습니다' }, { status: 500 });
  }
}
