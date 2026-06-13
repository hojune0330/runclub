import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { dbAll, dbGet, dbRun, ensureSchema, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TokenRow = {
  id: string;
  label: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function appBaseUrl(req: NextRequest) {
  return (process.env.APP_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');
}

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const rows = await dbAll<TokenRow>(
    `SELECT id, label, last_used_at, revoked_at, created_at
       FROM integration_ingest_tokens
      WHERE member_id = $1 AND provider = 'apple_health'
      ORDER BY created_at DESC
      LIMIT 10`,
    [auth.memberId]
  );

  return NextResponse.json({
    endpoint: `${appBaseUrl(req)}/api/integrations/apple-health/ingest`,
    tokens: rows.map(row => ({
      id: row.id,
      label: row.label,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  let body: { label?: unknown } = {};
  try { body = await req.json(); } catch { /* optional */ }

  const token = `rhc_apple_${randomBytes(24).toString('base64url')}`;
  const id = genId('ing');
  const label = String(body.label || 'Apple Health Shortcut').slice(0, 80);
  await dbRun(
    `INSERT INTO integration_ingest_tokens (id, member_id, provider, token_hash, label)
     VALUES ($1,$2,'apple_health',$3,$4)`,
    [id, auth.memberId, hashToken(token), label]
  );

  const existing = await dbGet<{ id: string }>(
    `SELECT id FROM connected_accounts WHERE member_id = $1 AND provider = 'apple_health'`,
    [auth.memberId]
  );
  if (existing) {
    await dbRun(
      `UPDATE connected_accounts
          SET status='connected', scope='shortcut_ingest', updated_at=NOW()
        WHERE id=$1`,
      [existing.id]
    );
  } else {
    await dbRun(
      `INSERT INTO connected_accounts (id, member_id, provider, status, scope)
       VALUES ($1,$2,'apple_health','connected','shortcut_ingest')`,
      [genId('conn'), auth.memberId]
    );
  }

  return NextResponse.json({
    ok: true,
    id,
    token,
    endpoint: `${appBaseUrl(req)}/api/integrations/apple-health/ingest`,
    note: '토큰은 지금 한 번만 보여요. iPhone 단축어 또는 향후 iOS 앱에서 Authorization: Bearer 토큰으로 전송하세요.',
    samplePayload: {
      activities: [{
        activityDate: new Date().toISOString().slice(0, 10),
        kind: 'run',
        distanceM: 5000,
        durationS: 1800,
        sourceRef: 'apple-health-workout-id',
        note: 'Apple Health Shortcut',
      }],
    },
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  await dbRun(
    `UPDATE integration_ingest_tokens
        SET revoked_at = NOW()
      WHERE id = $1 AND member_id = $2 AND provider = 'apple_health'`,
    [id, auth.memberId]
  );
  return NextResponse.json({ ok: true });
}
