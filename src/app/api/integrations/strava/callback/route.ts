import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { isStravaConfigured, exchangeCode, saveStravaConnection, syncStravaActivities, consumeStravaOAuthState } from '@/lib/strava';

// GET /api/integrations/strava/callback?code=&state=
//  Strava 인증 후 호출됨. 토큰 교환 → 저장 → 첫 동기화 → 앱으로 리디렉션.
export async function GET(req: NextRequest) {
  await ensureSchema();

  const params = req.nextUrl.searchParams;
  const error = params.get('error');
  const code = params.get('code');
  const stateRaw = params.get('state');
  const appUrl = (process.env.APP_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');

  const redirectBack = (q: string) => NextResponse.redirect(`${appUrl}/app?strava=${q}`);

  if (error || !code || !stateRaw) return redirectBack('cancelled');
  if (!isStravaConfigured()) return redirectBack('unavailable');

  const state = await consumeStravaOAuthState(stateRaw);
  if (!state) return redirectBack('state_expired');

  try {
    const tok = await exchangeCode(code);
    await saveStravaConnection(state.memberId, tok);
    // 첫 동기화(실패해도 연동 자체는 성공 처리)
    try {
      await syncStravaActivities(state.memberId, { classId: state.classId, perPage: 30 });
    } catch (e) {
      console.error('[strava callback] initial sync failed:', e);
    }
    return redirectBack('connected');
  } catch (e) {
    console.error('[strava callback] error:', e);
    return redirectBack('error');
  }
}
