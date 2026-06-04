import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { sendPushToMembers } from '@/lib/push';
import { mapHomeworkRow, mapHomeworkSubmissionRow, HOMEWORK_METRICS } from '@/lib/coaching';

async function canManageClass(classId: string, memberId: string, role: string): Promise<boolean> {
  if (role === 'admin') return true;
  const cls = await dbGet<any>(`SELECT coach_id FROM classes WHERE id = $1`, [classId]);
  return !!cls && cls.coach_id === memberId;
}

// GET /api/homeworks?classId=  — 클래스 과제 목록 + 내 제출현황
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const classId = req.nextUrl.searchParams.get('classId');
  if (!classId) return NextResponse.json({ error: 'classId가 필요합니다' }, { status: 400 });

  try {
    const enrolled = await dbGet<any>(
      `SELECT 1 FROM class_enrollments WHERE class_id = $1 AND member_id = $2 AND status != 'dropped'`,
      [classId, auth.memberId]
    );
    const cls = await dbGet<any>(`SELECT coach_id FROM classes WHERE id = $1`, [classId]);
    const isManager = auth.role === 'admin' || cls?.coach_id === auth.memberId;
    if (!enrolled && !isManager) return forbiddenResponse();

    const rows = await dbAll<any>(
      `SELECT h.*,
              (SELECT COUNT(*) FROM homework_submissions s WHERE s.homework_id = h.id)::int AS submission_count,
              (SELECT COUNT(*) FROM homework_submissions s WHERE s.homework_id = h.id AND s.status = 'verified')::int AS verified_count
         FROM homeworks h
        WHERE h.class_id = $1
        ORDER BY h.period_end DESC NULLS LAST, h.created_at DESC`,
      [classId]
    );
    const homeworks = rows.map(mapHomeworkRow);

    // 내 제출현황 붙이기
    if (homeworks.length > 0) {
      const subs = await dbAll<any>(
        `SELECT * FROM homework_submissions WHERE member_id = $1 AND homework_id = ANY($2::text[])`,
        [auth.memberId, homeworks.map(h => h.id)]
      );
      const byHw = new Map(subs.map(s => [s.homework_id, s]));
      for (const h of homeworks) {
        const s = byHw.get(h.id);
        if (s) h.mySubmission = mapHomeworkSubmissionRow(s);
      }
    }

    return NextResponse.json({ homeworks, canManage: isManager });
  } catch (e) {
    console.error('[homeworks GET] error:', e);
    return NextResponse.json({ error: '과제를 불러오지 못했습니다' }, { status: 500 });
  }
}

// POST /api/homeworks — 과제 생성(코치/관리자)
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  try {
    const body = await req.json();
    const classId = String(body?.classId ?? '');
    const cls = await dbGet<any>(`SELECT id, name FROM classes WHERE id = $1`, [classId]);
    if (!cls) return NextResponse.json({ error: '클래스를 찾을 수 없습니다' }, { status: 404 });
    if (!(await canManageClass(classId, auth.memberId, auth.role))) return forbiddenResponse();

    const title = String(body?.title ?? '').trim();
    if (!title || title.length > 100) {
      return NextResponse.json({ error: '과제 제목을 입력해주세요 (최대 100자)' }, { status: 400 });
    }
    const metric = HOMEWORK_METRICS.includes(body?.metric) ? body.metric : 'freeform';
    const description = body?.description ? String(body.description).slice(0, 500) : null;
    const targetValue = body?.targetValue != null && Number.isFinite(Number(body.targetValue)) ? Number(body.targetValue) : null;
    const periodStart = body?.periodStart ? String(body.periodStart).slice(0, 10) : null;
    const periodEnd = body?.periodEnd ? String(body.periodEnd).slice(0, 10) : null;

    const id = genId('hw');
    await dbRun(
      `INSERT INTO homeworks (id, class_id, title, description, metric, target_value, period_start, period_end, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, classId, title, description, metric, targetValue, periodStart, periodEnd, auth.memberId]
    );

    void logAdminAction(req, auth.memberId, {
      action: 'class.update',
      targetType: 'class',
      targetId: classId,
      targetName: cls.name,
      summary: `과제 생성: ${cls.name} › ${title}`,
      afterValue: { homeworkId: id, title, metric, targetValue },
    });

    // 클래스 멤버에게 새 과제 알림
    const members = await dbAll<{ member_id: string }>(
      `SELECT member_id FROM class_enrollments WHERE class_id = $1 AND status = 'active' AND role = 'member'`,
      [classId]
    );
    if (members.length > 0) {
      void sendPushToMembers(members.map(m => m.member_id), {
        title: '새 과제가 등록됐어요',
        body: `${cls.name} · ${title}`,
        url: '/app',
        tag: 'homework',
      });
    }

    const row = await dbGet<any>(
      `SELECT h.*, 0 AS submission_count, 0 AS verified_count FROM homeworks h WHERE h.id = $1`,
      [id]
    );
    return NextResponse.json({ homework: row ? mapHomeworkRow(row) : null }, { status: 201 });
  } catch (e) {
    console.error('[homeworks POST] error:', e);
    return NextResponse.json({ error: '과제 생성에 실패했습니다' }, { status: 500 });
  }
}

// DELETE /api/homeworks?id=  — 과제 삭제(코치/관리자)
export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });

  try {
    const hw = await dbGet<any>(`SELECT class_id, title FROM homeworks WHERE id = $1`, [id]);
    if (!hw) return NextResponse.json({ error: '과제를 찾을 수 없습니다' }, { status: 404 });
    if (!(await canManageClass(hw.class_id, auth.memberId, auth.role))) return forbiddenResponse();

    await dbRun(`DELETE FROM homeworks WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[homeworks DELETE] error:', e);
    return NextResponse.json({ error: '삭제에 실패했습니다' }, { status: 500 });
  }
}
