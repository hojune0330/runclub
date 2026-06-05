import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { isStravaConfigured, exchangeCode, saveStravaConnection, syncStravaActivities } from '@/lib/strava';

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

  let memberId = '', classId = '';
  try {
    const s = JSON.parse(Buffer.from(stateRaw, 'base64url').toString());
    memberId = String(s.m ?? '');
    classId = String(s.c ?? '');
  } catch { return redirectBack('error'); }
  if (!memberId) return redirectBack('error');

  try {
    const tok = await exchangeCode(code);
    await saveStravaConnection(memberId, tok);
    // 첫 동기화(실패해도 연동 자체는 성공 처리)
    try {
      await syncStravaActivities(memberId, { classId: classId || null, perPage: 30 });
    } catch (e) {
      console.error('[strava callback] initial sync failed:', e);
    }
    return redirectBack('connected');
  } catch (e) {
    console.error('[strava callback] error:', e);
    return redirectBack('error');
  }
}
