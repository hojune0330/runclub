import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { safeSync } from '@/lib/sheets';
import { mapPassRow } from '@/lib/sheets-mappers';
import { logAdminAction } from '@/lib/audit';

// ─────────────────────────────────────────────────────────────────────
// PR-6: Pass lifecycle endpoint.
//   GET    : list (admin sees all or filter by memberId; members see own)
//   POST   : issue a pass (admin) — supports payment envelope + discount
//   PUT    : status / extend / adjust / payment-update actions (admin)
// ─────────────────────────────────────────────────────────────────────

const SELECT_PASS_FULL = `
  SELECT mp.id, mp.member_id, mp.product_id,
         mp.total_count, mp.remaining_count,
         mp.start_date, mp.expiry_date, mp.issued_date,
         mp.price, mp.status, mp.paused_at, mp.paused_until,
         mp.payment_status, mp.payment_method, mp.payment_amount,
         mp.paid_at, mp.transaction_id,
         mp.discount_amount, mp.discount_reason,
         mp.admin_memo, mp.updated_at,
         m.name AS member_name,
         pp.name AS product_name, pp.category, pp.applicable_sessions,
         pp.total_count AS product_total_count
  FROM member_passes mp
  JOIN members m       ON mp.member_id = m.id
  JOIN pass_products pp ON mp.product_id = pp.id
`;

function rowToPass(p: any, isAdmin: boolean) {
  let applicableSessions: any;
  try {
    applicableSessions = p.applicable_sessions === 'all'
      ? 'all'
      : JSON.parse(p.applicable_sessions);
  } catch {
    applicableSessions = 'all';
  }
  return {
    id: p.id,
    memberId: p.member_id,
    memberName: p.member_name,
    productId: p.product_id,
    productName: p.product_name,
    category: p.category,
    applicableSessions,
    totalCount: p.total_count ?? p.product_total_count,
    remainingCount: p.remaining_count,
    startDate: p.start_date,
    expiryDate: p.expiry_date,
    issuedDate: p.issued_date,
    // Hide unit price + admin-only payment data from non-admin viewers.
    price: isAdmin ? p.price : undefined,
    status: p.status,
    pausedAt: p.paused_at,
    pausedUntil: p.paused_until,

    // Payment envelope (admin only)
    paymentStatus: isAdmin ? (p.payment_status ?? 'unpaid') : undefined,
    paymentMethod: isAdmin ? p.payment_method : undefined,
    paymentAmount: isAdmin ? p.payment_amount : undefined,
    paidAt: isAdmin ? p.paid_at : undefined,
    transactionId: isAdmin ? p.transaction_id : undefined,
    discountAmount: isAdmin ? (p.discount_amount ?? 0) : undefined,
    discountReason: isAdmin ? p.discount_reason : undefined,
    adminMemo: isAdmin ? p.admin_memo : undefined,
    updatedAt: p.updated_at ? new Date(p.updated_at).toISOString() : null,
  };
}

// ─── GET /api/passes ───
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  const memberIdRaw = req.nextUrl.searchParams.get('memberId');
  const memberId =
    typeof memberIdRaw === 'string' && memberIdRaw.length > 0 && memberIdRaw.length <= 64
      ? memberIdRaw
      : null;

  let where = '';
  const params: any[] = [];
  if (auth.role !== 'admin') {
    if (memberId && memberId !== auth.memberId) {
      return forbiddenResponse('다른 회원의 수강권은 조회할 수 없습니다');
    }
    where = 'WHERE mp.member_id = $1';
    params.push(auth.memberId);
  } else if (memberId) {
    where = 'WHERE mp.member_id = $1';
    params.push(memberId);
  }

  const passes = await dbAll(`${SELECT_PASS_FULL} ${where} ORDER BY mp.issued_date DESC`, params);
  const isAdmin = auth.role === 'admin';
  return NextResponse.json(passes.map(p => rowToPass(p, isAdmin)));
}

// ─── POST /api/passes ───
// Admin issues a pass to a member. Optional payment envelope:
//   paymentStatus  : 'unpaid' | 'paid' | 'refunded' | 'partial_refund'
//   paymentMethod  : 'cash' | 'transfer' | 'card' | 'manual' | 'free' | …
//   paymentAmount  : number (defaults to product.price - discount)
//   discountAmount : number (≥0, ≤ price)
//   discountReason : free text
//   adminMemo      : free text
//   startDate      : ISO date — defaults to today
//   transactionId  : provider transaction id (Toss orderId, etc.)
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const body = await req.json();
    const { memberId, productId } = body;
    if (!memberId || !productId) {
      return NextResponse.json({ error: 'memberId와 productId가 필요합니다' }, { status: 400 });
    }

    const member = await dbGet<{ id: string; is_active: boolean }>(
      'SELECT id, is_active FROM members WHERE id = $1',
      [memberId]
    );
    if (!member) return NextResponse.json({ error: '회원을 찾을 수 없습니다' }, { status: 404 });
    if (!member.is_active) {
      return NextResponse.json({ error: '비활성 회원에게는 발급할 수 없습니다' }, { status: 400 });
    }

    const product = await dbGet<any>('SELECT * FROM pass_products WHERE id = $1', [productId]);
    if (!product) return NextResponse.json({ error: '수강권 상품을 찾을 수 없습니다' }, { status: 404 });
    if (product.is_active === false) {
      return NextResponse.json({ error: '비활성 상품은 발급할 수 없습니다' }, { status: 400 });
    }

    // ── Payment envelope (all optional) ──
    const allowedPaymentStatus = ['unpaid', 'paid', 'refunded', 'partial_refund'] as const;
    const paymentStatus = allowedPaymentStatus.includes(body.paymentStatus)
      ? body.paymentStatus
      : 'unpaid';
    const paymentMethod = typeof body.paymentMethod === 'string' && body.paymentMethod.length <= 32
      ? body.paymentMethod
      : null;

    const discountAmount = typeof body.discountAmount === 'number' && body.discountAmount >= 0
      ? Math.min(body.discountAmount, product.price)
      : 0;
    const discountReason = typeof body.discountReason === 'string' && body.discountReason.length <= 200
      ? body.discountReason.trim() || null
      : null;
    const finalAmount = Math.max(0, product.price - discountAmount);
    const paymentAmount = typeof body.paymentAmount === 'number'
      ? Math.max(0, body.paymentAmount)
      : finalAmount;
    const adminMemo = typeof body.adminMemo === 'string' && body.adminMemo.length <= 1000
      ? body.adminMemo.trim() || null
      : null;
    const transactionId = typeof body.transactionId === 'string' && body.transactionId.length <= 128
      ? body.transactionId
      : null;

    // ── Date envelope ──
    const today = new Date().toISOString().split('T')[0];
    const startDate = typeof body.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
      ? body.startDate
      : today;
    // Compute expiry by adding duration_days to startDate (UTC arithmetic ok for date-only).
    const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
    const expiryDate = new Date(startMs + product.duration_days * 86400000)
      .toISOString().split('T')[0];

    const id = genId('mp');
    const paidAt = paymentStatus === 'paid' ? 'NOW()' : 'NULL';

    // We can't parameterise NOW() cleanly while keeping pg type inference
    // happy, so the SQL is split: paidAt is interpolated literally (safe —
    // it's one of two hard-coded strings).
    await dbRun(`
      INSERT INTO member_passes (
        id, member_id, product_id,
        total_count, remaining_count,
        start_date, expiry_date, issued_date,
        price, status,
        payment_status, payment_method, payment_amount, paid_at,
        transaction_id, discount_amount, discount_reason, admin_memo,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 'active',
        $10, $11, $12, ${paidAt},
        $13, $14, $15, $16,
        NOW()
      )
    `, [
      id, memberId, productId,
      product.total_count, product.total_count,
      startDate, expiryDate, today,
      product.price,
      paymentStatus, paymentMethod, paymentAmount,
      transactionId, discountAmount, discountReason, adminMemo,
    ]);

    let issuedRow: any = null;
    try {
      issuedRow = await dbGet<any>(`${SELECT_PASS_FULL} WHERE mp.id = $1`, [id]);
      if (issuedRow) {
        void safeSync('passes', 'upsert', mapPassRow(issuedRow));
      }
    } catch { /* swallow */ }

    void logAdminAction(req, auth.memberId, {
      action: 'pass.issue',
      targetType: 'pass',
      targetId: id,
      targetName: issuedRow?.product_name ?? product.name,
      summary: `수강권 발급: ${issuedRow?.member_name ?? memberId} → ${issuedRow?.product_name ?? product.name} (${paymentStatus === 'paid' ? '결제완료' : '미결제'} ₩${paymentAmount})`,
      afterValue: {
        id, memberId, productId,
        startDate, expiryDate, paymentStatus, paymentMethod,
        paymentAmount, discountAmount,
      },
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error: any) {
    console.error('[passes POST] error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}

// ─── PUT /api/passes ───
// Admin actions (action-based dispatcher):
//   pause    : status = paused
//   resume   : status = active, paused_at NULL
//   refund   : status = refunded, payment_status = refunded
//   extend   : { days?, expiryDate? } — push expiry forward
//   adjust   : { totalCount?, remainingCount? } — for count passes
//   payment  : { paymentStatus, paymentMethod?, paymentAmount?, transactionId?, paidAt? }
//   memo     : { adminMemo }
export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const body = await req.json();
    const { passId, action } = body;
    if (!passId || !action) {
      return NextResponse.json({ error: 'passId와 action이 필요합니다' }, { status: 400 });
    }

    const allowed = ['pause', 'refund', 'resume', 'extend', 'adjust', 'payment', 'memo'] as const;
    if (!allowed.includes(action)) {
      return NextResponse.json({ error: '허용되지 않는 action 값입니다' }, { status: 400 });
    }

    const before = await dbGet<any>(`${SELECT_PASS_FULL} WHERE mp.id = $1`, [passId]);
    if (!before) return NextResponse.json({ error: '수강권을 찾을 수 없습니다' }, { status: 404 });

    let summary = '';

    if (action === 'pause') {
      await dbRun(`
        UPDATE member_passes
           SET status='paused', paused_at=NOW(), updated_at=NOW()
         WHERE id=$1
      `, [passId]);
      summary = '수강권 일시정지';
    } else if (action === 'resume') {
      await dbRun(`
        UPDATE member_passes
           SET status='active', paused_at=NULL, paused_until=NULL, updated_at=NOW()
         WHERE id=$1
      `, [passId]);
      summary = '수강권 재개';
    } else if (action === 'refund') {
      await dbRun(`
        UPDATE member_passes
           SET status='refunded',
               payment_status = CASE WHEN payment_status='paid' THEN 'refunded' ELSE payment_status END,
               updated_at=NOW()
         WHERE id=$1
      `, [passId]);
      summary = '수강권 환불';
    } else if (action === 'extend') {
      // Either pass `days` (relative) or `expiryDate` (absolute).
      let newExpiry: string | null = null;
      if (typeof body.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.expiryDate)) {
        newExpiry = body.expiryDate;
      } else if (typeof body.days === 'number' && Number.isFinite(body.days)) {
        const baseMs = new Date(`${before.expiry_date}T00:00:00Z`).getTime();
        const days = Math.max(-3650, Math.min(3650, Math.trunc(body.days)));
        newExpiry = new Date(baseMs + days * 86400000).toISOString().split('T')[0];
      } else {
        return NextResponse.json(
          { error: 'extend: days(숫자) 또는 expiryDate(YYYY-MM-DD)가 필요합니다' },
          { status: 400 }
        );
      }
      await dbRun(`UPDATE member_passes SET expiry_date=$1, updated_at=NOW() WHERE id=$2`, [newExpiry, passId]);
      summary = `만료일 변경: ${before.expiry_date} → ${newExpiry}`;
    } else if (action === 'adjust') {
      // Count adjustments — only for count passes.
      if (before.category !== 'count') {
        return NextResponse.json(
          { error: '횟수 조정은 횟수권에만 사용할 수 있습니다' },
          { status: 400 }
        );
      }
      const newTotal = typeof body.totalCount === 'number' ? Math.max(0, Math.trunc(body.totalCount)) : null;
      const newRemaining = typeof body.remainingCount === 'number' ? Math.max(0, Math.trunc(body.remainingCount)) : null;
      if (newTotal == null && newRemaining == null) {
        return NextResponse.json(
          { error: 'adjust: totalCount 또는 remainingCount가 필요합니다' },
          { status: 400 }
        );
      }
      const setParts: string[] = [];
      const params: any[] = [];
      let i = 1;
      if (newTotal != null) { setParts.push(`total_count=$${i++}`); params.push(newTotal); }
      if (newRemaining != null) {
        const cap = newTotal ?? before.total_count ?? newRemaining;
        setParts.push(`remaining_count=$${i++}`); params.push(Math.min(newRemaining, cap));
      }
      setParts.push(`updated_at=NOW()`);
      params.push(passId);
      await dbRun(`UPDATE member_passes SET ${setParts.join(', ')} WHERE id=$${i}`, params);
      summary = `횟수 조정: 총 ${before.total_count}→${newTotal ?? before.total_count}, 잔여 ${before.remaining_count}→${newRemaining ?? before.remaining_count}`;
    } else if (action === 'payment') {
      const allowedPaymentStatus = ['unpaid', 'paid', 'refunded', 'partial_refund'];
      if (!allowedPaymentStatus.includes(body.paymentStatus)) {
        return NextResponse.json({ error: 'paymentStatus가 올바르지 않습니다' }, { status: 400 });
      }
      const paidAtSql = body.paymentStatus === 'paid' ? 'NOW()' : 'paid_at';
      await dbRun(`
        UPDATE member_passes
           SET payment_status = $1,
               payment_method = COALESCE($2, payment_method),
               payment_amount = COALESCE($3, payment_amount),
               transaction_id = COALESCE($4, transaction_id),
               paid_at        = ${paidAtSql},
               updated_at     = NOW()
         WHERE id = $5
      `, [
        body.paymentStatus,
        body.paymentMethod ?? null,
        typeof body.paymentAmount === 'number' ? body.paymentAmount : null,
        body.transactionId ?? null,
        passId,
      ]);
      summary = `결제 정보 변경: ${before.payment_status ?? 'unpaid'} → ${body.paymentStatus}`;
    } else if (action === 'memo') {
      const memo = typeof body.adminMemo === 'string' ? body.adminMemo.slice(0, 1000) : null;
      await dbRun(`UPDATE member_passes SET admin_memo=$1, updated_at=NOW() WHERE id=$2`, [memo, passId]);
      summary = `관리자 메모 변경`;
    }

    let updatedRow: any = null;
    try {
      updatedRow = await dbGet<any>(`${SELECT_PASS_FULL} WHERE mp.id = $1`, [passId]);
      if (updatedRow) {
        void safeSync('passes', 'upsert', mapPassRow(updatedRow));
      }
    } catch { /* swallow */ }

    void logAdminAction(req, auth.memberId, {
      action: `pass.${action}` as any,
      targetType: 'pass',
      targetId: passId,
      targetName: before.product_name,
      summary: `${summary} (회원: ${before.member_name})`,
      beforeValue: rowToPass(before, true),
      afterValue: updatedRow ? rowToPass(updatedRow, true) : null,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[passes PUT] error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
