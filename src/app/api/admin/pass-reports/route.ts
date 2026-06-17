import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getPassReportOverview } from '@/lib/pass-reports';

/**
 * 이용권 정산/만료 리포트 — 관리자 전용.
 *
 *   GET /api/admin/pass-reports?withinDays=14&groupBy=month&from=2026-04-01&to=2026-12-31
 *
 *   withinDays : 만료 임박 판정 기준 일수(기본 14)
 *   groupBy    : 'month'(기본) | 'day' — 매출 집계 단위
 *   from / to  : 결제일(issued_date) 범위(YYYY-MM-DD, 옵션)
 *
 * 서브 에이전트(현지 매니저 운영 보조) 산출물. 집계 로직은 lib/pass-reports.ts 공유.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  await ensureSchema();
  const { searchParams } = new URL(req.url);

  const withinDaysRaw = Number(searchParams.get('withinDays'));
  const withinDays = Number.isFinite(withinDaysRaw)
    ? Math.min(Math.max(withinDaysRaw, 0), 365)
    : 14;
  const groupBy = searchParams.get('groupBy') === 'day' ? 'day' : 'month';
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;

  const overview = await getPassReportOverview({ withinDays, groupBy, from, to });
  return NextResponse.json(overview);
}
