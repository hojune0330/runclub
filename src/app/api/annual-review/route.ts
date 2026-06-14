import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet } from '@/lib/db';

// ─────────────────────────────────────────────────────────────────────
// PR-ANNUAL-REVIEW: 연간 회고 데이터 API
//
// GET /api/annual-review?year=2026
//   → ReviewData 전체
//
// GET /api/annual-review?year=2026&summary=1
//   → SummaryData 만 (가벼운 로딩용)
//
// 실제 DB 쿼리를 사용하며, 연도 파라미터가 없으면 현재 연도 기준.
// ─────────────────────────────────────────────────────────────────────

type SummaryRow = {
  total_members: number;
  new_members: number;
  total_sessions: number;
  total_checkins: number;
  total_passes_sold: number;
  total_revenue: number;
};
type PopularTypeRow = { type: string; cnt: number };
type AttendanceRateRow = { attended: number; total: number };
type CountRow = { cnt: number };
type AttendanceRow = { month: string; total: number; ebw: number; slowrun: number; marathon: number };
type SessionTypeRow = { type: string; count: number; total_attendance: number };
type TopMemberRow = { id: string; name: string; attendance_count: number; total_mileage: number };
type PassSaleProductRow = { product_id: string; product_name: string; count: number; revenue: number };
type PassSaleMonthRow = { month: string; count: number; revenue: number };
type PeakMomentRow = { date: string; session_name: string; attendance_count: number; type: string };

export async function GET(req: NextRequest) {
  const yearParam = req.nextUrl.searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const summaryOnly = req.nextUrl.searchParams.get('summary') === '1';

  try {
    // Summary (가볍게 한 번에)
    const summary = await buildSummary(year);

    if (summaryOnly) {
      return NextResponse.json({ year, summary });
    }

    // 병렬로 나머지 데이터 fetch
    const [attendance, sessionTypes, topMembers, passSales, peakMoments] = await Promise.all([
      buildAttendance(year),
      buildSessionTypes(year),
      buildTopMembers(year),
      buildPassSales(year),
      buildPeakMoments(year),
    ]);

    return NextResponse.json({
      year,
      summary,
      attendance,
      sessionTypes,
      topMembers,
      passSales,
      peakMoments,
    });
  } catch (error: unknown) {
    console.error('[annual-review] error:', error);
    return NextResponse.json(
      { error: '연간 회고 데이터를 불러오는 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

// ─── Summary ───
async function buildSummary(year: number) {
  const row = await dbGet<SummaryRow>(
    `SELECT
       (SELECT COUNT(*)::int FROM members WHERE is_active = TRUE) AS total_members,
       (SELECT COUNT(*)::int FROM members
         WHERE EXTRACT(YEAR FROM join_date::date) = $1) AS new_members,
       (SELECT COUNT(*)::int FROM sessions
         WHERE EXTRACT(YEAR FROM date) = $1) AS total_sessions,
       (SELECT COUNT(*)::int FROM reservations r
         JOIN sessions s ON r.session_id = s.id
         WHERE r.status = 'attended' AND EXTRACT(YEAR FROM s.date) = $1) AS total_checkins,
       (SELECT COUNT(*)::int FROM member_passes
         WHERE EXTRACT(YEAR FROM issued_date::date) = $1
           AND payment_status = 'paid') AS total_passes_sold,
       (SELECT COALESCE(SUM(price), 0)::int FROM member_passes
         WHERE EXTRACT(YEAR FROM issued_date::date) = $1
           AND payment_status = 'paid') AS total_revenue
    `,
    [year]
  );

  // Most popular session type
  const popular = await dbGet<PopularTypeRow>(
    `SELECT s.type, COUNT(*)::int AS cnt
       FROM reservations r
       JOIN sessions s ON r.session_id = s.id
      WHERE r.status = 'attended' AND EXTRACT(YEAR FROM s.date) = $1
      GROUP BY s.type ORDER BY cnt DESC LIMIT 1`,
    [year]
  );

  // Attendance rate
  const rate = await dbGet<AttendanceRateRow>(
    `SELECT
       COUNT(*) FILTER (WHERE r.status = 'attended')::int AS attended,
       COUNT(*)::int AS total
       FROM reservations r
       JOIN sessions s ON r.session_id = s.id
      WHERE r.status IN ('attended','noshow')
        AND EXTRACT(YEAR FROM s.date) = $1`,
    [year]
  );

  // Active members (attended at least once)
  const active = await dbGet<CountRow>(
    `SELECT COUNT(DISTINCT r.member_id)::int AS cnt
       FROM reservations r
       JOIN sessions s ON r.session_id = s.id
      WHERE r.status = 'attended' AND EXTRACT(YEAR FROM s.date) = $1`,
    [year]
  );

  const typeLabel: Record<string, string> = {
    ebw: 'EBW', slowrun: '런클럽', marathon: '러닝클래스',
  };

  const attended = rate?.attended ?? 0;
  const totalRes = rate?.total ?? 1;

  return {
    totalMembers: row?.total_members ?? 0,
    newMembers: row?.new_members ?? 0,
    totalSessions: row?.total_sessions ?? 0,
    totalCheckins: row?.total_checkins ?? 0,
    mostPopularSession: typeLabel[String(popular?.type ?? '')] ?? 'N/A',
    totalPassesSold: row?.total_passes_sold ?? 0,
    totalRevenue: row?.total_revenue ?? 0,
    avgAttendanceRate: totalRes > 0 ? Math.round((attended / totalRes) * 100) : 0,
    activeMembers: active?.cnt ?? 0,
    retentionRate: 0, // needs previous year data — stub
  };
}

// ─── Attendance Trend ───
async function buildAttendance(year: number) {
  return dbAll<AttendanceRow>(
    `SELECT
       TO_CHAR(s.date, 'YYYY-MM') AS month,
       COUNT(*) FILTER (WHERE r.status = 'attended')::int AS total,
       COUNT(*) FILTER (WHERE s.type = 'ebw' AND r.status = 'attended')::int AS ebw,
       COUNT(*) FILTER (WHERE s.type = 'slowrun' AND r.status = 'attended')::int AS slowrun,
       COUNT(*) FILTER (WHERE s.type = 'marathon' AND r.status = 'attended')::int AS marathon
     FROM sessions s
     JOIN reservations r ON s.id = r.session_id
     WHERE EXTRACT(YEAR FROM s.date) = $1
     GROUP BY month ORDER BY month`,
    [year]
  );
}

// ─── Session Type Breakdown ───
async function buildSessionTypes(year: number) {
  return dbAll<SessionTypeRow>(
    `SELECT
       s.type,
       COUNT(DISTINCT s.id)::int AS count,
       COUNT(*) FILTER (WHERE r.status = 'attended')::int AS total_attendance
     FROM sessions s
     JOIN reservations r ON s.id = r.session_id
     WHERE EXTRACT(YEAR FROM s.date) = $1
     GROUP BY s.type ORDER BY count DESC`,
    [year]
  ).then(rows => {
    const typeLabels: Record<string, string> = { ebw: 'EBW', slowrun: '런클럽', marathon: '러닝클래스' };
    return rows.map(r => ({
      type: r.type,
      label: typeLabels[String(r.type)] ?? r.type,
      count: r.count,
      totalAttendance: r.total_attendance,
    }));
  });
}

// ─── Top Members ───
async function buildTopMembers(year: number) {
  return dbAll<TopMemberRow>(
    `SELECT
       m.id, m.name,
       COUNT(*)::int AS attendance_count,
       m.mileage_balance::int AS total_mileage
     FROM members m
     JOIN reservations r ON m.id = r.member_id
     JOIN sessions s ON r.session_id = s.id
     WHERE r.status = 'attended' AND EXTRACT(YEAR FROM s.date) = $1
     GROUP BY m.id, m.name, m.mileage_balance
     ORDER BY attendance_count DESC LIMIT 10`,
    [year]
  ).then(async rows => {
    // Get favorite type for each top member
    const enriched = await Promise.all(
      rows.map(async m => {
        const fav = await dbGet<PopularTypeRow>(
          `SELECT s.type, COUNT(*)::int AS cnt
             FROM reservations r
             JOIN sessions s ON r.session_id = s.id
            WHERE r.member_id = $1 AND r.status = 'attended'
              AND EXTRACT(YEAR FROM s.date) = $2
            GROUP BY s.type ORDER BY cnt DESC LIMIT 1`,
          [m.id, year]
        );
        const typeLabel: Record<string, string> = {
          ebw: 'EBW', slowrun: '런클럽', marathon: '러닝클래스',
        };
        return {
          id: m.id,
          name: m.name,
          attendanceCount: m.attendance_count,
          favoriteType: typeLabel[String(fav?.type ?? '')] ?? 'N/A',
          totalMileage: m.total_mileage,
          avatarUrl: null,
        };
      })
    );
    return enriched;
  });
}

// ─── Pass Sales ───
async function buildPassSales(year: number) {
  const byProduct = await dbAll<PassSaleProductRow>(
    `SELECT
       mp.product_id,
       pp.name AS product_name,
       COUNT(*)::int AS count,
       COALESCE(SUM(mp.payment_amount), SUM(mp.price), 0)::int AS revenue
     FROM member_passes mp
     JOIN pass_products pp ON mp.product_id = pp.id
     WHERE EXTRACT(YEAR FROM mp.issued_date::date) = $1
       AND mp.payment_status = 'paid'
     GROUP BY mp.product_id, pp.name
     ORDER BY count DESC`,
    [year]
  );
  const byMonth = await dbAll<PassSaleMonthRow>(
    `SELECT
       TO_CHAR(mp.issued_date, 'YYYY-MM') AS month,
       COUNT(*)::int AS count,
       COALESCE(SUM(mp.payment_amount), SUM(mp.price), 0)::int AS revenue
     FROM member_passes mp
     WHERE EXTRACT(YEAR FROM mp.issued_date::date) = $1
       AND mp.payment_status = 'paid'
     GROUP BY month ORDER BY month`,
    [year]
  );
  return { byProduct, byMonth };
}

// ─── Peak Moments ───
// 상위 5개 최다 출석 세션
async function buildPeakMoments(year: number) {
  return dbAll<PeakMomentRow>(
    `SELECT
       s.date::text AS date,
       s.name AS session_name,
       COUNT(*) FILTER (WHERE r.status = 'attended')::int AS attendance_count,
       s.type
     FROM sessions s
     JOIN reservations r ON s.id = r.session_id
     WHERE EXTRACT(YEAR FROM s.date) = $1
     GROUP BY s.id, s.date, s.name, s.type
     HAVING COUNT(*) FILTER (WHERE r.status = 'attended') > 0
     ORDER BY attendance_count DESC LIMIT 5`,
    [year]
  ).then(rows =>
    rows.map(r => ({
      date: r.date,
      title: `${r.session_name} (${r.type})`,
      sessionName: r.session_name,
      attendanceCount: r.attendance_count,
      highlight: `${r.attendance_count}명 참석!`,
    }))
  );
}
