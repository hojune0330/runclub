import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';

// ─────────────────────────────────────────────────────────────────────
// PR-6: Member-initiated purchase — Step 1 (CHECKOUT)
//
// Flow:
//   1. Member taps "구매" on a product card → POST /api/payments/checkout
//   2. We validate the product, compute final price, create a *pending*
//      payments row, and return { orderId, amount, productName, customerName }.
//   3. The client opens Toss Payments SDK with these params.
//   4. On success, Toss redirects to /payments/success?orderId=…&paymentKey=…&amount=…
//      which calls /api/payments/confirm to finalise the pass.
//
// We don't store the Toss secret key on the client. The client only
// needs the *client* key (env: NEXT_PUBLIC_TOSS_CLIENT_KEY) and the
// orderId we generated here. Confirmation always happens server-side.
// ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  try {
    const body = await req.json();
    const productId = body?.productId;
    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'productId가 필요합니다' }, { status: 400 });
    }

    const product = await dbGet<any>('SELECT * FROM pass_products WHERE id = $1', [productId]);
    if (!product) {
      return NextResponse.json({ error: '상품을 찾을 수 없습니다' }, { status: 404 });
    }
    if (product.is_active === false) {
      return NextResponse.json({ error: '판매 중단된 상품입니다' }, { status: 400 });
    }

    const member = await dbGet<{ id: string; name: string; phone: string; email: string | null; is_active: boolean }>(
      'SELECT id, name, phone, email, is_active FROM members WHERE id = $1',
      [auth.memberId]
    );
    if (!member || !member.is_active) {
      return NextResponse.json({ error: '회원 정보가 올바르지 않습니다' }, { status: 400 });
    }

    const orderId = `order_${genId('pmt')}`;

    // Ensure the pending_payments table exists before insert.
    // (Single round-trip; CREATE IF NOT EXISTS is idempotent and cheap.)
    await dbRun(`
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
    `);

    await dbRun(`
      INSERT INTO pending_payments (order_id, member_id, product_id, amount, status)
      VALUES ($1, $2, $3, $4, 'pending')
    `, [orderId, member.id, product.id, product.price]);

    return NextResponse.json({
      orderId,
      orderName: product.name,
      amount: product.price,
      customerName: member.name,
      customerEmail: member.email ?? undefined,
      customerMobilePhone: member.phone?.replace(/-/g, '') || undefined,
      // Public client key for Toss SDK init (server passes through so the
      // client doesn't need to read its own env directly).
      tossClientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? null,
      // Convenience redirect URLs the client should use as successUrl / failUrl.
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/payments/success`,
      failUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/payments/fail`,
    });
  } catch (error: any) {
    console.error('[payments/checkout] error:', error);
    return NextResponse.json({ error: '결제 준비 중 오류가 발생했습니다' }, { status: 500 });
  }
}
