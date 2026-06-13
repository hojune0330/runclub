import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { dbGet, dbRun, ensureSchema, genId } from '@/lib/db';
import { grantMileage, COACHING_MILEAGE } from '@/lib/discount';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RUN_KINDS = ['run', 'walk_run', 'long_run', 'interval'];
const ALLOWED_KINDS = new Set([...RUN_KINDS, 'custom']);
const MAX_ACTIVITIES = 100;

type TokenRow = {
  id: string;
  member_id: string;
};

type IncomingActivity = {
  sourceRef?: unknown;
  workoutId?: unknown;
  activityDate?: unknown;
  startDate?: unknown;
  kind?: unknown;
  distanceM?: unknown;
  distanceKm?: unknown;
  durationS?: unknown;
  durationMin?: unknown;
  avgHr?: unknown;
  elevationM?: unknown;
  note?: unknown;
};

type IngestBody = IncomingActivity & {
  classId?: unknown;
  activities?: unknown;
};

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function bearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.headers.get('x-runclub-ingest-token')?.trim() || '';
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDateOnly(value: unknown) {
  if (!value) return null;
  const raw = String(value);
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeKind(value: unknown) {
  const kind = String(value || 'run').toLowerCase().replace(/\s+/g, '_');
  if (kind.includes('interval')) return 'interval';
  if (kind.includes('walk')) return 'walk_run';
  if (kind.includes('long')) return 'long_run';
  if (ALLOWED_KINDS.has(kind)) return kind;
  return 'run';
}

function normalizeActivity(input: IncomingActivity, index: number) {
  const activityDate = toDateOnly(input.activityDate ?? input.startDate);
  if (!activityDate) return { error: 'activityDate 필요' as const };

  const distanceM = Math.max(0, Math.round(
    input.distanceM != null ? toFiniteNumber(input.distanceM) : toFiniteNumber(input.distanceKm) * 1000
  ));
  const durationS = Math.max(0, Math.round(
    input.durationS != null ? toFiniteNumber(input.durationS) : toFiniteNumber(input.durationMin) * 60
  ));
  if (distanceM <= 0 && durationS <= 0) return { error: 'distanceM 또는 durationS 필요' as const };

  const kind = normalizeKind(input.kind);
  const avgPaceS = distanceM > 0 && durationS > 0 ? Math.round((durationS / distanceM) * 1000) : null;
  const rawRef = String(input.sourceRef || input.workoutId || '');
  const fallbackRef = hash(JSON.stringify({ activityDate, distanceM, durationS, kind, note: input.note ?? '', index })).slice(0, 32);
  const sourceRef = `shortcut:${(rawRef || fallbackRef).slice(0, 150)}`;

  return {
    activityDate,
    kind,
    distanceM: distanceM || null,
    durationS: durationS || null,
    avgPaceS,
    elevationM: input.elevationM == null ? null : Math.round(toFiniteNumber(input.elevationM)),
    avgHr: input.avgHr == null ? null : Math.round(toFiniteNumber(input.avgHr)),
    note: String(input.note || 'Apple Health Shortcut').slice(0, 200),
    sourceRef,
  };
}

async function verifyClass(memberId: string, classId: string | null) {
  if (!classId) return true;
  const enrolled = await dbGet<{ ok: number }>(
    `SELECT 1 AS ok FROM class_enrollments WHERE class_id = $1 AND member_id = $2`,
    [classId, memberId]
  );
  return Boolean(enrolled);
}

export async function POST(req: NextRequest) {
  await ensureSchema();

  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: 'Apple Health ingest token 필요' }, { status: 401 });

  const tokenRow = await dbGet<TokenRow>(
    `SELECT id, member_id
       FROM integration_ingest_tokens
      WHERE provider = 'apple_health' AND token_hash = $1 AND revoked_at IS NULL`,
    [hash(token)]
  );
  if (!tokenRow) return NextResponse.json({ error: '유효하지 않은 ingest token' }, { status: 401 });

  let body: IngestBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON body 필요' }, { status: 400 }); }
  const rawActivities = Array.isArray(body.activities)
    ? body.activities.slice(0, MAX_ACTIVITIES)
    : [body].filter(item => item.activityDate || item.startDate || item.distanceM || item.distanceKm || item.durationS || item.durationMin);
  if (rawActivities.length === 0) {
    return NextResponse.json({ error: 'activities 배열 또는 단일 activity JSON 필요' }, { status: 400 });
  }

  const classId = body.classId ? String(body.classId) : null;
  if (!(await verifyClass(tokenRow.member_id, classId))) {
    return NextResponse.json({ error: '이 클래스의 참여자가 아닙니다' }, { status: 403 });
  }

  let imported = 0, duplicate = 0, skipped = 0, mileageEarned = 0;
  const dailyCount = new Map<string, number>();

  for (const raw of rawActivities) {
    const normalized = normalizeActivity(raw as IncomingActivity, imported + duplicate + skipped);
    if ('error' in normalized) { skipped++; continue; }

    const id = genId('act');
    const inserted = await dbGet<{ id: string }>(
      `INSERT INTO activity_logs
         (id, member_id, class_id, kind, source, source_ref, activity_date, distance_m, duration_s, avg_pace_s, elevation_m, avg_hr, note)
       VALUES ($1,$2,$3,$4,'apple_health',$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (member_id, source, source_ref) WHERE source_ref IS NOT NULL DO NOTHING
       RETURNING id`,
      [id, tokenRow.member_id, classId, normalized.kind, normalized.sourceRef, normalized.activityDate,
       normalized.distanceM, normalized.durationS, normalized.avgPaceS, normalized.elevationM, normalized.avgHr, normalized.note]
    );
    if (!inserted) { duplicate++; continue; }
    imported++;

    if (RUN_KINDS.includes(normalized.kind) && normalized.distanceM) {
      const prior = await dbGet<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM mileage_log WHERE member_id = $1 AND reason = 'activity' AND created_at::date = $2::date`,
        [tokenRow.member_id, normalized.activityDate]
      );
      const already = Number(prior?.c ?? 0) + (dailyCount.get(normalized.activityDate) ?? 0);
      if (already < COACHING_MILEAGE.ACTIVITY_DAILY_CAP) {
        const got = await grantMileage(tokenRow.member_id, COACHING_MILEAGE.ACTIVITY, 'activity', id);
        if (got > 0) { mileageEarned += got; dailyCount.set(normalized.activityDate, (dailyCount.get(normalized.activityDate) ?? 0) + 1); }
      }
      if (normalized.distanceM >= COACHING_MILEAGE.LONG_RUN_M) {
        mileageEarned += await grantMileage(tokenRow.member_id, COACHING_MILEAGE.LONG_RUN, 'activity_long', id);
      }
    }
  }

  await dbRun(`UPDATE integration_ingest_tokens SET last_used_at = NOW() WHERE id = $1`, [tokenRow.id]);
  const updatedAccount = await dbRun(
    `UPDATE connected_accounts
        SET status='connected', scope='shortcut_ingest', last_synced_at=NOW(), updated_at=NOW()
      WHERE member_id=$1 AND provider='apple_health'`,
    [tokenRow.member_id]
  );
  if (updatedAccount === 0) {
    await dbRun(
      `INSERT INTO connected_accounts (id, member_id, provider, status, scope, last_synced_at)
       VALUES ($1,$2,'apple_health','connected','shortcut_ingest',NOW())
       ON CONFLICT (member_id, provider)
       DO UPDATE SET status='connected', scope='shortcut_ingest', last_synced_at=NOW(), updated_at=NOW()`,
      [genId('conn'), tokenRow.member_id]
    );
  }

  return NextResponse.json({ ok: true, imported, duplicate, skipped, mileageEarned, truncated: rawActivities.length >= MAX_ACTIVITIES });
}
