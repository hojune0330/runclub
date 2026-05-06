/**
 * Cron endpoint: drain the sheet_sync_queue and replay failed sync events
 * against Google Sheets.
 *
 * Triggered by Render Cron Job once per minute (see render.yaml). Auth is
 * enforced via the CRON_SECRET shared secret in the Authorization header to
 * prevent random callers from triggering replays.
 *
 *   POST /api/cron/sheet-sync-retry
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Each invocation processes up to BATCH (default 50) queued events. Failed
 * replays bump the attempts counter; once attempts >= 10 the event is left
 * in the queue for manual inspection (sheet_sync_log records every step).
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import {
  SHEET_SYNC_ENABLED,
  fetchPendingSyncEvents,
  markSyncEventDone,
  markSyncEventFailed,
  upsertRow,
  appendOnlyRow,
} from '@/lib/sheets';

const BATCH = Number(process.env.SHEET_SYNC_RETRY_BATCH ?? 50);

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = req.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!presented) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function runRetry() {
  if (!SHEET_SYNC_ENABLED) {
    return { ok: true, skipped: 'SHEET_SYNC_ENABLED=false', processed: 0 };
  }
  const events = await fetchPendingSyncEvents(BATCH);
  if (events.length === 0) {
    return { ok: true, processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const ev of events) {
    try {
      if (ev.op === 'append') {
        await appendOnlyRow(ev.tab, ev.payload);
      } else {
        await upsertRow(ev.tab, ev.payload);
      }
      await markSyncEventDone(ev.id);
      succeeded++;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      await markSyncEventFailed(ev.id, msg);
      failed++;
    }
  }

  return { ok: true, processed: events.length, succeeded, failed };
}

// Both POST (preferred — for cron callers) and GET (convenience for ad-hoc
// triage) are supported. Same auth on both.
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await runRetry();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[cron/sheet-sync-retry] error:', err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
