/**
 * 이용권 정산/만료 리포트 — 운영(현지 매니저) 보조용 집계.
 *
 *  ① 만료 임박/만료 회원 추출: expiry_date 기준 D-day 계산.
 *     주간 리포트·재등록 유도·연락 리스트에 쓴다.
 *  ② 기간별 매출 요약: member_passes 의 결제액을 issued_date(결제일) 기준으로
 *     집계. 개강대기(admin_memo 에 '개강대기' 포함) 분리 카운트.
 *
 * ⚠️ 서버 전용(pg 사용). 클라이언트 컴포넌트에서 import 금지.
 * 기존 pass_grant_records(직접 지급 원장)와 달리, 이 리포트는 실제 보유
 * 이용권(member_passes)을 본다 — 장부 일괄 발급분도 함께 잡힌다.
 */

import { dbAll, ensureSchema } from './db';

export interface ExpiringPass {
  passId: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  productId: string;
  productName: string | null;
  startDate: string;
  expiryDate: string;
  status: string;
  /** 오늘 기준 만료까지 남은 일수(음수면 이미 만료). */
  daysLeft: number;
}

/**
 * 만료 임박/만료 이용권 목록.
 *  - withinDays: 앞으로 N일 이내 만료 예정(기본 14)
 *  - includeExpired: 이미 만료된 active 도 포함할지(기본 true — 정리 대상)
 * active 상태만 본다(refunded/paused 제외).
 */
export async function getExpiringPasses(opts?: {
  withinDays?: number;
  includeExpired?: boolean;
}): Promise<ExpiringPass[]> {
  await ensureSchema();
  const withinDays = opts?.withinDays ?? 14;
  const includeExpired = opts?.includeExpired ?? true;

  // daysLeft = expiry_date - today. 만료 포함 여부에 따라 하한을 조절.
  const rows = await dbAll<{
    pass_id: string;
    member_id: string;
    member_name: string;
    member_phone: string;
    product_id: string;
    product_name: string | null;
    start_date: string;
    expiry_date: string;
    status: string;
    days_left: number | string;
  }>(
    `SELECT mp.id AS pass_id, mp.member_id, m.name AS member_name, m.phone AS member_phone,
            mp.product_id, pp.name AS product_name,
            mp.start_date, mp.expiry_date, mp.status,
            (mp.expiry_date::date - CURRENT_DATE) AS days_left
       FROM member_passes mp
       JOIN members m       ON m.id = mp.member_id
       LEFT JOIN pass_products pp ON pp.id = mp.product_id
      WHERE mp.status = 'active'
        AND (mp.expiry_date::date - CURRENT_DATE) <= $1
        AND ($2 OR (mp.expiry_date::date - CURRENT_DATE) >= 0)
      ORDER BY mp.expiry_date ASC, m.name ASC`,
    [withinDays, includeExpired],
  );

  return rows.map((r) => ({
    passId: r.pass_id,
    memberId: r.member_id,
    memberName: r.member_name,
    memberPhone: r.member_phone,
    productId: r.product_id,
    productName: r.product_name,
    startDate: r.start_date,
    expiryDate: r.expiry_date,
    status: r.status,
    daysLeft: Number(r.days_left),
  }));
}

export interface RevenuePeriodSummary {
  /** 'YYYY-MM' 또는 'YYYY-MM-DD' (groupBy 에 따라). */
  period: string;
  count: number;
  totalAmount: number;
  openingWaitlistCount: number;
  openingWaitlistAmount: number;
}

/**
 * 기간별(월/일) 매출 요약. issued_date(결제일) 기준.
 *  - groupBy: 'month'(기본) | 'day'
 *  - from/to: 'YYYY-MM-DD' 범위(옵션)
 * 개강대기 분리는 admin_memo LIKE '%개강대기%' 로 판별(일괄 발급 시 메모에 박힘).
 */
export async function getRevenueByPeriod(opts?: {
  groupBy?: 'month' | 'day';
  from?: string;
  to?: string;
}): Promise<RevenuePeriodSummary[]> {
  await ensureSchema();
  const groupBy = opts?.groupBy ?? 'month';
  // issued_date 는 TEXT('YYYY-MM-DD') 라 substring 으로 기간 키를 만든다.
  const periodExpr = groupBy === 'day' ? `LEFT(issued_date, 10)` : `LEFT(issued_date, 7)`;

  const where: string[] = [`issued_date IS NOT NULL`];
  const params: Array<string> = [];
  if (opts?.from) { params.push(opts.from); where.push(`issued_date >= $${params.length}`); }
  if (opts?.to) { params.push(opts.to); where.push(`issued_date <= $${params.length}`); }

  const rows = await dbAll<{
    period: string;
    count: number | string;
    total_amount: number | string | null;
    wl_count: number | string;
    wl_amount: number | string | null;
  }>(
    `SELECT ${periodExpr} AS period,
            COUNT(*) AS count,
            COALESCE(SUM(price), 0) AS total_amount,
            COUNT(*) FILTER (WHERE admin_memo LIKE '%개강대기%') AS wl_count,
            COALESCE(SUM(price) FILTER (WHERE admin_memo LIKE '%개강대기%'), 0) AS wl_amount
       FROM member_passes
      WHERE ${where.join(' AND ')}
      GROUP BY period
      ORDER BY period ASC`,
    params,
  );

  return rows.map((r) => ({
    period: r.period,
    count: Number(r.count),
    totalAmount: Number(r.total_amount ?? 0),
    openingWaitlistCount: Number(r.wl_count),
    openingWaitlistAmount: Number(r.wl_amount ?? 0),
  }));
}

export interface PassReportOverview {
  generatedAt: string;
  expiring: {
    soonCount: number;
    expiredCount: number;
    items: ExpiringPass[];
  };
  revenue: {
    groupBy: 'month' | 'day';
    periods: RevenuePeriodSummary[];
    grandTotalAmount: number;
    grandTotalCount: number;
  };
}

/** 관리자 리포트 화면용 한 번에 묶은 개요. */
export async function getPassReportOverview(opts?: {
  withinDays?: number;
  groupBy?: 'month' | 'day';
  from?: string;
  to?: string;
}): Promise<PassReportOverview> {
  const [expiring, periods] = await Promise.all([
    getExpiringPasses({ withinDays: opts?.withinDays, includeExpired: true }),
    getRevenueByPeriod({ groupBy: opts?.groupBy, from: opts?.from, to: opts?.to }),
  ]);

  const grandTotalAmount = periods.reduce((s, p) => s + p.totalAmount, 0);
  const grandTotalCount = periods.reduce((s, p) => s + p.count, 0);

  return {
    generatedAt: new Date().toISOString(),
    expiring: {
      soonCount: expiring.filter((e) => e.daysLeft >= 0).length,
      expiredCount: expiring.filter((e) => e.daysLeft < 0).length,
      items: expiring,
    },
    revenue: {
      groupBy: opts?.groupBy ?? 'month',
      periods,
      grandTotalAmount,
      grandTotalCount,
    },
  };
}
