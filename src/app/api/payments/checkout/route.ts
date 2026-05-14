import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { safeSync } from '@/lib/sheets';
import { mapPassRow } from '@/lib/sheets-mappers';

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
//
// PR-C3 (0원 패스 즉시 발급):
//   product.price === 0 인 상품은 Toss를 거치지 않습니다.
//   Toss는 100원 미만 결제를 거부하므로, 가격이 0인 무료 체험권/이벤트권은
//   체크아웃 단계에서 즉시 member_passes에 발급하고 pending_payments는
//   audit 용도로 'confirmed' 상태로 한 번에 기록합니다.
//   클라이언트는 응답에 free=true 가 있으면 SDK를 열지 않고 곧장
//   /payments/success?orderId=...&free=1 로 이동합니다.
//
//   동일 회원에게 같은 무료 상품이 이미 활성/일시정지 상태로 존재하면
//   재발급을 거절합니다 (무료 무한 발급 차단).
// ─────────────────────────────────────────────────────────────────────

function resolveAppOrigin(req: NextRequest): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;

  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.headers.get('host')?.trim();
  if (host) {
    const proto = forwardedProto || (req.nextUrl.protocol ? req.nextUrl.protocol.replace(':', '') : 'https');
    return `${proto}://${host}`;
  }

  return req.nextUrl.origin && req.nextUrl.origin !== 'null'
    ? req.nextUrl.origin.replace(/\/+$/, '')
    : null;
}

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

    // ── PR-C3: 0원 패스 즉시 발급 분기 ──
    if (product.price === 0) {
      // 중복 발급 방지: 같은 무료 상품을 이미 활성/일시정지로 보유 중이면 거절.
      const existing = await dbGet<{ id: string }>(
        `SELECT id FROM member_passes
          WHERE member_id = $1 AND product_id = $2
            AND status IN ('active','paused')
          LIMIT 1`,
        [member.id, product.id]
      );
      if (existing) {
        return NextResponse.json(
          { error: '이미 발급받은 무료 수강권이 있습니다' },
          { status: 400 }
        );
      }

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
          $1, $2, $3, $4, $5, $6, $7, $8, 0, 'active',
          'paid', 'free', 0, NOW(),
          $9, 0, NOW()
        )
      `, [
        passId, member.id, product.id,
        product.total_count, product.total_count,
        today, expiryDate, today,
        orderId, // transaction_id 자리에 orderId 기록 (Toss paymentKey 대용)
      ]);

      // pending_payments도 감사 추적용으로 confirmed 상태로 한 번에 기록.
      await dbRun(`
        INSERT INTO pending_payments
          (order_id, member_id, product_id, amount, status,
           payment_key, method, confirmed_at, pass_id)
        VALUES ($1, $2, $3, 0, 'confirmed',
                $1, 'free', NOW(), $4)
      `, [orderId, member.id, product.id, passId]);

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
        free: true,
        orderId,
        passId,
        orderName: product.name,
        amount: 0,
      });
    }

    // ── 유료 흐름: pending row 생성 후 SDK 파라미터 반환 ──
    // Toss successUrl/failUrl은 절대 HTTPS URL이어야 하므로 운영 환경 설정을
    // 먼저 검증한다. NEXT_PUBLIC_APP_URL 미설정 시 프록시 헤더/요청 Host로
    // 보완하지만, Render 운영에서는 명시 설정하는 것이 심사·운영 안전성이 높다.
    const tossClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() || null;
    const appOrigin = resolveAppOrigin(req);
    if (!tossClientKey || !appOrigin) {
      return NextResponse.json(
        { error: '온라인 결제 환경변수가 설정되지 않았습니다. 운영자에게 문의해주세요.' },
        { status: 500 }
      );
    }

    await dbRun(`
      INSERT INTO pending_payments (order_id, member_id, product_id, amount, status)
      VALUES ($1, $2, $3, $4, 'pending')
    `, [orderId, member.id, product.id, product.price]);

    return NextResponse.json({
      free: false,
      orderId,
      orderName: product.name,
      amount: product.price,
      customerName: member.name,
      customerEmail: member.email ?? undefined,
      customerMobilePhone: member.phone?.replace(/-/g, '') || undefined,
      // Public client key for Toss SDK init (server passes through so the
      // client doesn't need to read its own env directly).
      tossClientKey,
      // Convenience redirect URLs the client should use as successUrl / failUrl.
      successUrl: `${appOrigin}/payments/success`,
      failUrl: `${appOrigin}/payments/fail`,
    });
  } catch (error: any) {
    console.error('[payments/checkout] error:', error);
    return NextResponse.json({ error: '결제 준비 중 오류가 발생했습니다' }, { status: 500 });
  }
}
