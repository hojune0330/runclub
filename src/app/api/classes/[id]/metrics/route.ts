import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

// 건강 클래스 동적 지표 정의(BaroJaenfit 등). activity_logs.metrics(JSONB)에 매핑됨.
const VALUE_TYPES = ['number', 'percent', 'text'];

async function canManageClass(classId: string, memberId: string, role: string): Promise<boolean> {
  if (role === 'admin') return true;
  const cls = await dbGet<any>(`SELECT coach_id FROM classes WHERE id = $1`, [classId]);
  return !!cls && cls.coach_id === memberId;
}

function mapRow(r: any) {
  return {
    id: r.id,
    key: r.key,
    label: r.label,
    unit: r.unit ?? undefined,
    valueType: r.value_type,
    sortOrder: r.sort_order ?? 0,
  };
}

// GET /api/classes/[id]/metrics — 등록자/매니저 열람
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id: classId } = await params;

  const enrolled = await dbGet<any>(
    `SELECT 1 FROM class_enrollments WHERE class_id = $1 AND member_id = $2 AND status != 'dropped'`,
    [classId, auth.memberId]
  );
  const isManager = await canManageClass(classId, auth.memberId, auth.role);
  if (!enrolled && !isManager) return forbiddenResponse();

  const rows = await dbAll<any>(
    `SELECT * FROM class_metric_defs WHERE class_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [classId]
  );
  return NextResponse.json({ metrics: rows.map(mapRow) });
}

// POST /api/classes/[id]/metrics — 코치/관리자만. { key, label, unit?, valueType? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id: classId } = await params;

  if (!(await canManageClass(classId, auth.memberId, auth.role))) return forbiddenResponse();

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }

  const key = String(body?.key ?? '').trim().replace(/\s+/g, '_').toLowerCase();
  const label = String(body?.label ?? '').trim();
  const unit = body?.unit ? String(body.unit).trim() : null;
  const valueType = VALUE_TYPES.includes(body?.valueType) ? body.valueType : 'number';
  if (!key || !label) return NextResponse.json({ error: 'key와 label이 필요합니다' }, { status: 400 });

  const cnt = await dbGet<any>(`SELECT COUNT(*)::int AS c FROM class_metric_defs WHERE class_id = $1`, [classId]);
  const sortOrder = cnt?.c ?? 0;

  try {
    const id = genId('cmd');
    await dbRun(
      `INSERT INTO class_metric_defs (id, class_id, key, label, unit, value_type, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (class_id, key) DO UPDATE SET label = EXCLUDED.label, unit = EXCLUDED.unit, value_type = EXCLUDED.value_type`,
      [id, classId, key, label, unit, valueType, sortOrder]
    );
    const row = await dbGet<any>(`SELECT * FROM class_metric_defs WHERE class_id = $1 AND key = $2`, [classId, key]);
    return NextResponse.json({ metric: mapRow(row) });
  } catch (e) {
    console.error('[class metrics POST] error:', e);
    return NextResponse.json({ error: '지표 추가 실패' }, { status: 500 });
  }
}

// DELETE /api/classes/[id]/metrics?id=
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id: classId } = await params;

  if (!(await canManageClass(classId, auth.memberId, auth.role))) return forbiddenResponse();

  const metricId = req.nextUrl.searchParams.get('id');
  if (!metricId) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  await dbRun(`DELETE FROM class_metric_defs WHERE id = $1 AND class_id = $2`, [metricId, classId]);
  return NextResponse.json({ ok: true });
}
