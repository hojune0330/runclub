import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { safeSync } from '@/lib/sheets';
import { mapPassRow } from '@/lib/sheets-mappers';

// ─────────────────────────────────────────────────────────────────────
// PR-6: Member-initiated purchase — Step 2 (CONFIRM)
//
// Called by the success-redirect page on the client. We:
//   1. Look up the pending_payments row by orderId (created in /checkout).
//   2. Verify amount matches what Toss tells us (anti-tamper).
//   3. Call Toss /v1/payments/confirm with the secret key.
//   4. On success, INSERT a member_passes row, mark pending row 'confirmed',
//      log the action, mirror to Sheets.
//
// IMPORTANT: this endpoint MUST be idempotent. Toss may redirect twice on
// flaky networks. We bail early if the orderId is already 'confirmed'.
// ─────────────────────────────────────────────────────────────────────

const TOSS_BASE = 'https://api.tosspayments.com';

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  try {
    const body = await req.json();
    const { paymentKey, orderId, amount } = body;

    if (!paymentKey || !orderId || typeof amount !== 'number') {
      return NextResponse.json(
        { error: 'paymentKey, orderId, amount가 필요합니다' },
        { status: 400 }
      );
    }

    const pending = await dbGet<any>(
      'SELECT * FROM pending_payments WHERE order_id = $1',
      [orderId]
    );
    if (!pending) {
      return NextResponse.json({ error: '주문 정보를 찾을 수 없습니다' }, { status: 404 });
    }
    if (pending.member_id !== auth.memberId) {
      return NextResponse.json({ error: '주문자가 일치하지 않습니다' }, { status: 403 });
    }
    // Idempotency: if already confirmed, just return the existing pass.
    if (pending.status === 'confirmed' && pending.pass_id) {
      return NextResponse.json({
        success: true,
        passId: pending.pass_id,
        alreadyConfirmed: true,
      });
    }
    if (pending.amount !== amount) {
      return NextResponse.json(
        { error: '결제 금액이 일치하지 않습니다' },
        { status: 400 }
      );
    }

    const product = await dbGet<any>('SELECT * FROM pass_products WHERE id = $1', [pending.product_id]);
    if (!product) {
      return NextResponse.json({ error: '상품 정보를 찾을 수 없습니다' }, { status: 404 });
    }

    // ── Call Toss confirm API ──
    const secretKey = process.env.TOSS_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: 'TOSS_SECRET_KEY가 설정되지 않았습니다' }, { status: 500 });
    }
    const basicAuth = Buffer.from(`${secretKey}:`).toString('base64');

    let tossResult: any;
    try {
      const resp = await fetch(`${TOSS_BASE}/v1/payments/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': orderId,
        },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      });
      tossResult = await resp.json();
      if (!resp.ok) {
        await dbRun(
          `UPDATE pending_payments SET status='failed', error_message=$1, updated_at=NOW() WHERE order_id=$2`,
          [tossResult?.message ?? `HTTP ${resp.status}`, orderId]
        );
        return NextResponse.json(
          { error: tossResult?.message ?? '결제 승인에 실패했습니다' },
          { status: 400 }
        );
      }
    } catch (err: any) {
      await dbRun(
        `UPDATE pending_payments SET status='failed', error_message=$1, updated_at=NOW() WHERE order_id=$2`,
        [err?.message ?? 'network', orderId]
      );
      return NextResponse.json({ error: '결제 승인 통신 중 오류가 발생했습니다' }, { status: 500 });
    }

    // ── Issue the pass ──
    const today = new Date().toISOString().split('T')[0];
    const startMs = new Date(`${today}T00:00:00Z`).getTime();
    const expiryDate = new Date(startMs + product.duration_days * 86400000)
      .toISOString().split('T')[0];

    const passId = genId('mp');
    await dbRun(`
      INSERT INTO member_passes (
        id, member_id, product_id,
        total_count, remaining_count,
        start_date, expiry_date, issued_date,
        price, status,
        payment_status, payment_method, payment_amount, paid_at,
        transaction_id, discount_amount, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 'active',
        'paid', $10, $11, NOW(),
        $12, 0, NOW()
      )
    `, [
      passId, pending.member_id, pending.product_id,
      product.total_count, product.total_count,
      today, expiryDate, today,
      product.price,
      tossResult?.method ?? 'toss', amount,
      paymentKey,
    ]);

    await dbRun(`
      UPDATE pending_payments
         SET status='confirmed',
             payment_key=$1,
             method=$2,
             confirmed_at=NOW(),
             pass_id=$3,
             updated_at=NOW()
       WHERE order_id=$4
    `, [paymentKey, tossResult?.method ?? 'toss', passId, orderId]);

    // Sheets mirror (best-effort)
    try {
      const issuedRow = await dbGet<any>(`
        SELECT mp.id, mp.member_id, mp.product_id,
               mp.total_count, mp.remaining_count,
               mp.start_date, mp.expiry_date, mp.issued_date,
               mp.price, mp.status, mp.paused_at,
               m.name AS member_name,
               pp.name AS product_name, pp.category
        FROM member_passes mp
        JOIN members m ON mp.member_id = m.id
        JOIN pass_products pp ON mp.product_id = pp.id
        WHERE mp.id = $1
      `, [passId]);
      if (issuedRow) void safeSync('passes', 'upsert', mapPassRow(issuedRow));
    } catch { /* swallow */ }

    return NextResponse.json({
      success: true,
      passId,
      orderId,
      amount,
      method: tossResult?.method ?? 'toss',
    });
  } catch (error: any) {
    console.error('[payments/confirm] error:', error);
    return NextResponse.json({ error: '결제 확인 중 오류가 발생했습니다' }, { status: 500 });
  }
}
