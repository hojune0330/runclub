import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { sendPushToMembers } from '@/lib/push';
import { mapTeamRequestRow } from '@/lib/coaching';

const REQUEST_KINDS = ['create', 'join', 'move'];

async function canManageClass(classId: string, memberId: string, role: string): Promise<boolean> {
  if (role === 'admin') return true;
  const cls = await dbGet<any>(`SELECT coach_id FROM classes WHERE id = $1`, [classId]);
  return !!cls && cls.coach_id === memberId;
}

// GET /api/team-requests?classId=&status=pending
//  - 회원: 본인이 낸 요청
//  - 관리자: 전체(필터 가능)
//  - 코치: 본인 담당 클래스의 요청
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const classId = req.nextUrl.searchParams.get('classId');
  const status = req.nextUrl.searchParams.get('status');
  const scope = req.nextUrl.searchParams.get('scope') || (auth.role === 'admin' ? 'manage' : 'mine');

  try {
    const where: string[] = [];
    const vals: any[] = [];
    let i = 1;

    if (scope === 'mine') {
      where.push(`r.member_id = $${i++}`); vals.push(auth.memberId);
    } else {
      // manage: 관리자 = 전체, 코치 = 본인 담당 클래스만
      if (auth.role !== 'admin') {
        where.push(`c.coach_id = $${i++}`); vals.push(auth.memberId);
      }
    }
    if (classId) { where.push(`r.class_id = $${i++}`); vals.push(classId); }
    if (status) { where.push(`r.status = $${i++}`); vals.push(status); }

    const rows = await dbAll<any>(
      `SELECT r.*, c.name AS class_name, m.name AS member_name, dt.name AS desired_team_name
         FROM team_requests r
         JOIN classes c ON r.class_id = c.id
         JOIN members m ON r.member_id = m.id
         LEFT JOIN class_teams dt ON r.desired_team_id = dt.id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY r.status = 'pending' DESC, r.created_at DESC
        LIMIT 200`,
      vals
    );
    return NextResponse.json({ requests: rows.map(mapTeamRequestRow) });
  } catch (e) {
    console.error('[team-requests GET] error:', e);
    return NextResponse.json({ error: '팀 요청 목록을 불러오지 못했습니다' }, { status: 500 });
  }
}

// POST /api/team-requests — 회원이 팀 생성/참여/이동 요청
// body: { classId, kind: 'create'|'join'|'move', desiredName?, desiredTeamId?, reason? }
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  try {
    const body = await req.json();
    const classId = String(body?.classId ?? '');
    const kind = REQUEST_KINDS.includes(body?.kind) ? body.kind : 'create';

    const cls = await dbGet<any>(`SELECT id, name, coach_id FROM classes WHERE id = $1`, [classId]);
    if (!cls) return NextResponse.json({ error: '클래스를 찾을 수 없습니다' }, { status: 404 });

    // 요청자는 해당 클래스에 등록되어 있어야 함
    const enrolled = await dbGet<any>(
      `SELECT id FROM class_enrollments WHERE class_id = $1 AND member_id = $2 AND status != 'dropped'`,
      [classId, auth.memberId]
    );
    if (!enrolled) {
      return NextResponse.json({ error: '먼저 클래스에 참여해야 팀을 요청할 수 있어요' }, { status: 400 });
    }

    // 중복 pending 방지
    const dup = await dbGet<any>(
      `SELECT id FROM team_requests WHERE class_id = $1 AND member_id = $2 AND status = 'pending'`,
      [classId, auth.memberId]
    );
    if (dup) {
      return NextResponse.json({ error: '이미 검토 대기 중인 팀 요청이 있어요' }, { status: 409 });
    }

    const desiredName = kind === 'create' ? String(body?.desiredName ?? '').trim().slice(0, 40) : null;
    if (kind === 'create' && !desiredName) {
      return NextResponse.json({ error: '만들고 싶은 팀 이름을 입력해주세요' }, { status: 400 });
    }
    let desiredTeamId: string | null = null;
    if (kind === 'join' || kind === 'move') {
      const team = await dbGet<any>(`SELECT id FROM class_teams WHERE id = $1 AND class_id = $2`, [String(body?.desiredTeamId ?? ''), classId]);
      if (!team) return NextResponse.json({ error: '참여하려는 팀을 찾을 수 없습니다' }, { status: 400 });
      desiredTeamId = team.id;
    }
    const reason = body?.reason ? String(body.reason).slice(0, 300) : null;

    const reqId = genId('treq');
    await dbRun(
      `INSERT INTO team_requests (id, class_id, member_id, kind, desired_team_id, desired_name, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [reqId, classId, auth.memberId, kind, desiredTeamId, desiredName, reason]
    );

    // 담당 코치에게 알림 (있으면)
    if (cls.coach_id) {
      void sendPushToMembers([cls.coach_id], {
        title: '새 팀 요청',
        body: `${cls.name}에 새로운 팀 요청이 도착했어요. 검토해주세요.`,
        url: '/admin',
        tag: 'team-request',
      });
    }

    const row = await dbGet<any>(
      `SELECT r.*, c.name AS class_name, m.name AS member_name, dt.name AS desired_team_name
         FROM team_requests r
         JOIN classes c ON r.class_id = c.id
         JOIN members m ON r.member_id = m.id
         LEFT JOIN class_teams dt ON r.desired_team_id = dt.id
        WHERE r.id = $1`,
      [reqId]
    );
    return NextResponse.json({ request: row ? mapTeamRequestRow(row) : null }, { status: 201 });
  } catch (e) {
    console.error('[team-requests POST] error:', e);
    return NextResponse.json({ error: '팀 요청에 실패했습니다' }, { status: 500 });
  }
}

// PATCH /api/team-requests — 관리자/코치 검토 (승인/거절)
// body: { id, action: 'approve'|'reject', note? }
// 승인 시: create → 팀 생성 후 요청자 배정 / join|move → 해당 팀에 배정
export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  try {
    const body = await req.json();
    const reqId = String(body?.id ?? '');
    const action = body?.action === 'approve' ? 'approve' : body?.action === 'reject' ? 'reject' : null;
    if (!action) return NextResponse.json({ error: '처리 동작(action)이 올바르지 않습니다' }, { status: 400 });
    const note = body?.note ? String(body.note).slice(0, 300) : null;

    const reqRow = await dbGet<any>(
      `SELECT r.*, c.name AS class_name, c.coach_id
         FROM team_requests r JOIN classes c ON r.class_id = c.id
        WHERE r.id = $1`,
      [reqId]
    );
    if (!reqRow) return NextResponse.json({ error: '요청을 찾을 수 없습니다' }, { status: 404 });
    if (reqRow.status !== 'pending') {
      return NextResponse.json({ error: '이미 처리된 요청입니다' }, { status: 409 });
    }
    if (!(await canManageClass(reqRow.class_id, auth.memberId, auth.role))) return forbiddenResponse();

    let assignedTeamId: string | null = null;
    let assignedTeamName: string | null = null;

    if (action === 'approve') {
      if (reqRow.kind === 'create') {
        // 팀 생성
        assignedTeamId = genId('team');
        assignedTeamName = reqRow.desired_name || '새 팀';
        await dbRun(
          `INSERT INTO class_teams (id, class_id, name, created_by) VALUES ($1, $2, $3, $4)`,
          [assignedTeamId, reqRow.class_id, assignedTeamName, auth.memberId]
        );
      } else {
        assignedTeamId = reqRow.desired_team_id;
        const t = await dbGet<any>(`SELECT name FROM class_teams WHERE id = $1`, [assignedTeamId]);
        assignedTeamName = t?.name ?? null;
      }
      // 요청자를 팀에 배정 (등록 보장)
      if (assignedTeamId) {
        await dbRun(
          `INSERT INTO class_enrollments (id, class_id, member_id, team_id, role, status)
           VALUES ($1, $2, $3, $4, 'member', 'active')
           ON CONFLICT (class_id, member_id) DO UPDATE SET team_id = $4, status = 'active'`,
          [genId('en'), reqRow.class_id, reqRow.member_id, assignedTeamId]
        );
      }
    }

    await dbRun(
      `UPDATE team_requests
          SET status = $1, resolved_by = $2, resolved_at = NOW(), resolution_note = $3
        WHERE id = $4`,
      [action === 'approve' ? 'approved' : 'rejected', auth.memberId, note, reqId]
    );

    void logAdminAction(req, auth.memberId, {
      action: action === 'approve' ? 'team_request.approve' : 'team_request.reject',
      targetType: 'team_request',
      targetId: reqId,
      targetName: reqRow.class_name,
      summary: `팀 요청 ${action === 'approve' ? '승인' : '거절'}: ${reqRow.class_name} (회원 ${reqRow.member_id})`,
      afterValue: { action, note, assignedTeamId, assignedTeamName },
    });

    // 요청자에게 결과 알림
    void sendPushToMembers([reqRow.member_id], {
      title: action === 'approve' ? '팀 요청이 승인됐어요' : '팀 요청 결과 안내',
      body: action === 'approve'
        ? `${reqRow.class_name} · ${assignedTeamName ?? '팀'}에 배정되었어요!`
        : `${reqRow.class_name} 팀 요청이 반려되었어요.${note ? ' (' + note + ')' : ''}`,
      url: '/app',
      tag: 'team-request-result',
    });

    const row = await dbGet<any>(
      `SELECT r.*, c.name AS class_name, m.name AS member_name, dt.name AS desired_team_name
         FROM team_requests r
         JOIN classes c ON r.class_id = c.id
         JOIN members m ON r.member_id = m.id
         LEFT JOIN class_teams dt ON r.desired_team_id = dt.id
        WHERE r.id = $1`,
      [reqId]
    );
    return NextResponse.json({
      request: row ? mapTeamRequestRow(row) : null,
      assignedTeamId,
      assignedTeamName,
    });
  } catch (e) {
    console.error('[team-requests PATCH] error:', e);
    return NextResponse.json({ error: '팀 요청 처리에 실패했습니다' }, { status: 500 });
  }
}
