import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { safeSync } from '@/lib/sheets';
import { mapMemberRow } from '@/lib/sheets-mappers';
import { logAdminAction } from '@/lib/audit';

/**
 * PR-5: Per-member admin actions.
 *
 *   DELETE /api/members/[id]
 *     - Hard-deletes a member record. Permitted ONLY when the member has
 *       no historical references (reservations, waitlist entries, passes,
 *       notice reads). If any history exists, returns 409 Conflict and the
 *       admin must use deactivation (PATCH ?action=deactivate) instead, so
 *       audit trails and Sheet history remain intact.
 *
 *   PATCH /api/members/[id]
 *     - Body: { action: 'deactivate' | 'activate' }
 *     - Toggles is_active flag. Deactivation also bumps token_version,
 *       immediately invalidating the member's outstanding JWTs.
 *     - Mirrored to the Members sheet (status column G) without touching the
 *       manager memo columns (J~O).
 *
 * The endpoints below intentionally do NOT touch password_hash. Reactivation
 * clears stale login lockout fields so an admin action does not accidentally
 * leave a member unable to log in after being restored.
 */

export async function DELETE(
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

  if (id === auth.memberId) {
    return NextResponse.json(
      { error: '본인 계정은 삭제할 수 없습니다' },
      { status: 400 }
    );
  }

  try {
    const member = await dbGet<{ id: string; name: string; role: string }>(
      'SELECT id, name, role FROM members WHERE id = $1',
      [id]
    );
    if (!member) {
      return NextResponse.json({ error: '회원을 찾을 수 없습니다' }, { status: 404 });
    }

    // Defence in depth: don't let a non-self admin be hard-deleted from this
    // endpoint either — admins must be demoted first via member edit.
    if (member.role === 'admin') {
      return NextResponse.json(
        { error: '관리자 권한 회원은 삭제할 수 없습니다. 먼저 권한을 일반 회원으로 변경하세요.' },
        { status: 400 }
      );
    }

    // History check — refuse hard delete if any references exist.
    const refs = await dbGet<{
      reservations: number;
      passes: number;
      waitlist: number;
      notice_reads: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM reservations    WHERE member_id = $1)::int AS reservations,
         (SELECT COUNT(*) FROM member_passes   WHERE member_id = $1)::int AS passes,
         (SELECT COUNT(*) FROM waitlist        WHERE member_id = $1)::int AS waitlist,
         (SELECT COUNT(*) FROM notice_reads    WHERE member_id = $1)::int AS notice_reads`,
      [id]
    );

    const total =
      (refs?.reservations ?? 0) +
      (refs?.passes ?? 0) +
      (refs?.waitlist ?? 0) +
      (refs?.notice_reads ?? 0);

    if (total > 0) {
      return NextResponse.json(
        {
          error:
            '예약/수강권/대기/공지읽음 이력이 있어 삭제할 수 없습니다. 비활성화로 처리해 주세요.',
          references: refs,
        },
        { status: 409 }
      );
    }

    await dbRun('DELETE FROM members WHERE id = $1', [id]);

    // Sheets mirror: mark the member row inactive (we never delete sheet rows
    // because column J~O may contain manager memos worth preserving).
    try {
      void safeSync(
        'members',
        'upsert',
        mapMemberRow({
          id: member.id,
          name: member.name,
          phone: '',
          email: null,
          role: member.role,
          join_date: null,
          is_active: false,
          memo: '[삭제됨]',
        })
      );
    } catch {
      /* never break the response on sheet failure */
    }

    void logAdminAction(req, auth.memberId, {
      action: 'member.delete',
      targetType: 'member',
      targetId: member.id,
      targetName: member.name,
      summary: '관리자가 회원 영구 삭제 (이력 없음 확인 후)',
      beforeValue: { id: member.id, name: member.name, role: member.role },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error('[members DELETE] error:', error?.message ?? error);
    return NextResponse.json(
      { error: '회원 삭제 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const action = body?.action;
  if (action !== 'deactivate' && action !== 'activate') {
    return NextResponse.json(
      { error: "action은 'deactivate' 또는 'activate' 여야 합니다" },
      { status: 400 }
    );
  }

  if (id === auth.memberId && action === 'deactivate') {
    return NextResponse.json(
      { error: '본인 계정은 비활성화할 수 없습니다' },
      { status: 400 }
    );
  }

  try {
    const member = await dbGet<{ id: string; is_active: boolean; role: string }>(
      'SELECT id, is_active, role FROM members WHERE id = $1',
      [id]
    );
    if (!member) {
      return NextResponse.json({ error: '회원을 찾을 수 없습니다' }, { status: 404 });
    }

    if (action === 'deactivate') {
      await dbRun(
        `UPDATE members
            SET is_active = FALSE,
                token_version = token_version + 1,
                updated_at = NOW()
          WHERE id = $1`,
        [id]
      );
    } else {
      await dbRun(
        `UPDATE members
            SET is_active = TRUE,
                failed_login_count = 0,
                locked_until = NULL,
                last_login_failed_at = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [id]
      );
    }

    // Re-read post-update for sheet mirror
    try {
      const updated = await dbGet<any>(
        `SELECT id, name, phone, email, role, join_date, is_active, memo
           FROM members WHERE id = $1`,
        [id]
      );
      if (updated) {
        void safeSync('members', 'upsert', mapMemberRow(updated));
      }
    } catch {
      /* swallow */
    }

    void logAdminAction(req, auth.memberId, {
      action: action === 'deactivate' ? 'member.deactivate' : 'member.activate',
      targetType: 'member',
      targetId: id,
      targetName: null,
      summary:
        action === 'deactivate'
          ? '관리자가 회원을 비활성화 (모든 세션 즉시 무효화)'
          : '관리자가 회원을 다시 활성화 (로그인 잠금 상태 초기화)',
      beforeValue: { is_active: !!member.is_active },
      afterValue: { is_active: action === 'activate', loginLockCleared: action === 'activate' },
    });

    return NextResponse.json({ success: true, id, action });
  } catch (error: any) {
    console.error('[members PATCH] error:', error?.message ?? error);
    return NextResponse.json(
      { error: '회원 상태 변경 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
