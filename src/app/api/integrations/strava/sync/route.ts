import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { syncStravaActivities } from '@/lib/strava';

// POST /api/integrations/strava/sync  { classId? }
//  연동된 회원이 수동으로 최근 활동을 다시 불러옴.
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  let body: any = {};
  try { body = await req.json(); } catch { /* body optional */ }
  const classId = body?.classId ? String(body.classId) : null;

  try {
    const result = await syncStravaActivities(auth.memberId, { classId, perPage: 30 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[strava sync] error:', e);
    return NextResponse.json({ error: e?.message ?? 'Strava 동기화 실패' }, { status: 400 });
  }
}
