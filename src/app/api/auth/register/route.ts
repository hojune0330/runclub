import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { validatePassword, normalizePhone, validateName, validateEmail } from '@/lib/validation';
import { readJsonBody } from '@/lib/http';
import { safeSync } from '@/lib/sheets';
import { mapMemberRow } from '@/lib/sheets-mappers';
import bcrypt from 'bcryptjs';

// HOTFIX: 회원가입 동시 폭주 시 발생한 500 / 타임아웃 / 429 대응.
//
// 1) bcrypt cost 12 → 10
//    Render Starter (0.5 vCPU) 환경에서 12 = 250~400ms, 10 = 60~100ms.
//    bcryptjs 는 순수 JS 라 Node 단일 스레드 이벤트 루프를 점유하므로
//    동시 N명이 가입을 누르면 (N × 250ms) 만큼 직렬화된다. cost=10 이면
//    수용량이 약 3~4배. OWASP 2024 권고도 cost ≥ 10 (Argon2id 미사용 시).
//
// 2) Rate limit 완화: burst 3/min → 10/min, hourly 5/h → 20/h
//    원인: 같은 NAT(런클럽 단톡방, 카페·학원 와이파이) 뒤에서 친구 4명이
//    동시 가입하면 4번째부터 429. 봇 방어는 UA 차단 + 허니팟이 더 효과적.
//
// 3) 23505 (unique_violation) 명시적 처리
//    SELECT-then-INSERT 사이 race condition 으로 같은 phone 이 동시에
//    INSERT 되면 PG 가 23505 를 던졌고, 이게 generic 500 으로 새고 있었다.
//    catch 절에서 err.code === '23505' 를 잡아 친절한 400 으로 변환.
//
// 4) Sheets 미러 fire-and-forget 보강
//    safeSync 자체는 try/catch 가 들어 있지만 호출 직후 createToken 까지
//    동기적으로 끌고 있어 Sheets API 가 느릴 때 응답 시간이 늘어났다.
//    이미 `void` 가 붙어 있지만, hotfix 차원에서 setImmediate 로 한 번 더
//    분리해 응답을 먼저 내보낸다.
const BCRYPT_COST_REGISTER = 10;

export async function POST(req: NextRequest) {
  // Two-tier rate limit. 봇/스크립트는 UA + 허니팟에서 거르고,
  // 여기서는 동일 IP 가 1분 안에 폼을 너무 많이 찌르는 경우만 차단한다.
  const rlBurst = rateLimit(req, 'register-burst', { windowMs: 60_000, max: 10 });
  if (!rlBurst.ok) {
    return NextResponse.json(
      { error: `가입 시도가 너무 많습니다. ${rlBurst.retryAfterSec}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(rlBurst.retryAfterSec) } }
    );
  }
  const rl = rateLimit(req, 'register', { windowMs: 60 * 60_000, max: 20 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: `가입 시도가 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  // EXT-I3 (bot defense): Reject obvious non-browser User-Agents. Real users
  // arriving through our SPA always carry a UA string from a major browser.
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

    // EXT-I3 (honeypot): hidden form fields a real user never fills.
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

    // Pre-check duplicate phone (best-effort; race-safe INSERT below is the
    // authoritative guard).
    const existing = await dbGet('SELECT id FROM members WHERE phone = $1', [phone]);
    if (existing) {
      console.warn('[auth/register] duplicate phone attempted:', phone);
      return NextResponse.json(
        { error: '입력하신 정보로 가입할 수 없습니다. 이미 가입한 적이 있다면 로그인해 주세요.' },
        { status: 400 }
      );
    }

    const id = genId('m');
    // HOTFIX: cost 10 (was 12). 동시 가입 폭주 시 이벤트 루프 점유 완화.
    const hash = await bcrypt.hash(password as string, BCRYPT_COST_REGISTER);
    const joinDate = new Date().toISOString().split('T')[0];
    const safeName = nameCheck.value!;
    const safeEmail = emailCheck.value ?? null;

    try {
      await dbRun(`
        INSERT INTO members (id, name, phone, email, password_hash, role, join_date, is_active, must_change_password, token_version)
        VALUES ($1, $2, $3, $4, $5, 'member', $6, TRUE, FALSE, 0)
      `, [id, safeName, phone, safeEmail, hash, joinDate]);
    } catch (insertErr: any) {
      // HOTFIX: 23505 = unique_violation. SELECT-then-INSERT race 에서
      // 같은 phone 이 동시에 들어온 경우. generic 500 대신 안내 메시지로.
      if (insertErr?.code === '23505') {
        console.warn('[auth/register] race-detected duplicate phone:', phone);
        return NextResponse.json(
          { error: '입력하신 정보로 가입할 수 없습니다. 이미 가입한 적이 있다면 로그인해 주세요.' },
          { status: 400 }
        );
      }
      throw insertErr;
    }

    // Sheets mirror (fire-and-forget). HOTFIX: setImmediate 로 한 번 더
    // 분리해 응답이 먼저 나가도록 보장.
    setImmediate(() => {
      void safeSync('members', 'upsert', mapMemberRow({
        id, name: safeName, phone, email: safeEmail, role: 'member',
        join_date: joinDate, is_active: true, memo: null,
      }));
    });

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
