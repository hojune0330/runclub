import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { mapTeamRow } from '@/lib/coaching';

// 담당 코치 또는 관리자인지 확인
async function canManageClass(classId: string, memberId: string, role: string): Promise<boolean> {
  if (role === 'admin') return true;
  const cls = await dbGet<any>(`SELECT coach_id FROM classes WHERE id = $1`, [classId]);
  return !!cls && cls.coach_id === memberId;
}

// GET /api/classes/[id]/teams — 팀 목록 (등록 회원 누구나 열람)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await ctx.params;

  try {
    const rows = await dbAll<any>(
      `SELECT t.*,
              (SELECT COUNT(*) FROM class_enrollments e WHERE e.team_id = t.id AND e.status = 'active')::int AS member_count
         FROM class_teams t
        WHERE t.class_id = $1
        ORDER BY t.created_at ASC`,
      [id]
    );
    return NextResponse.json({ teams: rows.map(mapTeamRow) });
  } catch (e) {
    console.error('[teams GET] error:', e);
    return NextResponse.json({ error: '팀 목록을 불러오지 못했습니다' }, { status: 500 });
  }
}

// POST /api/classes/[id]/teams — 팀 생성 (관리자/담당 코치 전용)
// 정책: 팀 생성은 코치/관리자만. 이용자는 team_requests 로 요청.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await ctx.params;

  try {
    const cls = await dbGet<any>(`SELECT id, name FROM classes WHERE id = $1`, [id]);
    if (!cls) return NextResponse.json({ error: '클래스를 찾을 수 없습니다' }, { status: 404 });

    if (!(await canManageClass(id, auth.memberId, auth.role))) return forbiddenResponse();

    const body = await req.json();
    const name = String(body?.name ?? '').trim();
    if (!name || name.length > 40) {
      return NextResponse.json({ error: '팀 이름을 입력해주세요 (최대 40자)' }, { status: 400 });
    }
    const color = body?.color ? String(body.color).slice(0, 20) : null;

    const teamId = genId('team');
    await dbRun(
      `INSERT INTO class_teams (id, class_id, name, color, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [teamId, id, name, color, auth.memberId]
    );

    void logAdminAction(req, auth.memberId, {
      action: 'team.create',
      targetType: 'team',
      targetId: teamId,
      targetName: name,
      summary: `팀 생성: ${cls.name} › ${name}`,
      afterValue: { classId: id, name, color },
    });

    const row = await dbGet<any>(
      `SELECT t.*, 0 AS member_count FROM class_teams t WHERE t.id = $1`,
      [teamId]
    );
    return NextResponse.json({ team: row ? mapTeamRow(row) : null }, { status: 201 });
  } catch (e) {
    console.error('[teams POST] error:', e);
    return NextResponse.json({ error: '팀 생성에 실패했습니다' }, { status: 500 });
  }
}
