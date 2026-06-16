import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

const GRANT_TYPES = new Set(['sale', 'manual_paid', 'free', 'promo', 'compensation', 'staff_adjustment']);
const SETTLEMENT_STATUSES = new Set(['pending', 'settled', 'waived', 'review']);

type SqlParam = string | number | boolean | null;

type PassGrantRecordRow = {
  id: string;
  pass_id: string;
  member_id: string;
  member_name: string | null;
  product_id: string;
  product_name: string;
  product_category: string | null;
  admin_id: string;
  admin_name: string | null;
  grant_type: string;
  settlement_status: string;
  total_count: number | null;
  remaining_count: number | null;
  start_date: string;
  expiry_date: string;
  issued_date: string;
  regular_price: number | string | null;
  charged_amount: number | string | null;
  discount_amount: number | string | null;
  payment_status: string;
  payment_method: string | null;
  transaction_id: string | null;
  reason: string | null;
  memo: string | null;
  pass_status: string | null;
  created_at: string;
};

type PassGrantStatsRow = {
  today_count: number | string | null;
  today_charged: number | string | null;
  today_discount: number | string | null;
  month_count: number | string | null;
  month_charged: number | string | null;
  month_discount: number | string | null;
  pending_count: number | string | null;
  pending_amount: number | string | null;
  waived_count: number | string | null;
  waived_amount: number | string | null;
  non_sale_count: number | string | null;
};

function rowToGrant(r: PassGrantRecordRow) {
  return {
    id: r.id,
    passId: r.pass_id,
    memberId: r.member_id,
    memberName: r.member_name,
    productId: r.product_id,
    productName: r.product_name,
    productCategory: r.product_category,
    adminId: r.admin_id,
    adminName: r.admin_name,
    grantType: r.grant_type,
    settlementStatus: r.settlement_status,
    totalCount: r.total_count,
    remainingCount: r.remaining_count,
    startDate: r.start_date,
    expiryDate: r.expiry_date,
    issuedDate: r.issued_date,
    regularPrice: Number(r.regular_price ?? 0),
    chargedAmount: Number(r.charged_amount ?? 0),
    discountAmount: Number(r.discount_amount ?? 0),
    paymentStatus: r.payment_status,
    paymentMethod: r.payment_method,
    transactionId: r.transaction_id,
    reason: r.reason,
    memo: r.memo,
    passStatus: r.pass_status,
    createdAt: r.created_at,
  };
}

// ─── GET /api/pass-grants ────────────────────────────────────────────────
// Admin-only grant/settlement ledger. Unlike member_passes, this is a snapshot
// of the exact moment a manager issued a pass: who, what, amount, count, reason,
// payment state, settlement state, and responsible admin.
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  await ensureSchema();

  const { searchParams } = new URL(req.url);
  const wantStats = searchParams.get('stats') === 'true';

  if (wantStats) {
    const row = await dbGet<PassGrantStatsRow>(`
      SELECT
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) AS today_count,
        COALESCE(SUM(charged_amount) FILTER (WHERE DATE(created_at) = CURRENT_DATE), 0) AS today_charged,
        COALESCE(SUM(discount_amount) FILTER (WHERE DATE(created_at) = CURRENT_DATE), 0) AS today_discount,
        COUNT(*) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)) AS month_count,
        COALESCE(SUM(charged_amount) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)), 0) AS month_charged,
        COALESCE(SUM(discount_amount) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)), 0) AS month_discount,
        COUNT(*) FILTER (WHERE settlement_status = 'pending') AS pending_count,
        COALESCE(SUM(charged_amount) FILTER (WHERE settlement_status = 'pending'), 0) AS pending_amount,
        COUNT(*) FILTER (WHERE settlement_status = 'waived') AS waived_count,
        COALESCE(SUM(discount_amount) FILTER (WHERE settlement_status = 'waived'), 0) AS waived_amount,
        COUNT(*) FILTER (WHERE grant_type IN ('free','promo','compensation','staff_adjustment')) AS non_sale_count
      FROM pass_grant_records
    `);

    return NextResponse.json({
      today: {
        count: Number(row?.today_count ?? 0),
        chargedAmount: Number(row?.today_charged ?? 0),
        discountAmount: Number(row?.today_discount ?? 0),
      },
      month: {
        count: Number(row?.month_count ?? 0),
        chargedAmount: Number(row?.month_charged ?? 0),
        discountAmount: Number(row?.month_discount ?? 0),
      },
      pending: {
        count: Number(row?.pending_count ?? 0),
        amount: Number(row?.pending_amount ?? 0),
      },
      waived: {
        count: Number(row?.waived_count ?? 0),
        amount: Number(row?.waived_amount ?? 0),
      },
      nonSaleCount: Number(row?.non_sale_count ?? 0),
    });
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 100), 1), 300);
  const grantType = searchParams.get('grantType');
  const settlementStatus = searchParams.get('settlementStatus');
  const q = (searchParams.get('q') ?? '').trim();

  const where: string[] = [];
  const params: SqlParam[] = [];
  let i = 1;

  if (grantType && GRANT_TYPES.has(grantType)) {
    where.push(`pgr.grant_type = $${i++}`);
    params.push(grantType);
  }
  if (settlementStatus && SETTLEMENT_STATUSES.has(settlementStatus)) {
    where.push(`pgr.settlement_status = $${i++}`);
    params.push(settlementStatus);
  }
  if (q) {
    where.push(`(pgr.member_name ILIKE $${i} OR pgr.product_name ILIKE $${i} OR pgr.reason ILIKE $${i} OR pgr.memo ILIKE $${i} OR pgr.transaction_id ILIKE $${i})`);
    params.push(`%${q}%`);
    i++;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await dbAll<PassGrantRecordRow>(`
    SELECT pgr.*,
           mp.status AS pass_status
      FROM pass_grant_records pgr
      LEFT JOIN member_passes mp ON mp.id = pgr.pass_id
      ${whereSql}
     ORDER BY pgr.created_at DESC
     LIMIT ${limit}
  `, params);

  return NextResponse.json({
    items: rows.map(rowToGrant),
    count: rows.length,
    limit,
  });
}
