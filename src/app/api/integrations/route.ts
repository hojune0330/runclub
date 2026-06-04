import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { INTEGRATION_PROVIDERS } from '@/lib/policy';

const PROVIDER_IDS = INTEGRATION_PROVIDERS.map(p => p.id);

// GET /api/integrations
//  내 연동 계정 목록을 "제공자 카탈로그 + 내 연동 상태"로 합쳐서 반환.
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const rows = await dbAll<any>(
    `SELECT provider, status, last_synced_at, created_at FROM connected_accounts WHERE member_id = $1`,
    [auth.memberId]
  );
  const byProvider = new Map(rows.map(r => [r.provider, r]));

  const accounts = INTEGRATION_PROVIDERS
    .filter(p => p.id !== 'manual')
    .map(p => {
      const mine = byProvider.get(p.id);
      return {
        provider: p.id,
        name: p.name,
        category: p.category,
        color: p.color,
        desc: p.desc,
        // 제공자 자체가 아직 자동연동 미오픈이면 'coming_soon'
        availability: p.status, // 'available' | 'coming_soon'
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

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }
  const provider = String(body?.provider ?? '');
  if (!PROVIDER_IDS.includes(provider as any) || provider === 'manual') {
    return NextResponse.json({ error: '지원하지 않는 연동입니다' }, { status: 400 });
  }

  const meta = INTEGRATION_PROVIDERS.find(p => p.id === provider)!;
  // 자동 연동 미오픈 → 'pending'(관심 등록). 오픈 후 OAuth 성공 시 'connected'로 갱신 예정.
  const status = meta.status === 'available' ? 'connected' : 'pending';

  const existing = await dbGet<any>(
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

  await dbRun(
    `DELETE FROM connected_accounts WHERE member_id = $1 AND provider = $2`,
    [auth.memberId, provider]
  );
  return NextResponse.json({ ok: true });
}
