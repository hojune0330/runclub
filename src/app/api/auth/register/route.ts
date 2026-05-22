import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { validatePassword, normalizePhone, validateName, validateEmail } from '@/lib/validation';
import { readJsonBody } from '@/lib/http';
import { safeSync } from '@/lib/sheets';
import { mapMemberRow } from '@/lib/sheets-mappers';
import bcrypt from 'bcryptjs';

// HOTFIX: 회원가입 동시 폭주 (200명 단톡방 일제 가입) 대응.
//
// 1) bcrypt cost 12 → 10
//    Render Starter (0.5 vCPU): 12 = 250~400ms, 10 = 60~100ms.
//    bcryptjs 는 순수 JS 라 Node 단일 스레드를 점유 → 수용량 약 3~4배 ↑.
//
// 2) Rate-limit 키를 IP → IP+phone 복합으로 변경
//    같은 NAT (런클럽 단톡방, 카페·학원·체육관 와이파이, 통신사 CGN)
//    뒤에서 회원 A 가 5번 시도하면 회원 B,C,D 까지 60분 차단되던 문제.
//    phone 별로 카운터를 분리하면 200명이 같은 IP 라도 서로 안 막힘.
//    봇 방어는 UA + 허니팟 + 높은 IP flood guard 로 유지.
//
// 3) 23505 (unique_violation) 명시적 처리
//    SELECT-then-INSERT race 시 generic 500 → 친절한 400.
//
// 4) 진단 로그 강화
//    [auth/register] PREFIX 로 모든 단계 (start, dup, ratelimit, ok, fail)
//    를 남겨 Render 로그에서 시도 횟수/원인을 정확히 집계 가능하게.
//
// 5) Sheets mirror 분리
//    setImmediate 로 응답 먼저 발사. Sheets API 지연이 응답 시간에
//    포함되지 않도록.
const BCRYPT_COST_REGISTER = 10;

/**
 * 클라이언트 IP 추출 (rate-limit 모듈과 동일한 우선순위).
 * 진단 로그용으로만 사용.
 */
function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return (req as unknown as { ip?: string }).ip ?? 'unknown';
}

/**
 * 진단용 마스킹된 전화번호. 010-1234-5678 → 010-****-5678
 * 로그 검색은 가능하면서 PII 노출은 최소화.
 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 8) return '***';
  return phone.replace(/^(\d{3})-?\d{4}-?(\d{4})$/, '$1-****-$2');
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ua = (req.headers.get('user-agent') || '').toLowerCase();

  // ── 0. UA / honeypot 봇 방어 (전화번호 보기 전에 빠르게 거름) ──
  if (!ua) {
    console.warn(`[auth/register] reject reason=empty_ua ip=${ip}`);
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const SCRIPTED_UA_RE =
    /\b(curl|wget|python-requests|httpie|scrapy|go-http-client|java\/|ruby|postmanruntime|node-fetch|axios\/[\d.]+\s*$)\b/;
  if (SCRIPTED_UA_RE.test(ua)) {
    console.warn(`[auth/register] reject reason=scripted_ua ip=${ip} ua=${ua.slice(0, 80)}`);
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  // ── 1. IP flood 가드. 봇·악의적 스팸 방지용 최후 보루. ──
  // 현장/단체 가입은 같은 Wi-Fi/통신사 NAT 뒤에서 100명 이상이 동시에
  // 들어올 수 있으므로 낮은 IP 단일 cap은 정상 가입자를 막는다. 대신
  // phone-bound limiter와 UA/honeypot 검증으로 개별 남용을 제어한다.
  const rlBurst = rateLimit(req, 'register-burst', { windowMs: 60_000, max: 300 });
  if (!rlBurst.ok) {
    console.warn(`[auth/register] reject reason=ratelimit_burst ip=${ip} retry=${rlBurst.retryAfterSec}s`);
    return NextResponse.json(
      { error: `가입 시도가 너무 많습니다. ${rlBurst.retryAfterSec}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(rlBurst.retryAfterSec) } }
    );
  }

  try {
    let body: any;
    try {
      body = await readJsonBody(req);
    } catch (e: any) {
      if (e?.name === 'BodyTooLargeError') {
        console.warn(`[auth/register] reject reason=body_too_large ip=${ip}`);
        return NextResponse.json({ error: '요청 본문이 너무 큽니다' }, { status: 413 });
      }
      throw e;
    }
    if (!body || typeof body !== 'object') {
      console.warn(`[auth/register] reject reason=bad_body ip=${ip}`);
      return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
    }

    // Honeypot: 봇만 채우는 hidden field.
    const honeypotValues = [
      (body as any)?.website,
      (body as any)?.url,
      (body as any)?.fax,
      (body as any)?.company,
    ];
    if (honeypotValues.some(v => typeof v === 'string' && v.trim().length > 0)) {
      console.warn(`[auth/register] reject reason=honeypot ip=${ip} ua=${ua.slice(0, 80)}`);
      return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
    }

    const { name: nameRaw, phone: phoneRaw, password, email: emailRaw } = body as Record<string, unknown>;

    // ── 2. Validation ──
    const nameCheck = validateName(nameRaw);
    if (!nameCheck.ok) {
      console.warn(`[auth/register] reject reason=invalid_name ip=${ip}`);
      return NextResponse.json({ error: nameCheck.message }, { status: 400 });
    }

    const phone = normalizePhone(phoneRaw);
    if (!phone) {
      console.warn(`[auth/register] reject reason=invalid_phone ip=${ip}`);
      return NextResponse.json({ error: '연락처 형식이 올바르지 않습니다 (예: 010-1234-5678)' }, { status: 400 });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      console.warn(`[auth/register] reject reason=invalid_password ip=${ip} phone=${maskPhone(phone)}`);
      return NextResponse.json({ error: pwCheck.message }, { status: 400 });
    }

    const emailCheck = validateEmail(emailRaw);
    if (!emailCheck.ok) {
      console.warn(`[auth/register] reject reason=invalid_email ip=${ip} phone=${maskPhone(phone)}`);
      return NextResponse.json({ error: emailCheck.message }, { status: 400 });
    }

    // ── 3. phone-bound rate-limit (HOTFIX 핵심) ──
    // 같은 NAT 뒤 200명도 phone 별로 카운터가 분리돼 서로 안 막힘.
    // 같은 phone 이 1시간에 20번 시도하면 차단 (브루트포스/실수 다발 방지).
    const rlPerPhone = rateLimit(
      req,
      'register-by-phone',
      { windowMs: 60 * 60_000, max: 20, extraKey: phone }
    );
    if (!rlPerPhone.ok) {
      console.warn(`[auth/register] reject reason=ratelimit_phone ip=${ip} phone=${maskPhone(phone)} retry=${rlPerPhone.retryAfterSec}s`);
      return NextResponse.json(
        { error: `가입 시도가 너무 많습니다. ${rlPerPhone.retryAfterSec}초 후 다시 시도해주세요.` },
        { status: 429, headers: { 'Retry-After': String(rlPerPhone.retryAfterSec) } }
      );
    }

    console.log(`[auth/register] start ip=${ip} phone=${maskPhone(phone)}`);

    // ── 4. duplicate phone pre-check ──
    const existing = await dbGet('SELECT id FROM members WHERE phone = $1', [phone]);
    if (existing) {
      console.warn(`[auth/register] reject reason=duplicate_phone ip=${ip} phone=${maskPhone(phone)}`);
      return NextResponse.json(
        { error: '이미 가입된 연락처입니다. 로그인 탭에서 로그인해 주세요.', code: 'DUPLICATE_PHONE' },
        { status: 409 }
      );
    }

    const id = genId('m');
    const hash = await bcrypt.hash(password as string, BCRYPT_COST_REGISTER);
    const joinDate = new Date().toISOString().split('T')[0];
    const safeName = nameCheck.value!;
    const safeEmail = emailCheck.value ?? null;

    // ── 5. INSERT (race-safe) ──
    try {
      await dbRun(`
        INSERT INTO members (id, name, phone, email, password_hash, role, join_date, is_active, must_change_password, token_version)
        VALUES ($1, $2, $3, $4, $5, 'member', $6, TRUE, FALSE, 0)
      `, [id, safeName, phone, safeEmail, hash, joinDate]);
    } catch (insertErr: any) {
      if (insertErr?.code === '23505') {
        console.warn(`[auth/register] reject reason=race_duplicate ip=${ip} phone=${maskPhone(phone)}`);
        return NextResponse.json(
          { error: '이미 가입된 연락처입니다. 로그인 탭에서 로그인해 주세요.', code: 'DUPLICATE_PHONE' },
          { status: 409 }
        );
      }
      throw insertErr;
    }

    // ── 6. Sheets mirror (응답 후 비동기) ──
    setImmediate(() => {
      void safeSync('members', 'upsert', mapMemberRow({
        id, name: safeName, phone, email: safeEmail, role: 'member',
        join_date: joinDate, is_active: true, memo: null,
      }));
    });

    const token = await createToken({ memberId: id, role: 'member', name: safeName, tokenVersion: 0 });

    const response = NextResponse.json({
      member: {
        id, name: safeName, phone, email: safeEmail, role: 'member', joinDate, isActive: true,
        mustChangePassword: false,
      },
    });

    setAuthCookie(response, token);
    console.log(`[auth/register] ok ip=${ip} phone=${maskPhone(phone)} id=${id}`);
    return response;
  } catch (error: any) {
    console.error(`[auth/register] fail ip=${ip} err=${error?.code ?? ''} msg=${error?.message ?? error}`);
    return NextResponse.json({ error: '회원가입 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}
