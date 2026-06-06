import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { grantMileage, COACHING_MILEAGE } from '@/lib/discount';
import { mapActivityRow, ACTIVITY_KINDS, ACTIVITY_SOURCES } from '@/lib/coaching';

// GET /api/activities?classId=&memberId=&limit=
//  - classId 지정: 해당 클래스 피드(등록자만). 멤버는 본인+같은 클래스 동료 기록 열람(공유 문화)
//  - classId 없음: 내 전체 활동
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const classId = req.nextUrl.searchParams.get('classId');
  const memberId = req.nextUrl.searchParams.get('memberId');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 50, 200);

  try {
    const where: string[] = [];
    const vals: any[] = [];
    let i = 1;

    if (classId) {
      // 등록 확인
      const enrolled = await dbGet<any>(
        `SELECT 1 FROM class_enrollments WHERE class_id = $1 AND member_id = $2 AND status != 'dropped'`,
        [classId, auth.memberId]
      );
      const cls = await dbGet<any>(`SELECT coach_id FROM classes WHERE id = $1`, [classId]);
      const isManager = auth.role === 'admin' || cls?.coach_id === auth.memberId;
      if (!enrolled && !isManager) return forbiddenResponse();
      where.push(`a.class_id = $${i++}`); vals.push(classId);
      if (memberId) { where.push(`a.member_id = $${i++}`); vals.push(memberId); }
    } else {
      // 내 활동만
      where.push(`a.member_id = $${i++}`); vals.push(auth.memberId);
    }

    const rows = await dbAll<any>(
      `SELECT a.*, m.name AS member_name,
              (SELECT COUNT(*) FROM encouragements e WHERE e.target_type = 'activity' AND e.target_id = a.id AND e.kind != 'comment')::int AS cheer_count,
              (SELECT COUNT(*) FROM encouragements e WHERE e.target_type = 'activity' AND e.target_id = a.id AND e.kind = 'comment')::int AS comment_count
         FROM activity_logs a
         JOIN members m ON a.member_id = m.id
        WHERE ${where.join(' AND ')}
        ORDER BY a.activity_date DESC, a.created_at DESC
        LIMIT ${limit}`,
      vals
    );
    return NextResponse.json({ activities: rows.map(mapActivityRow) });
  } catch (e) {
    console.error('[activities GET] error:', e);
    return NextResponse.json({ error: '활동 기록을 불러오지 못했습니다' }, { status: 500 });
  }
}

// POST /api/activities — 활동 기록 추가(수동). 러닝/건강 공통.
// 적립: 활동 +10P(하루 최대 2건), 10km+ 롱런 추가 +20P
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  try {
    const body = await req.json();
    const kind = ACTIVITY_KINDS.includes(body?.kind) ? body.kind : 'run';
    const source = ACTIVITY_SOURCES.includes(body?.source) ? body.source : 'manual';
    const activityDate = body?.activityDate ? String(body.activityDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const classId = body?.classId ? String(body.classId) : null;

    // 클래스 지정 시 등록 확인
    if (classId) {
      const enrolled = await dbGet<any>(
        `SELECT 1 FROM class_enrollments WHERE class_id = $1 AND member_id = $2 AND status != 'dropped'`,
        [classId, auth.memberId]
      );
      if (!enrolled) return NextResponse.json({ error: '먼저 클래스에 참여해주세요' }, { status: 400 });
    }

    const toIntOrNull = (v: any) => (v != null && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
    const distanceM = toIntOrNull(body?.distanceM);
    const durationS = toIntOrNull(body?.durationS);
    // 페이스 미입력 + 거리·시간 있으면 자동 계산
    let avgPaceS = toIntOrNull(body?.avgPaceS);
    if (!avgPaceS && distanceM && durationS && distanceM > 0) {
      avgPaceS = Math.round((durationS / distanceM) * 1000);
    }
    const elevationM = toIntOrNull(body?.elevationM);
    const avgHr = toIntOrNull(body?.avgHr);
    const metrics = body?.metrics && typeof body.metrics === 'object' ? body.metrics : null;
    const note = body?.note ? String(body.note).slice(0, 500) : null;
    const photoUrl = body?.photoUrl ? String(body.photoUrl).slice(0, 500) : null;

    const id = genId('act');
    await dbRun(
      `INSERT INTO activity_logs
         (id, member_id, class_id, kind, source, activity_date, distance_m, duration_s, avg_pace_s, elevation_m, avg_hr, metrics, note, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)`,
      [id, auth.memberId, classId, kind, source, activityDate, distanceM, durationS, avgPaceS, elevationM, avgHr,
       metrics ? JSON.stringify(metrics) : null, note, photoUrl]
    );

    // ── 마일리지 적립 (러닝류만) ──
    let mileageEarned = 0;
    const isRunKind = ['run', 'walk_run', 'long_run', 'interval'].includes(kind);
    if (isRunKind) {
      // 하루 활동 적립 건수 확인 (한도 2건)
      const todayCount = await dbGet<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM mileage_log
          WHERE member_id = $1 AND reason = 'activity'
            AND created_at::date = CURRENT_DATE`,
        [auth.memberId]
      );
      if (Number(todayCount?.c ?? 0) < COACHING_MILEAGE.ACTIVITY_DAILY_CAP) {
        mileageEarned += await grantMileage(auth.memberId, COACHING_MILEAGE.ACTIVITY, 'activity', id);
      }
      // 롱런 보너스 (10km+)
      if (distanceM && distanceM >= COACHING_MILEAGE.LONG_RUN_M) {
        mileageEarned += await grantMileage(auth.memberId, COACHING_MILEAGE.LONG_RUN, 'activity_long', id);
      }
    }

    const row = await dbGet<any>(
      `SELECT a.*, m.name AS member_name, 0 AS cheer_count, 0 AS comment_count
         FROM activity_logs a JOIN members m ON a.member_id = m.id WHERE a.id = $1`,
      [id]
    );
    return NextResponse.json({ activity: row ? mapActivityRow(row) : null, mileageEarned }, { status: 201 });
  } catch (e) {
    console.error('[activities POST] error:', e);
    return NextResponse.json({ error: '활동 기록 저장에 실패했습니다' }, { status: 500 });
  }
}

// PATCH /api/activities  { id, ...수정필드 }
//  본인(또는 관리자)의 기록을 수정. 출처(source)는 보존하고 edited_at 만 갱신한다.
//  → 수기·애플·가민·Strava 어떤 출처든 동일하게 수정 가능(신뢰의 핵심).
//  거리/시간이 바뀌면 페이스를 재계산. 마일리지는 재적립/회수하지 않는다(중복·악용 방지).
export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  try {
    const body = await req.json();
    const id = body?.id ? String(body.id) : null;
    if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });

    const existing = await dbGet<any>(`SELECT * FROM activity_logs WHERE id = $1`, [id]);
    if (!existing) return NextResponse.json({ error: '기록을 찾을 수 없습니다' }, { status: 404 });
    if (existing.member_id !== auth.memberId && auth.role !== 'admin') return forbiddenResponse();

    const toIntOrNull = (v: any) => (v != null && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

    // 부분 수정: 전달된 필드만 갱신, 나머지는 기존값 유지
    const kind = has('kind') && ACTIVITY_KINDS.includes(body.kind) ? body.kind : existing.kind;
    const activityDate = has('activityDate') && body.activityDate
      ? String(body.activityDate).slice(0, 10) : existing.activity_date;
    const distanceM = has('distanceM') ? toIntOrNull(body.distanceM) : existing.distance_m;
    const durationS = has('durationS') ? toIntOrNull(body.durationS) : existing.duration_s;
    const elevationM = has('elevationM') ? toIntOrNull(body.elevationM) : existing.elevation_m;
    const avgHr = has('avgHr') ? toIntOrNull(body.avgHr) : existing.avg_hr;
    const note = has('note') ? (body.note ? String(body.note).slice(0, 500) : null) : existing.note;
    const photoUrl = has('photoUrl') ? (body.photoUrl ? String(body.photoUrl).slice(0, 500) : null) : existing.photo_url;

    // 페이스: 명시 전달이 있으면 사용, 없으면 거리·시간으로 재계산(둘 다 있을 때)
    let avgPaceS: number | null;
    if (has('avgPaceS')) avgPaceS = toIntOrNull(body.avgPaceS);
    else if (distanceM && durationS && distanceM > 0) avgPaceS = Math.round((durationS / distanceM) * 1000);
    else avgPaceS = existing.avg_pace_s;

    await dbRun(
      `UPDATE activity_logs
          SET kind = $1, activity_date = $2, distance_m = $3, duration_s = $4, avg_pace_s = $5,
              elevation_m = $6, avg_hr = $7, note = $8, photo_url = $9, edited_at = NOW()
        WHERE id = $10`,
      [kind, activityDate, distanceM, durationS, avgPaceS, elevationM, avgHr, note, photoUrl, id]
    );

    const row = await dbGet<any>(
      `SELECT a.*, m.name AS member_name,
              (SELECT COUNT(*) FROM encouragements e WHERE e.target_type='activity' AND e.target_id=a.id AND e.kind!='comment')::int AS cheer_count,
              (SELECT COUNT(*) FROM encouragements e WHERE e.target_type='activity' AND e.target_id=a.id AND e.kind='comment')::int AS comment_count
         FROM activity_logs a JOIN members m ON a.member_id = m.id WHERE a.id = $1`,
      [id]
    );
    return NextResponse.json({ activity: row ? mapActivityRow(row) : null });
  } catch (e) {
    console.error('[activities PATCH] error:', e);
    return NextResponse.json({ error: '수정에 실패했습니다' }, { status: 500 });
  }
}

// DELETE /api/activities?id=...  — 본인 기록 삭제(관리자도 가능)
export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });

  try {
    const row = await dbGet<any>(`SELECT member_id FROM activity_logs WHERE id = $1`, [id]);
    if (!row) return NextResponse.json({ error: '기록을 찾을 수 없습니다' }, { status: 404 });
    if (row.member_id !== auth.memberId && auth.role !== 'admin') return forbiddenResponse();

    await dbRun(`DELETE FROM activity_logs WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[activities DELETE] error:', e);
    return NextResponse.json({ error: '삭제에 실패했습니다' }, { status: 500 });
  }
}
