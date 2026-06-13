import { NextResponse } from 'next/server';
import { dbAll, dbGet, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { ACTIVITY_KIND_LABEL } from '@/lib/coaching';
import type { ActivityKind } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PeriodKey = 'calendar_week' | 'rolling_7' | 'calendar_month' | 'rolling_30' | 'calendar_year' | 'rolling_365';
type PeriodMode = 'calendar' | 'rolling';

type PeriodDef = {
  key: PeriodKey;
  label: string;
  mode: PeriodMode;
  from: string;
  to: string;
};

type AggregateRow = {
  distance_m: number | string | null;
  duration_s: number | string | null;
  activity_count: number | string | null;
  longest_distance_m: number | string | null;
};

type DailyRow = {
  date: string;
  distance_m: number | string | null;
  duration_s: number | string | null;
  activity_count: number | string | null;
};

type MonthRow = {
  month: number | string;
  distance_m: number | string | null;
  duration_s: number | string | null;
  activity_count: number | string | null;
};

type KindRow = {
  kind: ActivityKind;
  distance_m: number | string | null;
  duration_s: number | string | null;
  activity_count: number | string | null;
};

type LatestRow = {
  id: string;
  kind: ActivityKind;
  source: string;
  activity_date: string;
  distance_m: number | string | null;
  duration_s: number | string | null;
  note: string | null;
};

const DISTANCE_KINDS: ActivityKind[] = ['run', 'walk_run', 'long_run', 'interval'];

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const today = todayUtc();
  const todayStr = toDateOnly(today);
  const weekStart = startOfIsoWeek(today);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  const periods: PeriodDef[] = [
    { key: 'calendar_week', label: '이번 주', mode: 'calendar', from: toDateOnly(weekStart), to: todayStr },
    { key: 'rolling_7', label: '최근 7일', mode: 'rolling', from: toDateOnly(addDays(today, -6)), to: todayStr },
    { key: 'calendar_month', label: '이번 달', mode: 'calendar', from: toDateOnly(monthStart), to: todayStr },
    { key: 'rolling_30', label: '최근 30일', mode: 'rolling', from: toDateOnly(addDays(today, -29)), to: todayStr },
    { key: 'calendar_year', label: '올해', mode: 'calendar', from: toDateOnly(yearStart), to: todayStr },
    { key: 'rolling_365', label: '최근 365일', mode: 'rolling', from: toDateOnly(addDays(today, -364)), to: todayStr },
  ];

  try {
    const periodStats = await Promise.all(periods.map(async (period) => {
      const row = await dbGet<AggregateRow>(
        `SELECT COALESCE(SUM(distance_m), 0)::text AS distance_m,
                COALESCE(SUM(duration_s), 0)::text AS duration_s,
                COUNT(*)::text AS activity_count,
                COALESCE(MAX(distance_m), 0)::text AS longest_distance_m
           FROM activity_logs
          WHERE member_id = $1
            AND activity_date BETWEEN $2::date AND $3::date
            AND kind = ANY($4::text[])
            AND distance_m IS NOT NULL
            AND distance_m > 0`,
        [auth.memberId, period.from, period.to, DISTANCE_KINDS]
      );
      return toPeriodResponse(period, row);
    }));

    const rolling30From = periods.find(p => p.key === 'rolling_30')?.from ?? todayStr;
    const [dailyRows, monthRows, kindRows, latestRows] = await Promise.all([
      dbAll<DailyRow>(
        `SELECT activity_date::text AS date,
                COALESCE(SUM(distance_m), 0)::text AS distance_m,
                COALESCE(SUM(duration_s), 0)::text AS duration_s,
                COUNT(*)::text AS activity_count
           FROM activity_logs
          WHERE member_id = $1
            AND activity_date BETWEEN $2::date AND $3::date
            AND kind = ANY($4::text[])
            AND distance_m IS NOT NULL
            AND distance_m > 0
          GROUP BY activity_date
          ORDER BY activity_date ASC`,
        [auth.memberId, rolling30From, todayStr, DISTANCE_KINDS]
      ),
      dbAll<MonthRow>(
        `SELECT EXTRACT(MONTH FROM activity_date)::int AS month,
                COALESCE(SUM(distance_m), 0)::text AS distance_m,
                COALESCE(SUM(duration_s), 0)::text AS duration_s,
                COUNT(*)::text AS activity_count
           FROM activity_logs
          WHERE member_id = $1
            AND activity_date BETWEEN $2::date AND $3::date
            AND kind = ANY($4::text[])
            AND distance_m IS NOT NULL
            AND distance_m > 0
          GROUP BY EXTRACT(MONTH FROM activity_date)
          ORDER BY month ASC`,
        [auth.memberId, toDateOnly(yearStart), todayStr, DISTANCE_KINDS]
      ),
      dbAll<KindRow>(
        `SELECT kind,
                COALESCE(SUM(distance_m), 0)::text AS distance_m,
                COALESCE(SUM(duration_s), 0)::text AS duration_s,
                COUNT(*)::text AS activity_count
           FROM activity_logs
          WHERE member_id = $1
            AND activity_date BETWEEN $2::date AND $3::date
            AND kind = ANY($4::text[])
            AND distance_m IS NOT NULL
            AND distance_m > 0
          GROUP BY kind
          ORDER BY SUM(distance_m) DESC`,
        [auth.memberId, rolling30From, todayStr, DISTANCE_KINDS]
      ),
      dbAll<LatestRow>(
        `SELECT id, kind, source, activity_date::text AS activity_date, distance_m, duration_s, note
           FROM activity_logs
          WHERE member_id = $1
            AND kind = ANY($2::text[])
          ORDER BY activity_date DESC, created_at DESC
          LIMIT 5`,
        [auth.memberId, DISTANCE_KINDS]
      ),
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      today: todayStr,
      periods: periodStats,
      rolling30Daily: fillDailySeries(rolling30From, todayStr, dailyRows),
      calendarYearMonthly: fillMonthSeries(today.getUTCFullYear(), monthRows),
      kindBreakdown: kindRows.map(row => ({
        kind: row.kind,
        label: ACTIVITY_KIND_LABEL[row.kind] ?? row.kind,
        distanceM: toInt(row.distance_m),
        durationS: toInt(row.duration_s),
        activityCount: toInt(row.activity_count),
      })),
      latestTrainingNotes: latestRows.map(row => ({
        id: row.id,
        kind: row.kind,
        label: ACTIVITY_KIND_LABEL[row.kind] ?? row.kind,
        source: row.source,
        activityDate: String(row.activity_date).slice(0, 10),
        distanceM: toInt(row.distance_m),
        durationS: toInt(row.duration_s),
        note: row.note ?? null,
      })),
    });
  } catch (error) {
    console.error('[activities stats GET] error:', error);
    return NextResponse.json({ error: '활동 통계를 불러오지 못했습니다' }, { status: 500 });
  }
}

function toPeriodResponse(period: PeriodDef, row?: AggregateRow) {
  const distanceM = toInt(row?.distance_m);
  const durationS = toInt(row?.duration_s);
  return {
    ...period,
    distanceM,
    durationS,
    activityCount: toInt(row?.activity_count),
    longestDistanceM: toInt(row?.longest_distance_m),
    avgPaceS: distanceM > 0 && durationS > 0 ? Math.round((durationS / distanceM) * 1000) : null,
  };
}

function fillDailySeries(from: string, to: string, rows: DailyRow[]) {
  const byDate = new Map(rows.map(row => [String(row.date).slice(0, 10), row]));
  const out: Array<{ date: string; distanceM: number; durationS: number; activityCount: number }> = [];
  for (let cursor = parseDateOnly(from); cursor <= parseDateOnly(to); cursor = addDays(cursor, 1)) {
    const date = toDateOnly(cursor);
    const row = byDate.get(date);
    out.push({
      date,
      distanceM: toInt(row?.distance_m),
      durationS: toInt(row?.duration_s),
      activityCount: toInt(row?.activity_count),
    });
  }
  return out;
}

function fillMonthSeries(year: number, rows: MonthRow[]) {
  const byMonth = new Map(rows.map(row => [toInt(row.month), row]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const row = byMonth.get(month);
    return {
      month,
      label: `${month}월`,
      from: `${year}-${String(month).padStart(2, '0')}-01`,
      distanceM: toInt(row?.distance_m),
      durationS: toInt(row?.duration_s),
      activityCount: toInt(row?.activity_count),
    };
  });
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfIsoWeek(date: Date): Date {
  const dayIndex = (date.getUTCDay() + 6) % 7;
  return addDays(date, -dayIndex);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toInt(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
