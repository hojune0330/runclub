import { NextRequest, NextResponse } from 'next/server';
import { generateRecurringSessions, dbGet } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

// POST /api/sessions/generate
// Body: { from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' }
// 관리자 전용: 지정 기간의 정기 스케줄(월 EBW 3세션, 수 슬로우 롱런, 토 아이오 마라톤)을 일괄 생성.
// 중복(같은 날짜·시작시간·유형)은 자동으로 건너뜀.
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  let from: Date | undefined;
  let to: Date | undefined;
  try {
    const body = await req.json().catch(() => ({} as any));
    if (body?.from) {
      const d = new Date(`${body.from}T00:00:00`);
      if (!Number.isNaN(d.getTime())) from = d;
    }
    if (body?.to) {
      const d = new Date(`${body.to}T23:59:59`);
      if (!Number.isNaN(d.getTime())) to = d;
    }
  } catch {
    // ignore; will use defaults
  }

  // EXT-C1: Cap the generation window to 180 days to prevent a compromised
  // admin token from creating tens of thousands of session rows (DoS).
  const MAX_WINDOW_DAYS = 180;
  const effectiveFrom = from ?? new Date();
  const effectiveTo = to ?? new Date(effectiveFrom.getTime() + 90 * 86_400_000);
  if (effectiveTo.getTime() < effectiveFrom.getTime()) {
    return NextResponse.json({ error: 'to는 from보다 이후여야 합니다' }, { status: 400 });
  }
  const windowDays = Math.ceil(
    (effectiveTo.getTime() - effectiveFrom.getTime()) / 86_400_000
  );
  if (windowDays > MAX_WINDOW_DAYS) {
    return NextResponse.json(
      { error: `생성 기간은 최대 ${MAX_WINDOW_DAYS}일까지 가능합니다 (요청: ${windowDays}일)` },
      { status: 400 }
    );
  }

  const created = await generateRecurringSessions({ from, to });

  // 생성 후 전체 활성 스케줄 통계
  const countRow = await dbGet<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM sessions
      WHERE date >= to_char(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
        AND status != 'cancelled'`
  );

  return NextResponse.json({
    success: true,
    created,
    upcomingTotal: countRow?.cnt ?? 0,
    range: {
      from: from ? from.toISOString().slice(0, 10) : null,
      to: to ? to.toISOString().slice(0, 10) : null,
    },
  });
}
