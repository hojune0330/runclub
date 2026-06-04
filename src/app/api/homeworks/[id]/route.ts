import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { grantMileage, COACHING_MILEAGE } from '@/lib/discount';
import { sendPushToMembers } from '@/lib/push';
import { mapHomeworkRow, mapHomeworkSubmissionRow } from '@/lib/coaching';
import type { HomeworkSubmission } from '@/types';

async function canManageClass(classId: string, memberId: string, role: string): Promise<boolean> {
  if (role === 'admin') return true;
  const cls = await dbGet<any>(`SELECT coach_id FROM classes WHERE id = $1`, [classId]);
  return !!cls && cls.coach_id === memberId;
}

// GET /api/homeworks/[id] — 과제 상세 + 제출 목록(코치/관리자) 또는 내 제출(회원)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await ctx.params;

  try {
    const hwRow = await dbGet<any>(
      `SELECT h.*, c.name AS class_name,
              (SELECT COUNT(*) FROM homework_submissions s WHERE s.homework_id = h.id)::int AS submission_count,
              (SELECT COUNT(*) FROM homework_submissions s WHERE s.homework_id = h.id AND s.status = 'verified')::int AS verified_count
         FROM homeworks h JOIN classes c ON h.class_id = c.id WHERE h.id = $1`,
      [id]
    );
    if (!hwRow) return NextResponse.json({ error: '과제를 찾을 수 없습니다' }, { status: 404 });
    const isManager = await canManageClass(hwRow.class_id, auth.memberId, auth.role);

    const hw = mapHomeworkRow(hwRow);

    let submissions: HomeworkSubmission[] = [];
    if (isManager) {
      const rows = await dbAll<any>(
        `SELECT s.*, m.name AS member_name FROM homework_submissions s
           JOIN members m ON s.member_id = m.id
          WHERE s.homework_id = $1 ORDER BY s.status = 'submitted' DESC, s.submitted_at DESC`,
        [id]
      );
      submissions = rows.map(mapHomeworkSubmissionRow);
    } else {
      const mine = await dbGet<any>(
        `SELECT s.*, m.name AS member_name FROM homework_submissions s
           JOIN members m ON s.member_id = m.id WHERE s.homework_id = $1 AND s.member_id = $2`,
        [id, auth.memberId]
      );
      if (mine) hw.mySubmission = mapHomeworkSubmissionRow(mine);
    }

    return NextResponse.json({ homework: hw, submissions, canManage: isManager });
  } catch (e) {
    console.error('[homeworks/[id] GET] error:', e);
    return NextResponse.json({ error: '과제 정보를 불러오지 못했습니다' }, { status: 500 });
  }
}

// POST /api/homeworks/[id] — 회원 제출(또는 갱신). distance metric은 활동기록 자동 합산 옵션.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await ctx.params;

  try {
    const hw = await dbGet<any>(`SELECT * FROM homeworks WHERE id = $1`, [id]);
    if (!hw) return NextResponse.json({ error: '과제를 찾을 수 없습니다' }, { status: 404 });

    const enrolled = await dbGet<any>(
      `SELECT 1 FROM class_enrollments WHERE class_id = $1 AND member_id = $2 AND status != 'dropped'`,
      [hw.class_id, auth.memberId]
    );
    if (!enrolled) return NextResponse.json({ error: '클래스 참여자만 제출할 수 있어요' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const note = body?.note ? String(body.note).slice(0, 500) : null;
    const photoUrl = body?.photoUrl ? String(body.photoUrl).slice(0, 500) : null;

    // 달성치: distance metric & autoSum 요청 시 활동기록에서 자동 합산
    let achievedValue: number | null =
      body?.achievedValue != null && Number.isFinite(Number(body.achievedValue)) ? Number(body.achievedValue) : null;

    if (hw.metric === 'distance' && body?.autoSum) {
      const sum = await dbGet<{ total: string }>(
        `SELECT COALESCE(SUM(distance_m),0)::text AS total FROM activity_logs
          WHERE member_id = $1 AND class_id = $2
            ${hw.period_start ? 'AND activity_date >= $3' : ''}
            ${hw.period_end ? `AND activity_date <= $${hw.period_start ? 4 : 3}` : ''}`,
        [auth.memberId, hw.class_id, hw.period_start, hw.period_end].filter(v => v != null) as any[]
      );
      achievedValue = Number(sum?.total ?? 0);
    }

    const subId = genId('hws');
    await dbRun(
      `INSERT INTO homework_submissions (id, homework_id, member_id, achieved_value, status, note, photo_url)
       VALUES ($1,$2,$3,$4,'submitted',$5,$6)
       ON CONFLICT (homework_id, member_id) DO UPDATE
         SET achieved_value = EXCLUDED.achieved_value,
             note = EXCLUDED.note,
             photo_url = EXCLUDED.photo_url,
             status = 'submitted',
             submitted_at = NOW()`,
      [subId, id, auth.memberId, achievedValue, note, photoUrl]
    );

    const row = await dbGet<any>(
      `SELECT s.*, m.name AS member_name FROM homework_submissions s JOIN members m ON s.member_id = m.id
        WHERE s.homework_id = $1 AND s.member_id = $2`,
      [id, auth.memberId]
    );
    return NextResponse.json({ submission: row ? mapHomeworkSubmissionRow(row) : null }, { status: 201 });
  } catch (e) {
    console.error('[homeworks/[id] POST] error:', e);
    return NextResponse.json({ error: '제출에 실패했습니다' }, { status: 500 });
  }
}

// PATCH /api/homeworks/[id] — 코치 검증(승인/반려). body: { submissionId, status, note? }
// 승인(verified) 시 +30P 적립.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await ctx.params;

  try {
    const hw = await dbGet<any>(`SELECT class_id, title FROM homeworks WHERE id = $1`, [id]);
    if (!hw) return NextResponse.json({ error: '과제를 찾을 수 없습니다' }, { status: 404 });
    if (!(await canManageClass(hw.class_id, auth.memberId, auth.role))) return forbiddenResponse();

    const body = await req.json();
    const submissionId = String(body?.submissionId ?? '');
    const status = ['verified', 'rejected', 'submitted'].includes(body?.status) ? body.status : null;
    if (!status) return NextResponse.json({ error: '상태(status)가 올바르지 않습니다' }, { status: 400 });
    const note = body?.note ? String(body.note).slice(0, 500) : null;

    const sub = await dbGet<any>(
      `SELECT * FROM homework_submissions WHERE id = $1 AND homework_id = $2`,
      [submissionId, id]
    );
    if (!sub) return NextResponse.json({ error: '제출을 찾을 수 없습니다' }, { status: 404 });

    await dbRun(
      `UPDATE homework_submissions SET status = $1, note = COALESCE($2, note) WHERE id = $3`,
      [status, note, submissionId]
    );

    // 검증 완료 시 마일리지 +30 (제출 id 기준 idempotent)
    let mileageEarned = 0;
    if (status === 'verified') {
      mileageEarned = await grantMileage(sub.member_id, COACHING_MILEAGE.HOMEWORK_VERIFIED, 'homework', submissionId);
    }

    void sendPushToMembers([sub.member_id], {
      title: status === 'verified' ? '과제가 인증됐어요 🎉' : status === 'rejected' ? '과제 재확인이 필요해요' : '과제 상태 변경',
      body: status === 'verified'
        ? `${hw.title} 인증 완료!${mileageEarned ? ` +${mileageEarned}P` : ''}`
        : `${hw.title} · ${note ?? '코치 코멘트를 확인해주세요'}`,
      url: '/app',
      tag: 'homework-result',
    });

    const row = await dbGet<any>(
      `SELECT s.*, m.name AS member_name FROM homework_submissions s JOIN members m ON s.member_id = m.id WHERE s.id = $1`,
      [submissionId]
    );
    return NextResponse.json({ submission: row ? mapHomeworkSubmissionRow(row) : null, mileageEarned });
  } catch (e) {
    console.error('[homeworks/[id] PATCH] error:', e);
    return NextResponse.json({ error: '검증 처리에 실패했습니다' }, { status: 500 });
  }
}
