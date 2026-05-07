import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun } from '@/lib/db';

// ─────────────────────────────────────────────────────────────────────
// PR-6: Toss Payments webhook receiver (server-to-server, no auth cookie)
//
// Toss POSTs us payment-status events (PAYMENT_STATUS_CHANGED). We use
// it to catch out-of-band state changes (chargeback / cancel from the
// merchant console, async refunds, etc.). For a clean checkout flow the
// /confirm endpoint already finalised the pass, so the webhook is a
// safety net that updates payment_status on member_passes if it changes.
//
// Auth: Toss does NOT sign webhooks per request. The standard guard is
// to whitelist their IP range *and* match the orderId+amount against our
// own pending_payments row before mutating anything. We do the latter.
// ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventType = body?.eventType;
    const data = body?.data;
    const orderId = data?.orderId;
    const newStatus = data?.status;

    if (!orderId || !newStatus) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const pending = await dbGet<any>(
      'SELECT * FROM pending_payments WHERE order_id = $1',
      [orderId]
    );
    if (!pending) {
      return NextResponse.json({ ok: true, unknownOrder: true });
    }

    // Map Toss statuses to our payment_status enum.
    let mapped: string | null = null;
    switch (newStatus) {
      case 'DONE':            mapped = 'paid'; break;
      case 'CANCELED':        mapped = 'refunded'; break;
      case 'PARTIAL_CANCELED':mapped = 'partial_refund'; break;
      case 'ABORTED':
      case 'EXPIRED':
        mapped = 'unpaid'; break;
      default: mapped = null;
    }
    if (!mapped) return NextResponse.json({ ok: true, ignored: eventType });

    if (pending.pass_id) {
      await dbRun(`
        UPDATE member_passes
           SET payment_status=$1, updated_at=NOW(),
               status = CASE
                          WHEN $1 IN ('refunded','partial_refund') THEN 'refunded'
                          ELSE status
                        END
         WHERE id=$2
      `, [mapped, pending.pass_id]);
    }
    await dbRun(
      `UPDATE pending_payments SET status = CASE WHEN $1='paid' THEN 'confirmed' ELSE status END, updated_at=NOW() WHERE order_id=$2`,
      [mapped, orderId]
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[payments/webhook] error:', error);
    // Always 200 to webhooks unless we want a retry. For unknown errors
    // we DO want a retry, so respond 500.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
