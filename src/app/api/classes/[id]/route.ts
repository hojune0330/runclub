import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import {
  mapClassRow,
  mapTeamRow,
  mapEnrollmentRow,
  CLASS_KINDS,
  CLASS_STATUSES,
  METRIC_FOCUSES,
} from '@/lib/coaching';

// GET /api/classes/[id] — 클래스 상세 (팀 목록 + 내 등록정보 + 멤버 목록)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await ctx.params;

  try {
    const row = await dbGet<any>(
      `SELECT c.*, coach.name AS coach_name,
              (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = c.id AND e.status = 'active' AND e.role = 'member')::int AS member_count,
              (SELECT COUNT(*) FROM class_teams t WHERE t.class_id = c.id)::int AS team_count
         FROM classes c
         LEFT JOIN members coach ON c.coach_id = coach.id
        WHERE c.id = $1`,
      [id]
    );
    if (!row) return NextResponse.json({ error: '클래스를 찾을 수 없습니다' }, { status: 404 });

    const cls = mapClassRow(row);

    // 팀 목록 (멤버 수 포함)
    const teamRows = await dbAll<any>(
      `SELECT t.*,
              (SELECT COUNT(*) FROM class_enrollments e WHERE e.team_id = t.id AND e.status = 'active')::int AS member_count
         FROM class_teams t
        WHERE t.class_id = $1
        ORDER BY t.created_at ASC`,
      [id]
    );
    cls.teams = teamRows.map(mapTeamRow);

    // 내 등록정보
    const myRow = await dbGet<any>(
      `SELECT e.*, t.name AS team_name
         FROM class_enrollments e
         LEFT JOIN class_teams t ON e.team_id = t.id
        WHERE e.class_id = $1 AND e.member_id = $2`,
      [id, auth.memberId]
    );
    if (myRow) cls.myEnrollment = mapEnrollmentRow(myRow);

    const isCoach = myRow?.role === 'coach' || row.coach_id === auth.memberId;
    const canSeeRoster = auth.role === 'admin' || isCoach;

    // 멤버 목록은 관리자/코치만 (개인정보 보호). 일반 회원은 팀별 인원수만 본다.
    let enrollments: ReturnType<typeof mapEnrollmentRow>[] = [];
    if (canSeeRoster) {
      const enrollRows = await dbAll<any>(
        `SELECT e.*, m.name AS member_name, t.name AS team_name
           FROM class_enrollments e
           JOIN members m ON e.member_id = m.id
           LEFT JOIN class_teams t ON e.team_id = t.id
          WHERE e.class_id = $1 AND e.status != 'dropped'
          ORDER BY e.role = 'coach' DESC, e.joined_at ASC`,
        [id]
      );
      enrollments = enrollRows.map(mapEnrollmentRow);
    }

    return NextResponse.json({
      class: cls,
      enrollments,
      canManage: canSeeRoster,
    });
  } catch (e) {
    console.error('[classes/[id] GET] error:', e);
    return NextResponse.json({ error: '클래스 정보를 불러오지 못했습니다' }, { status: 500 });
  }
}

// PATCH /api/classes/[id] — 클래스 수정 (관리자/담당 코치)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await ctx.params;

  try {
    const existing = await dbGet<any>(`SELECT * FROM classes WHERE id = $1`, [id]);
    if (!existing) return NextResponse.json({ error: '클래스를 찾을 수 없습니다' }, { status: 404 });

    const isCoach = existing.coach_id === auth.memberId;
    if (auth.role !== 'admin' && !isCoach) return forbiddenResponse();

    const body = await req.json();
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;

    if (typeof body?.name === 'string') {
      const name = body.name.trim();
      if (!name || name.length > 80) {
        return NextResponse.json({ error: '클래스 이름이 올바르지 않습니다 (최대 80자)' }, { status: 400 });
      }
      sets.push(`name = $${i++}`); vals.push(name);
    }
    if (typeof body?.kind === 'string' && CLASS_KINDS.includes(body.kind)) {
      sets.push(`kind = $${i++}`); vals.push(body.kind);
    }
    if (typeof body?.metricFocus === 'string' && METRIC_FOCUSES.includes(body.metricFocus)) {
      sets.push(`metric_focus = $${i++}`); vals.push(body.metricFocus);
    }
    if (typeof body?.status === 'string' && CLASS_STATUSES.includes(body.status)) {
      sets.push(`status = $${i++}`); vals.push(body.status);
    }
    if ('goalSummary' in (body || {})) {
      sets.push(`goal_summary = $${i++}`); vals.push(body.goalSummary ? String(body.goalSummary).slice(0, 300) : null);
    }
    if ('startDate' in (body || {})) {
      sets.push(`start_date = $${i++}`); vals.push(body.startDate ? String(body.startDate).slice(0, 10) : null);
    }
    if ('endDate' in (body || {})) {
      sets.push(`end_date = $${i++}`); vals.push(body.endDate ? String(body.endDate).slice(0, 10) : null);
    }
    if ('coverImageUrl' in (body || {})) {
      sets.push(`cover_image_url = $${i++}`); vals.push(body.coverImageUrl ? String(body.coverImageUrl).slice(0, 500) : null);
    }
    if (typeof body?.leaderboardPublic === 'boolean') {
      sets.push(`leaderboard_public = $${i++}`); vals.push(body.leaderboardPublic);
    }
    // 코치 변경은 관리자만
    if (auth.role === 'admin' && typeof body?.coachId === 'string' && body.coachId) {
      sets.push(`coach_id = $${i++}`); vals.push(body.coachId);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: '수정할 항목이 없습니다' }, { status: 400 });
    }
    sets.push(`updated_at = NOW()`);
    vals.push(id);

    await dbRun(`UPDATE classes SET ${sets.join(', ')} WHERE id = $${i}`, vals);

    // 코치가 바뀌면 새 코치를 coach 역할로 등록(중복 무시)
    if (auth.role === 'admin' && typeof body?.coachId === 'string' && body.coachId) {
      await dbRun(
        `INSERT INTO class_enrollments (id, class_id, member_id, role, status)
         VALUES ($1, $2, $3, 'coach', 'active')
         ON CONFLICT (class_id, member_id) DO UPDATE SET role = 'coach', status = 'active'`,
        [genId('en'), id, body.coachId]
      );
    }

    void logAdminAction(req, auth.memberId, {
      action: 'class.update',
      targetType: 'class',
      targetId: id,
      targetName: existing.name,
      summary: `클래스 수정: ${existing.name}`,
      afterValue: body,
    });

    const updated = await dbGet<any>(
      `SELECT c.*, coach.name AS coach_name FROM classes c LEFT JOIN members coach ON c.coach_id = coach.id WHERE c.id = $1`,
      [id]
    );
    return NextResponse.json({ class: updated ? mapClassRow(updated) : null });
  } catch (e) {
    console.error('[classes/[id] PATCH] error:', e);
    return NextResponse.json({ error: '클래스 수정에 실패했습니다' }, { status: 500 });
  }
}

// DELETE /api/classes/[id] — 클래스 삭제 (관리자 전용). 보통은 archived 권장.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();
  await ensureSchema();
  const { id } = await ctx.params;

  try {
    const existing = await dbGet<any>(`SELECT * FROM classes WHERE id = $1`, [id]);
    if (!existing) return NextResponse.json({ error: '클래스를 찾을 수 없습니다' }, { status: 404 });

    // CASCADE 로 teams/enrollments/team_requests 함께 삭제됨
    await dbRun(`DELETE FROM classes WHERE id = $1`, [id]);

    void logAdminAction(req, auth.memberId, {
      action: 'class.delete',
      targetType: 'class',
      targetId: id,
      targetName: existing.name,
      summary: `클래스 삭제: ${existing.name}`,
      beforeValue: { name: existing.name, kind: existing.kind },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[classes/[id] DELETE] error:', e);
    return NextResponse.json({ error: '클래스 삭제에 실패했습니다' }, { status: 500 });
  }
}
