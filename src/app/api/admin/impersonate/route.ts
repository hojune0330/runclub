import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse, createToken, setAuthCookie } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 테스트 회원 고정 식별자 — 관리자가 "방금 반영한 사항"을 회원 화면에서 바로 확인하기 위한 계정.
const TEST_MEMBER_PHONE = '010-1111-1111';
const TEST_MEMBER_NAME = '테스트 회원';
// 직접 로그인도 가능하도록(원하면) 알기 쉬운 비밀번호로 생성. 토큰은 어차피 쿠키로 발급됨.
const TEST_MEMBER_PASSWORD = 'test1234';

/**
 * POST /api/admin/impersonate
 *
 * 관리자 전용. 테스트 회원(010-1111-1111)을 없으면 생성하고, 그 회원의
 * 세션 토큰을 발급해 쿠키로 교체한다. 응답 후 클라이언트가 페이지를 새로고침하면
 * AuthContext가 /api/auth/me 를 다시 읽어 member 화면으로 전환된다.
 *
 * 보안:
 *  - admin 역할만 호출 가능.
 *  - 전환 사실을 감사 로그에 남긴다(누가 언제 테스트 회원으로 들어갔는지).
 *  - 되돌아올 때는 그냥 로그아웃 후 관리자 계정으로 다시 로그인하면 됨(별도 처리 없음).
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse('관리자만 사용할 수 있습니다');

  await ensureSchema();

  try {
    // 1) 테스트 회원 조회. 없으면 생성.
    let member = await dbGet<any>(
      `SELECT id, name, phone, email, role, join_date, is_active, token_version
         FROM members WHERE phone = $1`,
      [TEST_MEMBER_PHONE]
    );

    if (!member) {
      const id = genId('mbr');
      const hash = await bcrypt.hash(TEST_MEMBER_PASSWORD, 10);
      const joinDate = new Date().toISOString().slice(0, 10);
      await dbRun(
        `INSERT INTO members (id, name, phone, email, password_hash, role, join_date, is_active, memo, must_change_password, token_version)
         VALUES ($1, $2, $3, NULL, $4, 'member', $5, TRUE, $6, FALSE, 0)`,
        [id, TEST_MEMBER_NAME, TEST_MEMBER_PHONE, hash, joinDate, '관리자 미리보기용 테스트 회원 (자동 생성)']
      );
      member = await dbGet<any>(
        `SELECT id, name, phone, email, role, join_date, is_active, token_version
           FROM members WHERE id = $1`,
        [id]
      );
    } else if (!member.is_active) {
      // 비활성화돼 있으면 다시 활성화(테스트 계정은 항상 사용 가능해야 함).
      await dbRun(`UPDATE members SET is_active = TRUE WHERE id = $1`, [member.id]);
      member.is_active = true;
    }

    if (!member) {
      return NextResponse.json({ error: '테스트 회원을 준비하지 못했습니다' }, { status: 500 });
    }

    // 2) 테스트 회원 토큰 발급 → 쿠키 교체.
    const token = await createToken({
      memberId: member.id,
      role: member.role, // 'member'
      name: member.name,
      tokenVersion: member.token_version ?? 0,
    });

    const response = NextResponse.json({
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        email: member.email,
        role: member.role,
        joinDate: member.join_date,
        isActive: !!member.is_active,
        mustChangePassword: false,
      },
    });
    setAuthCookie(response, token);

    // 3) 감사 로그(누가 테스트 회원으로 전환했는지) — fire-and-forget.
    void logAdminAction(req, auth.memberId, {
      action: 'member.update',
      targetType: 'member',
      targetId: member.id,
      targetName: member.name,
      summary: `관리자가 테스트 회원(${TEST_MEMBER_PHONE})으로 미리보기 전환`,
    });

    return response;
  } catch (e) {
    console.error('[admin/impersonate] error:', e);
    return NextResponse.json({ error: '테스트 회원 전환에 실패했습니다' }, { status: 500 });
  }
}
