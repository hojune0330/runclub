import { NextRequest, NextResponse } from 'next/server';

// Garmin 자동 연동은 Garmin Connect Developer Program 승인 후 활성화한다.
// 승인 전에도 사업자 심사용 redirect URI를 고정해둘 수 있도록 준비 route를 둔다.
export async function GET(req: NextRequest) {
  const appUrl = (process.env.APP_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');
  return NextResponse.redirect(`${appUrl}/app?garmin=review_required`);
}
