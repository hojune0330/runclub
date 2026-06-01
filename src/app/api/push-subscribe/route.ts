import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';

// ─────────────────────────────────────────────────────────────────────
// PWA Push Subscription Management
//
// POST   /api/push-subscribe     — register FCM token for this member
// DELETE /api/push-subscribe     — unregister FCM token
//
// Tokens are stored in a simple `push_subscriptions` table keyed by
// (member_id, token) to allow multiple devices per member.
// ─────────────────────────────────────────────────────────────────────

async function ensureTable(): Promise<void> {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          TEXT PRIMARY KEY,
      member_id   TEXT NOT NULL,
      token       TEXT NOT NULL,
      device_info TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(member_id, token)
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_push_sub_token ON push_subscriptions(token)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_push_sub_member ON push_subscriptions(member_id)`);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  try {
    await ensureTable();

    const { token } = await req.json();
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    // Upsert: if this (member, token) pair exists, do nothing.
    await dbRun(
      `INSERT INTO push_subscriptions (id, member_id, token, device_info)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (member_id, token) DO NOTHING`,
      [
        genId('psh'),
        auth.memberId,
        token,
        req.headers.get('user-agent')?.slice(0, 200) ?? null,
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[push-subscribe POST] error:', error);
    return NextResponse.json({ error: '구독 등록 중 오류가 발생했습니다' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  try {
    await ensureTable();

    const { token } = await req.json();
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    await dbRun(
      `DELETE FROM push_subscriptions WHERE member_id = $1 AND token = $2`,
      [auth.memberId, token]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[push-subscribe DELETE] error:', error);
    return NextResponse.json({ error: '구독 해제 중 오류가 발생했습니다' }, { status: 500 });
  }
}
