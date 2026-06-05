/**
 * Strava OAuth + 활동 동기화 헬퍼 (P4 실제 연동).
 *
 * 환경변수:
 *   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET — Strava API 앱 자격증명
 *   APP_BASE_URL (선택) — 콜백 베이스 URL (없으면 요청 origin 사용)
 *
 * 토큰은 connected_accounts(access_token/refresh_token/token_expires_at)에 저장.
 * 미설정(env 없음) 시 isStravaConfigured()=false → UI는 '준비 중'으로 표시.
 */

import { dbGet, dbRun, genId } from '@/lib/db';
import { grantMileage, COACHING_MILEAGE } from '@/lib/discount';

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API = 'https://www.strava.com/api/v3';
const SCOPE = 'read,activity:read';

export function isStravaConfigured(): boolean {
  return !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

export function getRedirectUri(origin: string): string {
  const base = process.env.APP_BASE_URL || origin;
  return `${base.replace(/\/$/, '')}/api/integrations/strava/callback`;
}

export function buildAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: getRedirectUri(origin),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: SCOPE,
    state,
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

interface StravaToken {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete?: { id: number; firstname?: string; lastname?: string };
}

export async function exchangeCode(code: string): Promise<StravaToken> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Strava 토큰 교환 실패 (${res.status})`);
  return res.json();
}

async function refreshToken(refresh: string): Promise<StravaToken> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  });
  if (!res.ok) throw new Error(`Strava 토큰 갱신 실패 (${res.status})`);
  return res.json();
}

/** connected_accounts에 토큰 저장(연동 확정) */
export async function saveStravaConnection(memberId: string, tok: StravaToken): Promise<void> {
  const externalId = tok.athlete?.id ? String(tok.athlete.id) : null;
  const expiresAt = new Date(tok.expires_at * 1000).toISOString();
  const existing = await dbGet<any>(
    `SELECT id FROM connected_accounts WHERE member_id = $1 AND provider = 'strava'`,
    [memberId]
  );
  if (existing) {
    await dbRun(
      `UPDATE connected_accounts SET status='connected', external_id=$1, access_token=$2,
          refresh_token=$3, token_expires_at=$4, scope=$5, updated_at=NOW() WHERE id=$6`,
      [externalId, tok.access_token, tok.refresh_token, expiresAt, SCOPE, existing.id]
    );
  } else {
    await dbRun(
      `INSERT INTO connected_accounts (id, member_id, provider, status, external_id, access_token, refresh_token, token_expires_at, scope)
       VALUES ($1,$2,'strava','connected',$3,$4,$5,$6,$7)`,
      [genId('conn'), memberId, externalId, tok.access_token, tok.refresh_token, expiresAt, SCOPE]
    );
  }
}

/** 유효한 access token 확보(만료 시 자동 갱신) */
async function getValidAccessToken(memberId: string): Promise<string | null> {
  const acc = await dbGet<any>(
    `SELECT id, access_token, refresh_token, token_expires_at FROM connected_accounts
      WHERE member_id = $1 AND provider = 'strava' AND status = 'connected'`,
    [memberId]
  );
  if (!acc?.access_token) return null;
  const exp = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : 0;
  if (exp - Date.now() > 120000) return acc.access_token; // 2분 이상 남음

  // 갱신
  if (!acc.refresh_token) return acc.access_token;
  const tok = await refreshToken(acc.refresh_token);
  await dbRun(
    `UPDATE connected_accounts SET access_token=$1, refresh_token=$2, token_expires_at=$3, updated_at=NOW() WHERE id=$4`,
    [tok.access_token, tok.refresh_token, new Date(tok.expires_at * 1000).toISOString(), acc.id]
  );
  return tok.access_token;
}

interface StravaActivity {
  id: number;
  name: string;
  distance: number;       // meters
  moving_time: number;    // seconds
  total_elevation_gain: number;
  average_heartrate?: number;
  start_date_local: string;
  type: string;
}

function mapStravaKind(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('run')) return 'run';
  if (t.includes('walk')) return 'walk_run';
  return 'run';
}

/**
 * 최근 활동을 가져와 activity_logs에 동기화(import).
 * source='strava', source_ref=strava activity id → 중복 방지(uq_activity_source_ref).
 * classId 지정 시 해당 클래스 피드에도 연결. 러닝류는 마일리지 적립.
 * @returns { imported, mileageEarned }
 */
export async function syncStravaActivities(
  memberId: string,
  opts: { classId?: string | null; perPage?: number } = {}
): Promise<{ imported: number; mileageEarned: number }> {
  const token = await getValidAccessToken(memberId);
  if (!token) throw new Error('Strava 연동이 필요합니다');

  const perPage = Math.min(opts.perPage ?? 30, 100);
  const res = await fetch(`${STRAVA_API}/athlete/activities?per_page=${perPage}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava 활동 조회 실패 (${res.status})`);
  const activities: StravaActivity[] = await res.json();

  let imported = 0, mileageEarned = 0;
  for (const a of activities) {
    const kind = mapStravaKind(a.type);
    const distanceM = Math.round(a.distance);
    const durationS = Math.round(a.moving_time);
    const avgPaceS = distanceM > 0 ? Math.round((durationS / distanceM) * 1000) : null;
    const sourceRef = String(a.id);
    const activityDate = a.start_date_local.slice(0, 10);

    // 중복 확인
    const dup = await dbGet<any>(
      `SELECT 1 FROM activity_logs WHERE member_id = $1 AND source = 'strava' AND source_ref = $2`,
      [memberId, sourceRef]
    );
    if (dup) continue;

    const id = genId('act');
    await dbRun(
      `INSERT INTO activity_logs
         (id, member_id, class_id, kind, source, source_ref, activity_date, distance_m, duration_s, avg_pace_s, elevation_m, avg_hr, note)
       VALUES ($1,$2,$3,$4,'strava',$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, memberId, opts.classId ?? null, kind, sourceRef, activityDate, distanceM, durationS, avgPaceS,
       Math.round(a.total_elevation_gain ?? 0), a.average_heartrate ? Math.round(a.average_heartrate) : null, a.name?.slice(0, 200) ?? null]
    );
    imported++;

    // 마일리지: 활동(하루 2건 한도) + 롱런(10km+)
    const todayCount = await dbGet<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM mileage_log WHERE member_id = $1 AND reason = 'activity' AND created_at::date = $2::date`,
      [memberId, activityDate]
    );
    if (Number(todayCount?.c ?? 0) < COACHING_MILEAGE.ACTIVITY_DAILY_CAP) {
      mileageEarned += await grantMileage(memberId, COACHING_MILEAGE.ACTIVITY, 'activity', id);
    }
    if (distanceM >= COACHING_MILEAGE.LONG_RUN_M) {
      mileageEarned += await grantMileage(memberId, COACHING_MILEAGE.LONG_RUN, 'activity_long', id);
    }
  }

  await dbRun(
    `UPDATE connected_accounts SET last_synced_at = NOW() WHERE member_id = $1 AND provider = 'strava'`,
    [memberId]
  );
  return { imported, mileageEarned };
}
