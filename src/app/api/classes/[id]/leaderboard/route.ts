import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { METRIC_FOCUS_LABEL, formatDistance } from '@/lib/coaching';
import type { ClassMetricFocus, LeaderboardRow, TeamLeaderboardRow, LeaderboardResult } from '@/types';

// GET /api/classes/[id]/leaderboard?metric=&from=&to=
//  metric 미지정 시 클래스의 metric_focus 사용.
//  지표별 동적 집계. 팀별/개인별 랭킹 + 본인 하이라이트.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await ctx.params;

  try {
    const cls = await dbGet<any>(`SELECT * FROM classes WHERE id = $1`, [id]);
    if (!cls) return NextResponse.json({ error: '클래스를 찾을 수 없습니다' }, { status: 404 });

    const enrolled = await dbGet<any>(
      `SELECT 1 FROM class_enrollments WHERE class_id = $1 AND member_id = $2 AND status != 'dropped'`,
      [id, auth.memberId]
    );
    const isManager = auth.role === 'admin' || cls.coach_id === auth.memberId;
    if (!enrolled && !isManager) return forbiddenResponse();
    // 리더보드 비공개면 매니저만
    if (cls.leaderboard_public === false && !isManager) {
      return NextResponse.json({ error: '이 클래스는 리더보드가 비공개입니다' }, { status: 403 });
    }

    const metric = (req.nextUrl.searchParams.get('metric') || cls.metric_focus || 'distance') as ClassMetricFocus;
    const from = req.nextUrl.searchParams.get('from') || cls.start_date || null;
    const to = req.nextUrl.searchParams.get('to') || cls.end_date || null;

    // 모든 active 멤버(코치 제외) + 팀 정보
    const members = await dbAll<any>(
      `SELECT e.member_id, m.name AS member_name, e.team_id, t.name AS team_name, t.color AS team_color
         FROM class_enrollments e
         JOIN members m ON e.member_id = m.id
         LEFT JOIN class_teams t ON e.team_id = t.id
        WHERE e.class_id = $1 AND e.status = 'active' AND e.role = 'member'`,
      [id]
    );

    // 멤버별 value 계산
    const valueByMember = new Map<string, number>();

    if (metric === 'distance') {
      const rows = await dbAll<any>(
        `SELECT member_id, COALESCE(SUM(distance_m),0)::bigint AS v FROM activity_logs
          WHERE class_id = $1 ${from ? 'AND activity_date >= $2' : ''} ${to ? `AND activity_date <= $${from ? 3 : 2}` : ''}
          GROUP BY member_id`,
        [id, from, to].filter(v => v != null) as any[]
      );
      rows.forEach(r => valueByMember.set(r.member_id, Number(r.v)));
    } else if (metric === 'mileage') {
      // 클래스 활동/과제 적립만 합산 (구매 등 제외)
      const rows = await dbAll<any>(
        `SELECT member_id, COALESCE(SUM(amount),0)::bigint AS v FROM mileage_log
          WHERE amount > 0 AND reason IN ('activity','activity_long','homework')
            ${from ? 'AND created_at::date >= $2' : ''} ${to ? `AND created_at::date <= $${from ? 3 : 2}` : ''}
          GROUP BY member_id`,
        [id, from, to].filter(v => v != null) as any[]
      );
      // class 컨텍스트가 mileage_log엔 없으므로, 클래스 멤버에 한해 필터
      rows.forEach(r => valueByMember.set(r.member_id, Number(r.v)));
    } else if (metric === 'attendance') {
      const rows = await dbAll<any>(
        `SELECT r.member_id, COUNT(*)::int AS v FROM reservations r
          WHERE r.status = 'attended'
            ${from ? "AND r.created_at::date >= $1" : ''} ${to ? `AND r.created_at::date <= $${from ? 2 : 1}` : ''}
          GROUP BY r.member_id`,
        [from, to].filter(v => v != null) as any[]
      );
      rows.forEach(r => valueByMember.set(r.member_id, Number(r.v)));
    } else if (metric === 'homework') {
      // 달성률 = verified 제출 수 / 전체 과제 수 * 100
      const totalHw = await dbGet<{ c: string }>(`SELECT COUNT(*)::text AS c FROM homeworks WHERE class_id = $1`, [id]);
      const total = Number(totalHw?.c ?? 0);
      if (total > 0) {
        const rows = await dbAll<any>(
          `SELECT s.member_id, COUNT(*)::int AS v FROM homework_submissions s
             JOIN homeworks h ON s.homework_id = h.id
            WHERE h.class_id = $1 AND s.status = 'verified'
            GROUP BY s.member_id`,
          [id]
        );
        rows.forEach(r => valueByMember.set(r.member_id, Math.round((Number(r.v) / total) * 100)));
      }
    } else if (metric === 'glucose_in_range') {
      // 가드레일: 원시 혈당값 노출 금지. 목표 범위(70~180mg/dL 기본) 내 측정 비율(%)만.
      const rows = await dbAll<any>(
        `SELECT member_id,
                COUNT(*) FILTER (WHERE (metrics->>'glucose_mgdl')::numeric BETWEEN 70 AND 180)::int AS in_range,
                COUNT(*) FILTER (WHERE metrics ? 'glucose_mgdl')::int AS total
           FROM activity_logs
          WHERE class_id = $1 AND kind = 'glucose'
            ${from ? 'AND activity_date >= $2' : ''} ${to ? `AND activity_date <= $${from ? 3 : 2}` : ''}
          GROUP BY member_id`,
        [id, from, to].filter(v => v != null) as any[]
      );
      rows.forEach(r => {
        const t = Number(r.total);
        valueByMember.set(r.member_id, t > 0 ? Math.round((Number(r.in_range) / t) * 100) : 0);
      });
    }

    const fmt = (v: number): string => {
      if (metric === 'distance') return formatDistance(v);
      if (metric === 'mileage') return `${v.toLocaleString()}P`;
      if (metric === 'attendance') return `${v}회`;
      return `${v}%`; // homework, glucose_in_range
    };

    // 개인 랭킹
    const individuals: LeaderboardRow[] = members
      .map(m => ({
        memberId: m.member_id,
        memberName: m.member_name,
        teamId: m.team_id ?? undefined,
        teamName: m.team_name ?? undefined,
        value: valueByMember.get(m.member_id) ?? 0,
        displayValue: fmt(valueByMember.get(m.member_id) ?? 0),
        rank: 0,
        isMe: m.member_id === auth.memberId,
      }))
      .sort((a, b) => b.value - a.value);
    individuals.forEach((row, idx) => { row.rank = idx + 1; });

    // 팀 랭킹
    const teamAgg = new Map<string, { name: string; color?: string; total: number; count: number }>();
    for (const m of members) {
      if (!m.team_id) continue;
      const v = valueByMember.get(m.member_id) ?? 0;
      const cur = teamAgg.get(m.team_id) ?? { name: m.team_name, color: m.team_color ?? undefined, total: 0, count: 0 };
      cur.total += v;
      cur.count += 1;
      teamAgg.set(m.team_id, cur);
    }
    const isPercentMetric = metric === 'homework' || metric === 'glucose_in_range';
    const teams: TeamLeaderboardRow[] = Array.from(teamAgg.entries())
      .map(([teamId, a]) => {
        const avg = a.count > 0 ? a.total / a.count : 0;
        // 비율 지표는 평균을, 누적 지표는 합계를 대표값으로
        const repr = isPercentMetric ? Math.round(avg) : a.total;
        return {
          teamId,
          teamName: a.name,
          color: a.color,
          total: a.total,
          average: Math.round(avg),
          memberCount: a.count,
          displayTotal: isPercentMetric ? `${Math.round(avg)}%` : fmt(repr),
        };
      })
      .sort((x, y) => (isPercentMetric ? y.average - x.average : y.total - x.total));

    const result: LeaderboardResult = {
      metricFocus: metric,
      metricLabel: METRIC_FOCUS_LABEL[metric] ?? '거리',
      periodStart: from ? String(from).slice(0, 10) : undefined,
      periodEnd: to ? String(to).slice(0, 10) : undefined,
      individuals,
      teams,
    };
    return NextResponse.json(result);
  } catch (e) {
    console.error('[leaderboard GET] error:', e);
    return NextResponse.json({ error: '리더보드를 불러오지 못했습니다' }, { status: 500 });
  }
}
