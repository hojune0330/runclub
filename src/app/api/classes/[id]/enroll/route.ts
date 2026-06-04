import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { mapEnrollmentRow } from '@/lib/coaching';

async function canManageClass(classId: string, memberId: string, role: string): Promise<boolean> {
  if (role === 'admin') return true;
  const cls = await dbGet<any>(`SELECT coach_id FROM classes WHERE id = $1`, [classId]);
  return !!cls && cls.coach_id === memberId;
}

// POST /api/classes/[id]/enroll
//  - 회원 본인: { } 또는 { goalText, goalTarget } → 본인 등록(active 클래스만)
//  - 관리자/코치: { memberId, teamId?, role? } → 특정 회원 등록 + 팀 배정
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await ctx.params;

  try {
    const cls = await dbGet<any>(`SELECT id, name, status FROM classes WHERE id = $1`, [id]);
    if (!cls) return NextResponse.json({ error: '클래스를 찾을 수 없습니다' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const isManager = await canManageClass(id, auth.memberId, auth.role);

    // 대상 회원 결정: 매니저가 memberId 지정 시 그 회원, 아니면 본인
    const targetMemberId = isManager && body?.memberId ? String(body.memberId) : auth.memberId;

    // 본인 등록은 active 클래스만 허용
    if (!isManager && cls.status !== 'active') {
      return NextResponse.json({ error: '현재 등록할 수 없는 클래스입니다' }, { status: 400 });
    }
    // 매니저가 아닌데 남을 등록하려는 경우 차단
    if (!isManager && body?.memberId && String(body.memberId) !== auth.memberId) {
      return forbiddenResponse();
    }

    // 팀 배정/역할은 매니저만
    let teamId: string | null = null;
    if (isManager && body?.teamId) {
      const team = await dbGet<any>(`SELECT id FROM class_teams WHERE id = $1 AND class_id = $2`, [String(body.teamId), id]);
      if (!team) return NextResponse.json({ error: '해당 클래스의 팀이 아닙니다' }, { status: 400 });
      teamId = team.id;
    }
    const role = isManager && body?.role === 'coach' ? 'coach' : 'member';
    const goalText = body?.goalText ? String(body.goalText).slice(0, 200) : null;
    const goalTarget = body?.goalTarget != null && Number.isFinite(Number(body.goalTarget)) ? Number(body.goalTarget) : null;

    const enId = genId('en');
    await dbRun(
      `INSERT INTO class_enrollments (id, class_id, member_id, team_id, role, goal_text, goal_target, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       ON CONFLICT (class_id, member_id) DO UPDATE
         SET status = 'active',
             team_id = COALESCE(EXCLUDED.team_id, class_enrollments.team_id),
             goal_text = COALESCE(EXCLUDED.goal_text, class_enrollments.goal_text),
             goal_target = COALESCE(EXCLUDED.goal_target, class_enrollments.goal_target)`,
      [enId, id, targetMemberId, teamId, role, goalText, goalTarget]
    );

    if (isManager && targetMemberId !== auth.memberId) {
      void logAdminAction(req, auth.memberId, {
        action: teamId ? 'team.assign' : 'class.enroll',
        targetType: 'class',
        targetId: id,
        targetName: cls.name,
        summary: `회원 등록: ${cls.name} (회원 ${targetMemberId})${teamId ? ' / 팀 배정' : ''}`,
        afterValue: { memberId: targetMemberId, teamId, role },
      });
    }

    const row = await dbGet<any>(
      `SELECT e.*, m.name AS member_name, t.name AS team_name
         FROM class_enrollments e
         JOIN members m ON e.member_id = m.id
         LEFT JOIN class_teams t ON e.team_id = t.id
        WHERE e.class_id = $1 AND e.member_id = $2`,
      [id, targetMemberId]
    );
    return NextResponse.json({ enrollment: row ? mapEnrollmentRow(row) : null }, { status: 201 });
  } catch (e) {
    console.error('[enroll POST] error:', e);
    return NextResponse.json({ error: '등록에 실패했습니다' }, { status: 500 });
  }
}

// DELETE /api/classes/[id]/enroll?memberId=...
//  - 회원 본인: 본인 탈퇴 (status='dropped')
//  - 관리자/코치: 특정 회원 탈퇴
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await ctx.params;

  try {
    const cls = await dbGet<any>(`SELECT id, name FROM classes WHERE id = $1`, [id]);
    if (!cls) return NextResponse.json({ error: '클래스를 찾을 수 없습니다' }, { status: 404 });

    const isManager = await canManageClass(id, auth.memberId, auth.role);
    const targetMemberId = isManager && req.nextUrl.searchParams.get('memberId')
      ? String(req.nextUrl.searchParams.get('memberId'))
      : auth.memberId;

    if (!isManager && targetMemberId !== auth.memberId) return forbiddenResponse();

    await dbRun(
      `UPDATE class_enrollments SET status = 'dropped', team_id = NULL WHERE class_id = $1 AND member_id = $2`,
      [id, targetMemberId]
    );

    if (isManager && targetMemberId !== auth.memberId) {
      void logAdminAction(req, auth.memberId, {
        action: 'class.unenroll',
        targetType: 'class',
        targetId: id,
        targetName: cls.name,
        summary: `회원 등록 해제: ${cls.name} (회원 ${targetMemberId})`,
        beforeValue: { memberId: targetMemberId },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[enroll DELETE] error:', e);
    return NextResponse.json({ error: '등록 해제에 실패했습니다' }, { status: 500 });
  }
}
