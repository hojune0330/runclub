import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

// ─────────────────────────────────────────────────────────────────────
// PR-6 STEP 4: Admin payment monitoring
//
// GET  /api/payments/list?status=&limit=&from=&to=
//   → returns recent pending_payments rows joined with member + product +
//     issued pass info. Admin only.
//
// GET  /api/payments/list?stats=true
//   → returns rollup stats (today / month / failure rate / pending count).
//
// We make sure pending_payments exists (CREATE IF NOT EXISTS) so this
// endpoint never errors on a fresh DB where no checkout has been opened
// yet.
// ─────────────────────────────────────────────────────────────────────

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS pending_payments (
    order_id        TEXT PRIMARY KEY,
    member_id       TEXT NOT NULL,
    product_id      TEXT NOT NULL,
    amount          INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','failed','expired')),
    payment_key     TEXT,
    method          TEXT,
    confirmed_at    TIMESTAMPTZ,
    pass_id         TEXT,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  await dbRun(ENSURE_TABLE);

  const url = new URL(req.url);
  const wantStats = url.searchParams.get('stats') === 'true';

  // ── Stats branch ──
  if (wantStats) {
    // Use a single roundtrip; defensive COALESCE for empty tables.
    const todayRow = await dbGet<any>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'confirmed' AND DATE(confirmed_at) = CURRENT_DATE) AS today_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed' AND DATE(confirmed_at) = CURRENT_DATE), 0) AS today_amount,
        COUNT(*) FILTER (WHERE status = 'confirmed' AND DATE_TRUNC('month', confirmed_at) = DATE_TRUNC('month', CURRENT_DATE)) AS month_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed' AND DATE_TRUNC('month', confirmed_at) = DATE_TRUNC('month', CURRENT_DATE)), 0) AS month_amount,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE status = 'failed' AND created_at > NOW() - INTERVAL '7 days') AS failed_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS total_7d
      FROM pending_payments
    `);
    const failureRate = todayRow?.total_7d > 0
      ? Math.round((Number(todayRow.failed_7d) / Number(todayRow.total_7d)) * 100)
      : 0;
    return NextResponse.json({
      today: { count: Number(todayRow?.today_count ?? 0), amount: Number(todayRow?.today_amount ?? 0) },
      month: { count: Number(todayRow?.month_count ?? 0), amount: Number(todayRow?.month_amount ?? 0) },
      pendingCount: Number(todayRow?.pending_count ?? 0),
      failed7d: Number(todayRow?.failed_7d ?? 0),
      total7d: Number(todayRow?.total_7d ?? 0),
      failureRate, // % over the last 7 days
    });
  }

  // ── List branch ──
  const status = url.searchParams.get('status'); // pending | confirmed | failed | expired | all
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200);
  const from = url.searchParams.get('from');     // YYYY-MM-DD
  const to = url.searchParams.get('to');         // YYYY-MM-DD

  const conds: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (status && ['pending', 'confirmed', 'failed', 'expired'].includes(status)) {
    conds.push(`pp.status = $${i++}`); params.push(status);
  }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    conds.push(`pp.created_at >= $${i++}`); params.push(`${from}T00:00:00Z`);
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    conds.push(`pp.created_at <= $${i++}`); params.push(`${to}T23:59:59Z`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const rows = await dbAll<any>(`
    SELECT pp.order_id, pp.member_id, pp.product_id, pp.amount, pp.status,
           pp.payment_key, pp.method, pp.confirmed_at, pp.pass_id,
           pp.error_message, pp.created_at, pp.updated_at,
           m.name  AS member_name,
           m.phone AS member_phone,
           prod.name AS product_name,
           mp.payment_status AS pass_payment_status
      FROM pending_payments pp
      LEFT JOIN members m       ON pp.member_id = m.id
      LEFT JOIN pass_products prod ON pp.product_id = prod.id
      LEFT JOIN member_passes mp ON pp.pass_id = mp.id
      ${where}
     ORDER BY pp.created_at DESC
     LIMIT ${limit}
  `, params);

  return NextResponse.json({
    items: rows.map(r => ({
      orderId: r.order_id,
      memberId: r.member_id,
      memberName: r.member_name ?? '(삭제된 회원)',
      memberPhone: r.member_phone ?? null,
      productId: r.product_id,
      productName: r.product_name ?? '(삭제된 상품)',
      amount: r.amount,
      status: r.status,
      method: r.method,
      paymentKey: r.payment_key,
      passId: r.pass_id,
      passPaymentStatus: r.pass_payment_status,
      errorMessage: r.error_message,
      confirmedAt: r.confirmed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    count: rows.length,
    limit,
  });
}
