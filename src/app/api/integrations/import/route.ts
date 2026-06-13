/**
 * 건강·운동 데이터 "파일 가져오기" 업로드 엔드포인트 (애플 건강 / 가민 공통).
 *
 * POST multipart/form-data:
 *   - file:     export.zip / export.xml / *.tcx / *.gpx
 *   - provider: 'apple_health' | 'garmin'
 *   - classId:  (선택) 활동을 연결할 클래스
 *
 * 처리: 스트리밍 파싱 → activity_logs 멱등 저장(source=provider, source_ref) → 마일리지 적립.
 * 반환: { ok, jobId, imported, duplicate, mileageEarned, truncated, skipped }
 *
 * ⚠️ 메모리: 업로드 본문은 한 번 Buffer 로 읽되 상한(MAX_UPLOAD_BYTES)을 강제하고,
 * 파싱은 SAX/스트리밍으로 처리한다. 운동 레코드만 추출하므로 DOM 폭발이 없다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { grantMileage, COACHING_MILEAGE } from '@/lib/discount';
import {
  parseAppleHealthFile,
  parseGarminFile,
  MAX_UPLOAD_BYTES,
  type ParseResult,
} from '@/lib/healthImport';

export const runtime = 'nodejs';
// 큰 파일 파싱이 가능하도록 동적 처리(스트리밍). 캐시 안 함.
export const dynamic = 'force-dynamic';

const RUN_KINDS = ['run', 'walk_run', 'long_run', 'interval'];

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: '업로드 형식이 올바르지 않습니다(multipart/form-data 필요)' }, { status: 400 });
  }

  const provider = String(form.get('provider') ?? '');
  if (provider !== 'apple_health' && provider !== 'garmin') {
    return NextResponse.json({ error: 'provider 는 apple_health 또는 garmin 이어야 합니다' }, { status: 400 });
  }
  const classId = (form.get('classId') as string) || null;

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
  }
  const blob = file as File;
  if (blob.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `파일이 너무 큽니다(최대 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB). 내보내기 시 기간을 좁혀서 다시 시도해주세요.` },
      { status: 413 }
    );
  }

  // classId 가 있으면 해당 클래스 참여자인지 확인(권한)
  if (classId) {
    const enrolled = await dbGet<{ ok: number }>(
      `SELECT 1 AS ok FROM class_enrollments WHERE class_id = $1 AND member_id = $2`,
      [classId, auth.memberId]
    );
    const isAdmin = auth.role === 'admin';
    if (!enrolled && !isAdmin) return forbiddenResponse('이 클래스의 참여자가 아닙니다');
  }

  const filename = blob.name || (provider === 'apple_health' ? 'export.zip' : 'garmin.zip');
  const jobId = genId('imp');
  await dbRun(
    `INSERT INTO import_jobs (id, member_id, provider, filename, file_size, status)
     VALUES ($1,$2,$3,$4,$5,'processing')`,
    [jobId, auth.memberId, provider, filename.slice(0, 240), blob.size]
  );

  const failJob = async (message: string, counts?: { imported?: number; duplicate?: number; skipped?: number }) => {
    await dbRun(
      `UPDATE import_jobs
          SET status='failed', imported_count=$2, duplicate_count=$3, skipped_count=$4,
              error_message=$5, finished_at=NOW()
        WHERE id=$1`,
      [jobId, counts?.imported ?? 0, counts?.duplicate ?? 0, counts?.skipped ?? 0, message.slice(0, 1000)]
    );
  };

  // 파싱
  let parsed: ParseResult;
  try {
    const buf = Buffer.from(await blob.arrayBuffer());
    parsed = provider === 'apple_health'
      ? await parseAppleHealthFile(buf, filename)
      : await parseGarminFile(buf, filename);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '파일을 해석하지 못했습니다';
    await failJob(message);
    return NextResponse.json({ jobId, error: message }, { status: 422 });
  }

  if (parsed.activities.length === 0) {
    await dbRun(
      `UPDATE import_jobs
          SET status='succeeded', skipped_count=$2, finished_at=NOW()
        WHERE id=$1`,
      [jobId, parsed.skipped]
    );
    return NextResponse.json({
      ok: true, jobId, imported: 0, duplicate: 0, mileageEarned: 0,
      truncated: parsed.truncated, skipped: parsed.skipped,
      message: '가져올 운동 기록을 찾지 못했습니다. 올바른 내보내기 파일인지 확인해주세요.',
    });
  }

  let imported = 0, duplicate = 0, mileageEarned = 0;
  // 하루 적립 한도 추적(같은 날 여러 건이 들어와도 캡 준수)
  const dailyCount = new Map<string, number>();

  try {
    // connected_accounts 에 "파일 연동" 표식 upsert (상태 표시용)
    await upsertFileConnection(auth.memberId, provider);

    for (const a of parsed.activities) {
      const sourceRef = a.sourceRef.slice(0, 180);
      const avgPaceS = a.distanceM && a.distanceM > 0 && a.durationS
        ? Math.round((a.durationS / a.distanceM) * 1000)
        : null;

      const id = genId('act');
      const inserted = await dbGet<{ id: string }>(
        `INSERT INTO activity_logs
           (id, member_id, class_id, kind, source, source_ref, activity_date, distance_m, duration_s, avg_pace_s, elevation_m, avg_hr, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (member_id, source, source_ref) WHERE source_ref IS NOT NULL DO NOTHING
         RETURNING id`,
        [id, auth.memberId, classId, a.kind, provider, sourceRef, a.activityDate,
         a.distanceM, a.durationS, avgPaceS, a.elevationM, a.avgHr, a.note?.slice(0, 200) ?? null]
      );
      if (!inserted) { duplicate++; continue; }
      imported++;

      // 마일리지: 러닝류만, 하루 한도 준수, 롱런(10km+) 보너스 (멱등은 grantMileage 가 보장)
      if (RUN_KINDS.includes(a.kind)) {
        const prior = await dbGet<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM mileage_log WHERE member_id = $1 AND reason = 'activity' AND created_at::date = $2::date`,
          [auth.memberId, a.activityDate]
        );
        const already = Number(prior?.c ?? 0) + (dailyCount.get(a.activityDate) ?? 0);
        if (already < COACHING_MILEAGE.ACTIVITY_DAILY_CAP) {
          const got = await grantMileage(auth.memberId, COACHING_MILEAGE.ACTIVITY, 'activity', id);
          if (got > 0) { mileageEarned += got; dailyCount.set(a.activityDate, (dailyCount.get(a.activityDate) ?? 0) + 1); }
        }
        if (a.distanceM && a.distanceM >= COACHING_MILEAGE.LONG_RUN_M) {
          mileageEarned += await grantMileage(auth.memberId, COACHING_MILEAGE.LONG_RUN, 'activity_long', id);
        }
      }
    }

    await dbRun(
      `UPDATE connected_accounts SET last_synced_at = NOW(), status='connected', updated_at=NOW()
        WHERE member_id = $1 AND provider = $2`,
      [auth.memberId, provider]
    );

    await dbRun(
      `UPDATE import_jobs
          SET status='succeeded', imported_count=$2, duplicate_count=$3, skipped_count=$4, finished_at=NOW()
        WHERE id=$1`,
      [jobId, imported, duplicate, parsed.skipped]
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '가져오기 저장 중 문제가 발생했습니다';
    await failJob(message, { imported, duplicate, skipped: parsed.skipped });
    return NextResponse.json({ jobId, error: message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true, jobId, imported, duplicate, mileageEarned,
    truncated: parsed.truncated, skipped: parsed.skipped,
  });
}

/** 파일 가져오기 연동 표식(토큰 없음, status=connected) upsert */
async function upsertFileConnection(memberId: string, provider: string): Promise<void> {
  const existing = await dbGet<{ id: string }>(
    `SELECT id FROM connected_accounts WHERE member_id = $1 AND provider = $2`,
    [memberId, provider]
  );
  if (existing) {
    await dbRun(
      `UPDATE connected_accounts SET status='connected', scope='file_import', updated_at=NOW() WHERE id=$1`,
      [existing.id]
    );
  } else {
    await dbRun(
      `INSERT INTO connected_accounts (id, member_id, provider, status, scope)
       VALUES ($1,$2,$3,'connected','file_import')`,
      [genId('conn'), memberId, provider]
    );
  }
}
