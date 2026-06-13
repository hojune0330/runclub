import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { INTEGRATION_PROVIDERS } from '@/lib/policy';
import { isStravaConfigured } from '@/lib/strava';

const PROVIDER_IDS = INTEGRATION_PROVIDERS.map(p => p.id);

type ConnectedAccountRow = {
  provider: string;
  status: string;
  last_synced_at: string | null;
  created_at: string;
};

// GET /api/integrations
//  내 연동 계정 목록을 "제공자 카탈로그 + 내 연동 상태"로 합쳐서 반환.
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const rows = await dbAll<ConnectedAccountRow>(
    `SELECT provider, status, last_synced_at, created_at FROM connected_accounts WHERE member_id = $1`,
    [auth.memberId]
  );
  const byProvider = new Map(rows.map(r => [r.provider, r]));

  const accounts = INTEGRATION_PROVIDERS
    .filter(p => p.id !== 'manual')
    .map(p => {
      const mine = byProvider.get(p.id);
      // Strava 는 env 설정이 되어 있으면 실제 OAuth 연동 가능('available').
      const availability = p.id === 'strava' && isStravaConfigured() ? 'available' : p.status;
      return {
        provider: p.id,
        name: p.name,
        category: p.category,
        color: p.color,
        desc: p.desc,
        availability, // 'available' | 'coming_soon'
        // OAuth 가 필요한 제공자(현재 strava)는 별도 시작 URL 사용
        oauth: p.id === 'strava' && isStravaConfigured(),
        // 자동 연동 실현 경로(사업자 심사/네이티브 앱 필요 여부 포함)
        automation: p.automation ?? null,
        readiness: getProviderReadiness(p.id, req.nextUrl.origin),
        // 파일 내보내기 업로드로 "지금 바로" 가져올 수 있는 제공자(애플 건강·가민)
        fileImport: p.fileImport ?? null,
        connected: mine?.status === 'connected',
        status: mine?.status ?? null, // 'connected' | 'pending' | 'revoked' | null
        lastSyncedAt: mine?.last_synced_at ?? null,
      };
    });

  return NextResponse.json({ accounts });
}

// POST /api/integrations  { provider }
//  자동 연동이 아직 열리지 않은 제공자는 "관심 표시(pending)"로 기록 → 오픈 시 우선 안내.
//  자동 연동이 열린 제공자는 추후 OAuth 시작점이 됨(현재는 manual 외 모두 coming_soon).
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  let body: { provider?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }
  const provider = String(body?.provider ?? '');
  if (!PROVIDER_IDS.includes(provider as (typeof PROVIDER_IDS)[number]) || provider === 'manual') {
    return NextResponse.json({ error: '지원하지 않는 연동입니다' }, { status: 400 });
  }

  const meta = INTEGRATION_PROVIDERS.find(p => p.id === provider)!;
  // 자동 연동 미오픈 → 'pending'(관심 등록). 오픈 후 OAuth 성공 시 'connected'로 갱신 예정.
  const status = meta.status === 'available' ? 'connected' : 'pending';

  const existing = await dbGet<{ id: string }>(
    `SELECT id FROM connected_accounts WHERE member_id = $1 AND provider = $2`,
    [auth.memberId, provider]
  );

  if (existing) {
    await dbRun(
      `UPDATE connected_accounts SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, existing.id]
    );
  } else {
    await dbRun(
      `INSERT INTO connected_accounts (id, member_id, provider, status) VALUES ($1, $2, $3, $4)`,
      [genId('conn'), auth.memberId, provider, status]
    );
  }

  return NextResponse.json({
    ok: true,
    provider,
    status,
    comingSoon: meta.status !== 'available',
    message: meta.status === 'available'
      ? `${meta.name} 연동이 완료됐어요.`
      : `${meta.name} 자동 연동은 준비 중이에요. 오픈되면 가장 먼저 알려드릴게요!`,
  });
}

// DELETE /api/integrations?provider=
export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const provider = req.nextUrl.searchParams.get('provider') ?? '';
  if (!provider) return NextResponse.json({ error: 'provider 필요' }, { status: 400 });

  if (provider === 'apple_health') {
    await dbRun(
      `UPDATE integration_ingest_tokens
          SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE member_id = $1 AND provider = 'apple_health' AND revoked_at IS NULL`,
      [auth.memberId]
    );
  }

  await dbRun(
    `DELETE FROM connected_accounts WHERE member_id = $1 AND provider = $2`,
    [auth.memberId, provider]
  );
  return NextResponse.json({ ok: true });
}

function getProviderReadiness(provider: string, origin: string) {
  const appUrl = (process.env.APP_BASE_URL || origin).replace(/\/$/, '');
  if (provider === 'strava') {
    return {
      configured: isStravaConfigured(),
      env: ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'APP_BASE_URL'],
      redirectUri: `${appUrl}/api/integrations/strava/callback`,
      note: isStravaConfigured()
        ? '환경변수가 설정되어 실제 OAuth 연결이 가능합니다.'
        : 'Strava API 앱 키를 Render 환경변수에 넣으면 바로 실제 연동됩니다.',
    };
  }
  if (provider === 'garmin') {
    return {
      configured: Boolean(process.env.GARMIN_CLIENT_ID && process.env.GARMIN_CLIENT_SECRET),
      env: ['GARMIN_CLIENT_ID', 'GARMIN_CLIENT_SECRET', 'GARMIN_WEBHOOK_SECRET'],
      redirectUri: `${appUrl}/api/integrations/garmin/callback`,
      note: 'Garmin 자동 연동은 Garmin Connect Developer Program 사업자 승인 이후 활성화합니다. 파일 가져오기는 이미 사용 가능합니다.',
    };
  }
  if (provider === 'apple_health') {
    return {
      configured: Boolean(process.env.APPLE_TEAM_ID && process.env.APPLE_BUNDLE_ID),
      env: ['APPLE_TEAM_ID', 'APPLE_BUNDLE_ID'],
      redirectUri: null,
      note: 'Apple 건강은 웹 OAuth가 없어 파일 가져오기 또는 Shortcut/API token으로 지금 연결하고, 이후 iOS HealthKit 앱으로 확장합니다.',
    };
  }
  return null;
}
