/**
 * Google Sheets sync infrastructure.
 *
 * Design principles:
 *  - One-way mirror only: PostgreSQL is the source of truth, Sheets is a
 *    downstream read-only mirror with a few manager-editable columns.
 *  - Fire-and-forget: every call is wrapped in `safeSync()` so a Sheets API
 *    failure never breaks the originating DB transaction.
 *  - Manager memo columns are NEVER overwritten. Upserts only touch the
 *    DB-owned column range.
 *  - When SHEET_SYNC_ENABLED !== 'true' (default), every export is a no-op,
 *    making local dev / CI safe out of the box.
 *  - On failure the event is enqueued in `sheet_sync_queue` for the retry
 *    worker (PR-3).
 */

import { google, sheets_v4 } from 'googleapis';
import { dbRun, dbGet, ensureSchema } from './db';

// ─── Configuration ────────────────────────────────────────────────────────

export const SHEET_SYNC_ENABLED =
  (process.env.SHEET_SYNC_ENABLED ?? 'false').toLowerCase() === 'true';

export const SHEET_ID = process.env.GOOGLE_SHEET_ID ?? '';

export const TAB = {
  members: process.env.GOOGLE_SHEET_TAB_MEMBERS ?? 'Members',
  passes: process.env.GOOGLE_SHEET_TAB_PASSES ?? 'Passes',
  attendance: process.env.GOOGLE_SHEET_TAB_ATTENDANCE ?? 'Attendance',
  sessions: process.env.GOOGLE_SHEET_TAB_SESSIONS ?? 'Sessions',
} as const;

export type TabName = keyof typeof TAB;

// ─── Column ranges owned by the DB (manager memo columns are excluded) ───
//
// Sheet layout (locked vs editable) — see docs/sheet-management.md
//   Members:    A..I locked, J..O manager-editable     → upsert writes A..I
//   Passes:     A..N locked, O manager-editable        → upsert writes A..N
//   Attendance: A..K locked (append-only)              → append writes A..K
//   Sessions:   A..M locked, N manager-editable        → upsert writes A..M
export const DB_RANGE: Record<TabName, { firstCol: string; lastCol: string }> = {
  members:    { firstCol: 'A', lastCol: 'I' },
  passes:     { firstCol: 'A', lastCol: 'N' },
  attendance: { firstCol: 'A', lastCol: 'K' },
  sessions:   { firstCol: 'A', lastCol: 'M' },
};

// ─── Header definitions (exposed for sheet-init.mjs) ──────────────────────

export const HEADERS: Record<TabName, string[]> = {
  members: [
    '회원ID', '이름', '연락처', '이메일', '권한', '가입일', '활성여부',
    '시스템메모', '최종동기화',
    // ↓ 매니저 편집 영역 (J~O)
    '매니저메모', '태그', '회원등급', '유입경로', '다음컨택예정일', '담당매니저',
  ],
  passes: [
    '수강권ID', '회원ID', '회원이름', '상품명', '카테고리',
    '총횟수', '잔여횟수', '시작일', '만료일', '발급일',
    '상태', '일시정지시각', '가격', '최종동기화',
    // ↓ 매니저 편집 영역 (O)
    '매니저메모',
  ],
  attendance: [
    '출석ID', '회원ID', '회원이름', '세션ID', '세션명',
    '세션일자', '시작시간', '체크인시각', '출석상태', '사용수강권ID',
    '동기화시각',
  ],
  sessions: [
    '세션ID', '세션명', '유형', '일자', '시작시간', '종료시간',
    '장소', '정원', '예약수', '대기수', '상태', '실내여부', '최종동기화',
    // ↓ 매니저 편집 영역 (N)
    '매니저코멘트',
  ],
};

// ─── Drop-down validation lists (exposed for sheet-init.mjs) ──────────────

export const DROPDOWNS = {
  membersTag:    ['VIP', '이탈주의', '신규', '휴면', '기타'],
  membersGrade:  ['일반', '우수', 'VIP', '블랙'],
  membersSource: ['지인추천', '인스타그램', '검색', '광고', '직접방문', '기타'],
};

// ─── Lazy Sheets client ───────────────────────────────────────────────────

let _client: sheets_v4.Sheets | null = null;
let _clientFailed = false;

export function getSheetsClient(): sheets_v4.Sheets | null {
  if (_clientFailed) return null;
  if (_client) return _client;
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      _clientFailed = true;
      return null;
    }
    // Accept either raw JSON or base64-encoded JSON.
    const json = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');
    const creds = JSON.parse(json);
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    _client = google.sheets({ version: 'v4', auth });
    return _client;
  } catch (err) {
    console.error('[sheets] failed to init Google Sheets client:', err);
    _clientFailed = true;
    return null;
  }
}

// ─── Internal: row helpers ────────────────────────────────────────────────

/**
 * Look up the 1-based row index of a record by its primary key (column A).
 * Returns null when the key is absent.
 */
async function findRowByKey(
  client: sheets_v4.Sheets,
  tab: string,
  key: string,
): Promise<number | null> {
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A:A`,
    majorDimension: 'COLUMNS',
  });
  const col = res.data.values?.[0] ?? [];
  // Row 1 is the header. Data starts at row 2.
  for (let i = 1; i < col.length; i++) {
    if (col[i] === key) return i + 1;
  }
  return null;
}

async function appendRow(
  client: sheets_v4.Sheets,
  tab: string,
  range: string,
  row: (string | number | boolean | null)[],
): Promise<void> {
  await client.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!${range}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

async function updateRange(
  client: sheets_v4.Sheets,
  tab: string,
  range: string,
  row: (string | number | boolean | null)[],
): Promise<void> {
  await client.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!${range}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

// ─── Public: upsert by primary key (A column) ─────────────────────────────

/**
 * Write `row` into the DB-owned column range of `tab`, keyed by `row[0]`.
 * Manager-editable columns (J..O / O / N) are never touched.
 *
 * NOTE: only call this from inside `safeSync()`.
 */
export async function upsertRow(tab: TabName, row: (string | number | boolean | null)[]): Promise<void> {
  if (!SHEET_SYNC_ENABLED) return;
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set');
  const client = getSheetsClient();
  if (!client) throw new Error('Google Sheets client unavailable');

  const tabName = TAB[tab];
  const { firstCol, lastCol } = DB_RANGE[tab];
  const key = String(row[0] ?? '');
  if (!key) throw new Error(`upsertRow: missing key (column A) for tab=${tab}`);

  const found = await findRowByKey(client, tabName, key);
  if (found) {
    await updateRange(client, tabName, `${firstCol}${found}:${lastCol}${found}`, row);
  } else {
    await appendRow(client, tabName, `${firstCol}:${lastCol}`, row);
  }
}

/**
 * Append-only sink (Attendance tab). Never updates existing rows.
 */
export async function appendOnlyRow(tab: TabName, row: (string | number | boolean | null)[]): Promise<void> {
  if (!SHEET_SYNC_ENABLED) return;
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set');
  const client = getSheetsClient();
  if (!client) throw new Error('Google Sheets client unavailable');

  const tabName = TAB[tab];
  const { firstCol, lastCol } = DB_RANGE[tab];
  await appendRow(client, tabName, `${firstCol}:${lastCol}`, row);
}

// ─── Public: safe wrapper (fire-and-forget + retry queue) ─────────────────

export type SyncOp = 'upsert' | 'append';

/**
 * Wrap a sync call so failures are queued instead of throwing into the
 * caller's request handler. Always returns void.
 */
export async function safeSync(
  tab: TabName,
  op: SyncOp,
  row: (string | number | boolean | null)[],
): Promise<void> {
  if (!SHEET_SYNC_ENABLED) return;
  try {
    if (op === 'append') {
      await appendOnlyRow(tab, row);
    } else {
      await upsertRow(tab, row);
    }
    await logSync(tab, op, row[0] ?? null, 'ok', null);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error(`[sheets] sync failed tab=${tab} op=${op}:`, msg);
    try {
      await enqueueRetry(tab, op, row, msg);
      await logSync(tab, op, row[0] ?? null, 'queued', msg);
    } catch (qerr) {
      // Last-resort: just log; never throw out of safeSync.
      console.error('[sheets] failed to enqueue retry:', qerr);
    }
  }
}

// ─── Retry queue ──────────────────────────────────────────────────────────

async function enqueueRetry(
  tab: TabName,
  op: SyncOp,
  row: (string | number | boolean | null)[],
  errorMessage: string,
): Promise<void> {
  await ensureSchema();
  await dbRun(
    `INSERT INTO sheet_sync_queue (tab, op, payload, error_message, attempts, created_at, last_attempt_at)
     VALUES ($1, $2, $3::jsonb, $4, 1, NOW(), NOW())`,
    [tab, op, JSON.stringify(row), errorMessage.slice(0, 500)],
  );
}

async function logSync(
  tab: TabName,
  op: SyncOp,
  key: string | number | boolean | null,
  status: 'ok' | 'queued' | 'retry-ok' | 'retry-failed',
  errorMessage: string | null,
): Promise<void> {
  try {
    await ensureSchema();
    await dbRun(
      `INSERT INTO sheet_sync_log (tab, op, row_key, status, error_message, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [tab, op, key === null || key === undefined ? null : String(key), status, errorMessage?.slice(0, 500) ?? null],
    );
  } catch {
    /* swallow — logging must never break the request */
  }
}

// ─── Health probe (for /api/health admin endpoint) ────────────────────────

export async function sheetsHealth(): Promise<{ enabled: boolean; reachable: boolean; sheetId: string | null; error?: string }> {
  if (!SHEET_SYNC_ENABLED) return { enabled: false, reachable: false, sheetId: null };
  if (!SHEET_ID) return { enabled: true, reachable: false, sheetId: null, error: 'GOOGLE_SHEET_ID not set' };
  const client = getSheetsClient();
  if (!client) return { enabled: true, reachable: false, sheetId: SHEET_ID, error: 'client init failed' };
  try {
    await client.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'spreadsheetId' });
    return { enabled: true, reachable: true, sheetId: SHEET_ID };
  } catch (err: any) {
    return { enabled: true, reachable: false, sheetId: SHEET_ID, error: err?.message ?? String(err) };
  }
}

// ─── Pending retry getter (used by the retry worker in PR-3) ──────────────

export interface PendingSyncEvent {
  id: number;
  tab: TabName;
  op: SyncOp;
  payload: (string | number | boolean | null)[];
  attempts: number;
}

export async function fetchPendingSyncEvents(limit = 50): Promise<PendingSyncEvent[]> {
  await ensureSchema();
  const rows = await (await import('./db')).dbAll<any>(
    `SELECT id, tab, op, payload, attempts
     FROM sheet_sync_queue
     WHERE attempts < 10
     ORDER BY id ASC
     LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    tab: r.tab as TabName,
    op: r.op as SyncOp,
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    attempts: r.attempts,
  }));
}

export async function markSyncEventDone(id: number): Promise<void> {
  await dbRun(`DELETE FROM sheet_sync_queue WHERE id = $1`, [id]);
}

export async function markSyncEventFailed(id: number, error: string): Promise<void> {
  await dbRun(
    `UPDATE sheet_sync_queue
       SET attempts = attempts + 1,
           last_attempt_at = NOW(),
           error_message = $2
     WHERE id = $1`,
    [id, error.slice(0, 500)],
  );
}
