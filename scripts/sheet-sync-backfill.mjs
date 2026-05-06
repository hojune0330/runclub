#!/usr/bin/env node
/**
 * One-shot backfill: copy every existing member / pass / session / attendance
 * row from PostgreSQL into the corresponding Google Sheets tab.
 *
 * Run this ONCE after `npm run sheet:init` and after enabling
 * SHEET_SYNC_ENABLED=true in production. Safe to re-run — uses upsert by
 * primary key, so existing rows are updated in place and manager memo
 * columns are preserved.
 *
 * Usage (Render shell or local with prod DB):
 *   DATABASE_URL='...' \
 *   GOOGLE_SERVICE_ACCOUNT_JSON='...' \
 *   GOOGLE_SHEET_ID='...' \
 *   SHEET_SYNC_ENABLED=true \
 *     node scripts/sheet-sync-backfill.mjs
 *
 * Optional env:
 *   BACKFILL_BATCH_SIZE  default 500     — Sheets API write batch size
 *   BACKFILL_TABS        default all     — comma-separated subset
 *                                          (members,passes,sessions,attendance)
 *   BACKFILL_THROTTLE_MS default 1100    — delay between batches (Sheets
 *                                          per-minute write quota = 60)
 */

import pg from 'pg';
import { google } from 'googleapis';

const REQUIRED = ['DATABASE_URL', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_SHEET_ID'];
for (const k of REQUIRED) {
  if (!process.env[k]) {
    console.error(`${k} is required`);
    process.exit(1);
  }
}
if ((process.env.SHEET_SYNC_ENABLED ?? '').toLowerCase() !== 'true') {
  console.error('SHEET_SYNC_ENABLED must be "true" to run the backfill');
  process.exit(1);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE ?? 500);
const THROTTLE_MS = Number(process.env.BACKFILL_THROTTLE_MS ?? 1100);
const TABS_FILTER = (process.env.BACKFILL_TABS ?? 'members,passes,sessions,attendance')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const TAB = {
  members:    process.env.GOOGLE_SHEET_TAB_MEMBERS    ?? 'Members',
  passes:     process.env.GOOGLE_SHEET_TAB_PASSES     ?? 'Passes',
  attendance: process.env.GOOGLE_SHEET_TAB_ATTENDANCE ?? 'Attendance',
  sessions:   process.env.GOOGLE_SHEET_TAB_SESSIONS   ?? 'Sessions',
};

const DB_RANGE = {
  members:    { firstCol: 'A', lastCol: 'I' },
  passes:     { firstCol: 'A', lastCol: 'N' },
  attendance: { firstCol: 'A', lastCol: 'K' },
  sessions:   { firstCol: 'A', lastCol: 'M' },
};

// ─── Sheets client ───────────────────────────────────────────────────────

function buildSheets() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const creds = JSON.parse(json);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ─── DB ──────────────────────────────────────────────────────────────────

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Mappers (mirrors src/lib/sheets-mappers.ts) ─────────────────────────

const mapMember = (m) => [
  m.id, m.name ?? '', m.phone ?? '', m.email ?? '', m.role ?? 'member',
  m.join_date ?? '', !!m.is_active, m.memo ?? '', nowIso(),
];

const mapPass = (p) => [
  p.id, p.member_id, p.member_name ?? '', p.product_name ?? '', p.category ?? '',
  p.total_count ?? '', p.remaining_count ?? '',
  p.start_date ?? '', p.expiry_date ?? '', p.issued_date ?? '',
  p.status ?? 'active', p.paused_at ?? '', p.price ?? '', nowIso(),
];

const mapSession = (s) => [
  s.id, s.name ?? '', s.type ?? '', s.date ?? '',
  s.start_time ?? '', s.end_time ?? '', s.location ?? '',
  s.max_capacity ?? '', s.current_reservations ?? 0, s.waitlist_count ?? 0,
  s.status ?? 'open', !!s.is_indoor, nowIso(),
];

const mapAttendance = (a) => [
  a.id, a.member_id, a.member_name ?? '', a.session_id, a.session_name ?? '',
  a.session_date ?? '', a.session_start_time ?? '', a.checked_in_at ?? '',
  a.status, a.pass_id ?? '', nowIso(),
];

// ─── Sheet ops ───────────────────────────────────────────────────────────

async function loadKeyToRow(sheets, tab) {
  // Returns Map(key → 1-based row index). Used by upsert to decide
  // append vs update without an extra round-trip per row.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A:A`,
    majorDimension: 'COLUMNS',
  });
  const col = res.data.values?.[0] ?? [];
  const map = new Map();
  for (let i = 1; i < col.length; i++) {
    if (col[i]) map.set(String(col[i]), i + 1);
  }
  return map;
}

async function batchAppend(sheets, tab, range, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!${range}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

async function batchUpdate(sheets, tab, updates, firstCol, lastCol) {
  if (updates.length === 0) return;
  // updates: [{ rowIndex, row }]
  const data = updates.map(({ rowIndex, row }) => ({
    range: `${tab}!${firstCol}${rowIndex}:${lastCol}${rowIndex}`,
    values: [row],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
}

async function pushBatch(sheets, tabKey, batch) {
  const tab = TAB[tabKey];
  const { firstCol, lastCol } = DB_RANGE[tabKey];
  const keyMap = await loadKeyToRow(sheets, tab);

  const toAppend = [];
  const toUpdate = [];
  for (const row of batch) {
    const key = String(row[0] ?? '');
    if (!key) continue;
    const existingRow = keyMap.get(key);
    if (existingRow) {
      toUpdate.push({ rowIndex: existingRow, row });
    } else {
      toAppend.push(row);
    }
  }
  if (toUpdate.length) {
    await batchUpdate(sheets, tab, toUpdate, firstCol, lastCol);
    console.log(`[backfill ${tabKey}] updated ${toUpdate.length} rows`);
  }
  if (toAppend.length) {
    await batchAppend(sheets, tab, `${firstCol}:${lastCol}`, toAppend);
    console.log(`[backfill ${tabKey}] appended ${toAppend.length} rows`);
  }
}

async function pushAttendanceAppendOnly(sheets, batch) {
  const tab = TAB.attendance;
  const { firstCol, lastCol } = DB_RANGE.attendance;
  // For Attendance, the sheet is append-only history. To stay idempotent on
  // re-runs we still de-dup against existing primary keys present in the
  // sheet — otherwise a second backfill would double the log.
  const keyMap = await loadKeyToRow(sheets, tab);
  const fresh = batch.filter((row) => !keyMap.has(String(row[0] ?? '')));
  if (fresh.length) {
    await batchAppend(sheets, tab, `${firstCol}:${lastCol}`, fresh);
    console.log(`[backfill attendance] appended ${fresh.length} rows`);
  } else if (batch.length) {
    console.log(`[backfill attendance] all ${batch.length} rows already present`);
  }
}

// ─── Backfill steps ──────────────────────────────────────────────────────

async function backfillMembers(sheets) {
  const { rows } = await pool.query(`
    SELECT id, name, phone, email, role, join_date, is_active, memo
    FROM members
    ORDER BY join_date ASC, id ASC
  `);
  console.log(`[backfill members] ${rows.length} rows`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE).map(mapMember);
    await pushBatch(sheets, 'members', slice);
    if (i + BATCH_SIZE < rows.length) await sleep(THROTTLE_MS);
  }
}

async function backfillPasses(sheets) {
  const { rows } = await pool.query(`
    SELECT mp.id, mp.member_id, mp.product_id,
           mp.total_count, mp.remaining_count,
           mp.start_date, mp.expiry_date, mp.issued_date,
           mp.price, mp.status, mp.paused_at,
           m.name AS member_name,
           pp.name AS product_name, pp.category
    FROM member_passes mp
    JOIN members m       ON mp.member_id = m.id
    JOIN pass_products pp ON mp.product_id = pp.id
    ORDER BY mp.issued_date ASC, mp.id ASC
  `);
  console.log(`[backfill passes] ${rows.length} rows`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE).map(mapPass);
    await pushBatch(sheets, 'passes', slice);
    if (i + BATCH_SIZE < rows.length) await sleep(THROTTLE_MS);
  }
}

async function backfillSessions(sheets) {
  const { rows } = await pool.query(`
    SELECT s.id, s.name, s.type, s.date, s.start_time, s.end_time,
           s.location, s.max_capacity, s.status, s.is_indoor,
           (SELECT COUNT(*) FROM reservations r
              WHERE r.session_id = s.id AND r.status IN ('reserved','attended'))::int AS current_reservations,
           (SELECT COUNT(*) FROM waitlist w
              WHERE w.session_id = s.id AND w.status = 'waiting')::int AS waitlist_count
    FROM sessions s
    ORDER BY s.date ASC, s.start_time ASC
  `);
  console.log(`[backfill sessions] ${rows.length} rows`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE).map(mapSession);
    await pushBatch(sheets, 'sessions', slice);
    if (i + BATCH_SIZE < rows.length) await sleep(THROTTLE_MS);
  }
}

async function backfillAttendance(sheets) {
  // Only push terminal-state events (attended / cancelled / noshow).
  // 'reserved' is not yet attendance; it would clutter the history.
  const { rows } = await pool.query(`
    SELECT r.id, r.member_id, r.session_id, r.status, r.checked_in_at, r.pass_id,
           m.name AS member_name,
           s.name AS session_name, s.date AS session_date,
           s.start_time AS session_start_time
    FROM reservations r
    JOIN members m  ON r.member_id  = m.id
    JOIN sessions s ON r.session_id = s.id
    WHERE r.status IN ('attended', 'cancelled', 'noshow')
    ORDER BY r.reserved_at ASC, r.id ASC
  `);
  console.log(`[backfill attendance] ${rows.length} rows`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE).map(mapAttendance);
    await pushAttendanceAppendOnly(sheets, slice);
    if (i + BATCH_SIZE < rows.length) await sleep(THROTTLE_MS);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[backfill] sheet=${SHEET_ID} batch=${BATCH_SIZE} throttle=${THROTTLE_MS}ms tabs=${TABS_FILTER.join(',')}`);
  const sheets = buildSheets();

  // Sanity check
  await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'spreadsheetId' });

  if (TABS_FILTER.includes('members'))    await backfillMembers(sheets);
  if (TABS_FILTER.includes('passes'))     await backfillPasses(sheets);
  if (TABS_FILTER.includes('sessions'))   await backfillSessions(sheets);
  if (TABS_FILTER.includes('attendance')) await backfillAttendance(sheets);

  console.log('[backfill] ✓ done');
}

main()
  .catch((err) => {
    console.error('[backfill] FAILED:', err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
