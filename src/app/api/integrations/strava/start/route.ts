import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { isStravaConfigured, buildAuthUrl } from '@/lib/strava';

// GET /api/integrations/strava/start?classId=
//  Strava 인증 페이지로 리디렉션. state 에 memberId(+classId) 를 실어 보냄.
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  if (!isStravaConfigured()) {
    return NextResponse.json(
      { error: 'Strava 연동이 아직 활성화되지 않았어요. 곧 오픈됩니다.', comingSoon: true },
      { status: 503 }
    );
  }

  const classId = req.nextUrl.searchParams.get('classId') ?? '';
  const origin = req.nextUrl.origin;
  const state = Buffer.from(JSON.stringify({ m: auth.memberId, c: classId })).toString('base64url');
  const url = buildAuthUrl(origin, state);
  return NextResponse.redirect(url);
}
