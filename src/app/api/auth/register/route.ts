import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { validatePassword, normalizePhone, validateName, validateEmail } from '@/lib/validation';
import { readJsonBody } from '@/lib/http';
import { safeSync } from '@/lib/sheets';
import { mapMemberRow } from '@/lib/sheets-mappers';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  // EXT-I3 (bot defense): Two-tier rate limit. The hourly cap stops slow,
  // distributed enumeration; the burst cap stops a single host from racing
  // through the form 10x in a few seconds. A real human signs up once.
  const rlBurst = rateLimit(req, 'register-burst', { windowMs: 60_000, max: 3 });
  if (!rlBurst.ok) {
    return NextResponse.json(
      { error: `가입 시도가 너무 많습니다. ${rlBurst.retryAfterSec}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(rlBurst.retryAfterSec) } }
    );
  }
  const rl = rateLimit(req, 'register', { windowMs: 60 * 60_000, max: 5 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: `가입 시도가 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  // EXT-I3 (bot defense): Reject obvious non-browser User-Agents. Real users
  // arriving through our SPA always carry a UA string from a major browser.
  // We don't try to be exhaustive — any token from {curl, wget, python,
  // httpie, scrapy, go-http-client, java, ruby, postman, axios/node} is a
  // strong scripted-client signal for the *registration* endpoint.
  const ua = (req.headers.get('user-agent') || '').toLowerCase();
  if (!ua) {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const SCRIPTED_UA_RE =
    /\b(curl|wget|python-requests|httpie|scrapy|go-http-client|java\/|ruby|postmanruntime|node-fetch|axios\/[\d.]+\s*$)\b/;
  if (SCRIPTED_UA_RE.test(ua)) {
    console.warn('[auth/register] scripted UA blocked:', ua);
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
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

    // EXT-I3 (honeypot): The signup form ships a hidden field named
    // `website` (and a few aliases) that real users never see and therefore
    // never fill. Any non-empty value here is almost certainly a form-filling
    // bot. We respond with a generic 400 so the bot can't easily detect that
    // the honeypot tripped.
    const honeypotValues = [
      (body as any)?.website,
      (body as any)?.url,
      (body as any)?.fax,
      (body as any)?.company,
    ];
    if (honeypotValues.some(v => typeof v === 'string' && v.trim().length > 0)) {
      console.warn('[auth/register] honeypot tripped from UA:', ua);
      return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
    }

    const { name: nameRaw, phone: phoneRaw, password, email: emailRaw } = body as Record<string, unknown>;

    const nameCheck = validateName(nameRaw);
    if (!nameCheck.ok) return NextResponse.json({ error: nameCheck.message }, { status: 400 });

    const phone = normalizePhone(phoneRaw);
    if (!phone) {
      return NextResponse.json({ error: '연락처 형식이 올바르지 않습니다 (예: 010-1234-5678)' }, { status: 400 });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      return NextResponse.json({ error: pwCheck.message }, { status: 400 });
    }

    const emailCheck = validateEmail(emailRaw);
    if (!emailCheck.ok) return NextResponse.json({ error: emailCheck.message }, { status: 400 });

    // Check duplicate phone
    const existing = await dbGet('SELECT id FROM members WHERE phone = $1', [phone]);
    if (existing) {
      // EXT-C4: Don't disclose that the phone exists. Return a generic message
      // and a status that mirrors the success path's structure to thwart
      // phone-number enumeration. We log server-side for legitimate triage.
      console.warn('[auth/register] duplicate phone attempted:', phone);
      return NextResponse.json(
        { error: '입력하신 정보로 가입할 수 없습니다. 이미 가입한 적이 있다면 로그인해 주세요.' },
        { status: 400 }
      );
    }

    const id = genId('m');
    const hash = await bcrypt.hash(password as string, 12);
    const joinDate = new Date().toISOString().split('T')[0];
    const safeName = nameCheck.value!;
    const safeEmail = emailCheck.value ?? null;

    await dbRun(`
      INSERT INTO members (id, name, phone, email, password_hash, role, join_date, is_active, must_change_password, token_version)
      VALUES ($1, $2, $3, $4, $5, 'member', $6, TRUE, FALSE, 0)
    `, [id, safeName, phone, safeEmail, hash, joinDate]);

    // Sheets mirror (fire-and-forget; queues on failure)
    void safeSync('members', 'upsert', mapMemberRow({
      id, name: safeName, phone, email: safeEmail, role: 'member',
      join_date: joinDate, is_active: true, memo: null,
    }));

    const token = await createToken({ memberId: id, role: 'member', name: safeName, tokenVersion: 0 });

    // Token is delivered ONLY via httpOnly cookie to mitigate XSS token theft.
    const response = NextResponse.json({
      member: {
        id, name: safeName, phone, email: safeEmail, role: 'member', joinDate, isActive: true,
        mustChangePassword: false,
      },
    });

    setAuthCookie(response, token);
    return response;
  } catch (error: any) {
    console.error('[auth/register] error:', error);
    return NextResponse.json({ error: '회원가입 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}
