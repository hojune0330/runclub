import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, dbTx, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import type { TrainingPlan, TrainingBlock, BlockIntensity } from '@/types';

const INTENSITIES: BlockIntensity[] = ['rest', 'easy', 'moderate', 'hard', 'peak'];

function mapBlock(r: any): TrainingBlock {
  return {
    id: r.id, planId: r.plan_id, sortOrder: r.sort_order ?? 0,
    label: r.label, daySpan: Number(r.day_span),
    intensity: (INTENSITIES.includes(r.intensity) ? r.intensity : 'moderate') as BlockIntensity,
    focus: r.focus ?? undefined,
    targetDistanceM: r.target_distance_m ?? undefined,
  };
}

function mapPlan(r: any, blocks: TrainingBlock[]): TrainingPlan {
  const cycleDays = Number(r.cycle_days);
  const anchor = new Date(r.anchor_date);
  const today = new Date(new Date().toISOString().slice(0, 10));
  const diffDays = Math.floor((today.getTime() - anchor.getTime()) / 86400000);
  let cyclePosition = 0, cycleIndex = 0, todayBlock: TrainingBlock | null = null;
  if (cycleDays > 0 && diffDays >= 0) {
    cycleIndex = Math.floor(diffDays / cycleDays);
    cyclePosition = diffDays - cycleIndex * cycleDays; // 0-base, 소수 가능
    // 블록 누적 day_span 으로 오늘 블록 찾기
    let acc = 0;
    for (const b of blocks) {
      if (cyclePosition < acc + b.daySpan) { todayBlock = b; break; }
      acc += b.daySpan;
    }
    if (!todayBlock && blocks.length) todayBlock = blocks[blocks.length - 1];
  }
  return {
    id: r.id, classId: r.class_id ?? undefined, memberId: r.member_id ?? undefined,
    name: r.name, cycleDays, anchorDate: String(r.anchor_date).slice(0, 10),
    isActive: !!r.is_active, note: r.note ?? undefined,
    createdBy: r.created_by ?? undefined, createdAt: r.created_at,
    blocks, todayBlock, cyclePosition, cycleIndex,
  };
}

async function canManageClass(classId: string, memberId: string, role: string): Promise<boolean> {
  if (role === 'admin') return true;
  const cls = await dbGet<any>(`SELECT coach_id FROM classes WHERE id = $1`, [classId]);
  return !!cls && cls.coach_id === memberId;
}

// GET /api/training-plans?classId=  또는  ?scope=mine
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const classId = req.nextUrl.searchParams.get('classId');
  const scope = req.nextUrl.searchParams.get('scope');

  let where = '', vals: any[] = [];
  if (classId) {
    const enrolled = await dbGet<any>(
      `SELECT 1 FROM class_enrollments WHERE class_id = $1 AND member_id = $2 AND status != 'dropped'`,
      [classId, auth.memberId]
    );
    const isManager = await canManageClass(classId, auth.memberId, auth.role);
    if (!enrolled && !isManager) return forbiddenResponse();
    where = `class_id = $1 AND is_active = TRUE`; vals = [classId];
  } else {
    // 개인 플랜 (scope=mine 기본)
    where = `member_id = $1 AND is_active = TRUE`; vals = [auth.memberId];
  }

  const plans = await dbAll<any>(`SELECT * FROM training_plans WHERE ${where} ORDER BY created_at DESC LIMIT 1`, vals);
  if (plans.length === 0) return NextResponse.json({ plan: null });

  const plan = plans[0];
  const blocks = await dbAll<any>(`SELECT * FROM training_blocks WHERE plan_id = $1 ORDER BY sort_order ASC`, [plan.id]);
  return NextResponse.json({ plan: mapPlan(plan, blocks.map(mapBlock)) });
}

// POST /api/training-plans  { classId?, name?, cycleDays?, anchorDate?, note?, blocks: [{label,daySpan,intensity,focus,targetDistanceM}] }
//  classId 지정 시 코치/관리자만. 미지정 시 본인 개인 플랜.
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }

  const classId = body?.classId ? String(body.classId) : null;
  if (classId && !(await canManageClass(classId, auth.memberId, auth.role))) return forbiddenResponse();

  const name = String(body?.name ?? '9.5일 주기화').slice(0, 60);
  const cycleDays = Number.isFinite(Number(body?.cycleDays)) && Number(body.cycleDays) > 0 ? Number(body.cycleDays) : 9.5;
  const anchorDate = body?.anchorDate ? String(body.anchorDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const note = body?.note ? String(body.note).slice(0, 300) : null;
  const blocks: any[] = Array.isArray(body?.blocks) ? body.blocks : [];

  const planId = genId('tplan');
  try {
    await dbTx(async (client) => {
      // 같은 대상의 기존 활성 플랜은 비활성화(1개만 활성)
      if (classId) {
        await client.query(`UPDATE training_plans SET is_active = FALSE WHERE class_id = $1`, [classId]);
      } else {
        await client.query(`UPDATE training_plans SET is_active = FALSE WHERE member_id = $1 AND class_id IS NULL`, [auth.memberId]);
      }
      await client.query(
        `INSERT INTO training_plans (id, class_id, member_id, name, cycle_days, anchor_date, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [planId, classId, classId ? null : auth.memberId, name, cycleDays, anchorDate, note, auth.memberId]
      );
      let order = 0;
      for (const b of blocks) {
        const label = String(b?.label ?? '').slice(0, 40);
        if (!label) continue;
        const daySpan = Number.isFinite(Number(b?.daySpan)) && Number(b.daySpan) > 0 ? Number(b.daySpan) : 1;
        const intensity = INTENSITIES.includes(b?.intensity) ? b.intensity : 'moderate';
        const focus = b?.focus ? String(b.focus).slice(0, 100) : null;
        const td = Number.isFinite(Number(b?.targetDistanceM)) ? Math.round(Number(b.targetDistanceM)) : null;
        await client.query(
          `INSERT INTO training_blocks (id, plan_id, sort_order, label, day_span, intensity, focus, target_distance_m)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [genId('tblk'), planId, order++, label, daySpan, intensity, focus, td]
        );
      }
    });
    const plan = await dbGet<any>(`SELECT * FROM training_plans WHERE id = $1`, [planId]);
    const bl = await dbAll<any>(`SELECT * FROM training_blocks WHERE plan_id = $1 ORDER BY sort_order ASC`, [planId]);
    return NextResponse.json({ plan: mapPlan(plan, bl.map(mapBlock)) }, { status: 201 });
  } catch (e) {
    console.error('[training-plans POST] error:', e);
    return NextResponse.json({ error: '주기화 플랜 저장 실패' }, { status: 500 });
  }
}

// DELETE /api/training-plans?id=
export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const plan = await dbGet<any>(`SELECT class_id, member_id FROM training_plans WHERE id = $1`, [id]);
  if (!plan) return NextResponse.json({ ok: true });
  if (plan.class_id) {
    if (!(await canManageClass(plan.class_id, auth.memberId, auth.role))) return forbiddenResponse();
  } else if (plan.member_id !== auth.memberId && auth.role !== 'admin') {
    return forbiddenResponse();
  }
  await dbRun(`DELETE FROM training_plans WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
