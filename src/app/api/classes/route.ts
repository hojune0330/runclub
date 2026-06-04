import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { mapClassRow, CLASS_KINDS, METRIC_FOCUSES } from '@/lib/coaching';

// GET /api/classes?scope=mine|all
//  - 회원: 기본 'mine'(내가 등록한 클래스) + 'all'(전체 active 목록, 둘러보기)
//  - 관리자: 'all' 전체
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const scope = req.nextUrl.searchParams.get('scope') || 'mine';

  try {
    if (scope === 'mine' && auth.role !== 'admin') {
      const rows = await dbAll<any>(
        `SELECT c.*, coach.name AS coach_name,
                (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = c.id AND e.status = 'active')::int AS member_count,
                (SELECT COUNT(*) FROM class_teams t WHERE t.class_id = c.id)::int AS team_count
           FROM class_enrollments en
           JOIN classes c ON en.class_id = c.id
           LEFT JOIN members coach ON c.coach_id = coach.id
          WHERE en.member_id = $1 AND en.status != 'dropped'
          ORDER BY c.status = 'active' DESC, c.start_date DESC NULLS LAST, c.created_at DESC`,
        [auth.memberId]
      );
      return NextResponse.json({ classes: rows.map(mapClassRow) });
    }

    // all (둘러보기/관리자)
    const rows = await dbAll<any>(
      `SELECT c.*, coach.name AS coach_name,
              (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = c.id AND e.status = 'active')::int AS member_count,
              (SELECT COUNT(*) FROM class_teams t WHERE t.class_id = c.id)::int AS team_count
         FROM classes c
         LEFT JOIN members coach ON c.coach_id = coach.id
        ${auth.role === 'admin' ? '' : "WHERE c.status = 'active'"}
        ORDER BY c.status = 'active' DESC, c.start_date DESC NULLS LAST, c.created_at DESC
        LIMIT 200`,
      []
    );
    return NextResponse.json({ classes: rows.map(mapClassRow) });
  } catch (e) {
    console.error('[classes GET] error:', e);
    return NextResponse.json({ error: '클래스 목록을 불러오지 못했습니다' }, { status: 500 });
  }
}

// POST /api/classes  (관리자/코치 전용) — 클래스 생성
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();
  await ensureSchema();

  try {
    const body = await req.json();
    const name = String(body?.name ?? '').trim();
    if (!name || name.length > 80) {
      return NextResponse.json({ error: '클래스 이름을 입력해주세요 (최대 80자)' }, { status: 400 });
    }
    const kind = CLASS_KINDS.includes(body?.kind) ? body.kind : 'custom';
    const metricFocus = METRIC_FOCUSES.includes(body?.metricFocus) ? body.metricFocus : 'distance';
    const goalSummary = body?.goalSummary ? String(body.goalSummary).slice(0, 300) : null;
    const startDate = body?.startDate ? String(body.startDate).slice(0, 10) : null;
    const endDate = body?.endDate ? String(body.endDate).slice(0, 10) : null;
    const coverImageUrl = body?.coverImageUrl ? String(body.coverImageUrl).slice(0, 500) : null;
    const leaderboardPublic = body?.leaderboardPublic !== false;
    // 코치 지정: 명시 없으면 생성한 관리자 본인
    const coachId = body?.coachId ? String(body.coachId) : auth.memberId;

    const id = genId('cls');
    await dbRun(
      `INSERT INTO classes
         (id, name, kind, goal_summary, coach_id, start_date, end_date, status, metric_focus, cover_image_url, leaderboard_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10)`,
      [id, name, kind, goalSummary, coachId, startDate, endDate, metricFocus, coverImageUrl, leaderboardPublic]
    );

    // 코치를 클래스에 coach 역할로 자동 등록(중복 무시)
    await dbRun(
      `INSERT INTO class_enrollments (id, class_id, member_id, role, status)
       VALUES ($1, $2, $3, 'coach', 'active')
       ON CONFLICT (class_id, member_id) DO UPDATE SET role = 'coach', status = 'active'`,
      [genId('en'), id, coachId]
    );

    void logAdminAction(req, auth.memberId, {
      action: 'class.create',
      targetType: 'class',
      targetId: id,
      targetName: name,
      summary: `클래스 생성: ${name} (${kind})`,
      afterValue: { name, kind, metricFocus, coachId },
    });

    const row = await dbGet<any>(
      `SELECT c.*, coach.name AS coach_name, 1 AS member_count, 0 AS team_count
         FROM classes c LEFT JOIN members coach ON c.coach_id = coach.id
        WHERE c.id = $1`,
      [id]
    );
    return NextResponse.json({ class: row ? mapClassRow(row) : null }, { status: 201 });
  } catch (e) {
    console.error('[classes POST] error:', e);
    return NextResponse.json({ error: '클래스 생성에 실패했습니다' }, { status: 500 });
  }
}
