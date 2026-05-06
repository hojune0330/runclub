import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { safeSync } from '@/lib/sheets';
import { mapMemberRow } from '@/lib/sheets-mappers';
import { logAdminAction } from '@/lib/audit';

/**
 * PR-5: Promote / demote between 'member' and 'admin'.
 *
 *   PATCH /api/members/[id]/role
 *   Body: { role: 'member' | 'admin' }
 *
 *  - Admin only.
 *  - Bumps token_version on demotion so the affected user is logged out
 *    immediately and loses admin privileges on their next request.
 *  - Refuses to demote the LAST remaining admin (defence against locking
 *    the team out of the admin panel).
 *  - Refuses self-demotion (an admin must ask another admin to do this).
 *  - Mirrors the role change to the Members sheet (column E) and writes
 *    an audit-log entry.
 */
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
  const newRole = body?.role;
  if (newRole !== 'member' && newRole !== 'admin') {
    return NextResponse.json(
      { error: "role은 'member' 또는 'admin' 여야 합니다" },
      { status: 400 }
    );
  }

  if (id === auth.memberId && newRole === 'member') {
    return NextResponse.json(
      { error: '본인 권한은 스스로 변경할 수 없습니다. 다른 관리자에게 요청하세요.' },
      { status: 400 }
    );
  }

  try {
    const target = await dbGet<{ id: string; name: string; role: string; is_active: boolean }>(
      'SELECT id, name, role, is_active FROM members WHERE id = $1',
      [id]
    );
    if (!target) {
      return NextResponse.json({ error: '회원을 찾을 수 없습니다' }, { status: 404 });
    }

    if (target.role === newRole) {
      return NextResponse.json(
        { success: true, id, role: newRole, message: '이미 동일한 권한입니다' }
      );
    }

    // Defence: prevent demoting the last active admin.
    if (target.role === 'admin' && newRole === 'member') {
      const remaining = await dbGet<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM members
          WHERE role = 'admin' AND is_active = TRUE AND id <> $1`,
        [id]
      );
      if ((remaining?.count ?? 0) === 0) {
        return NextResponse.json(
          { error: '최소 1명의 활성 관리자가 필요합니다. 다른 관리자를 먼저 추가하세요.' },
          { status: 409 }
        );
      }
    }

    // On demotion bump token_version to force logout. Promotions don't need it
    // (the next refresh of /api/auth/me reflects the elevated role).
    if (newRole === 'member') {
      await dbRun(
        `UPDATE members
            SET role = 'member',
                token_version = token_version + 1,
                updated_at = NOW()
          WHERE id = $1`,
        [id]
      );
    } else {
      await dbRun(
        `UPDATE members
            SET role = 'admin',
                updated_at = NOW()
          WHERE id = $1`,
        [id]
      );
    }

    // Sheet mirror — re-read post-update so column E reflects the new role
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
      action: 'member.role_change',
      targetType: 'member',
      targetId: target.id,
      targetName: target.name,
      summary: `권한 ${target.role} → ${newRole}`,
      beforeValue: { role: target.role },
      afterValue: { role: newRole },
    });

    return NextResponse.json({ success: true, id, role: newRole });
  } catch (error: any) {
    console.error('[members role PATCH] error:', error?.message ?? error);
    return NextResponse.json(
      { error: '권한 변경 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
