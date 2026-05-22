#!/usr/bin/env node
/**
 * One-shot Google Sheet initializer.
 *
 * Usage:
 *   GOOGLE_SERVICE_ACCOUNT_JSON='...'  GOOGLE_SHEET_ID='...'  \
 *     node scripts/sheet-init.mjs
 *
 * What it does (idempotent — safe to re-run):
 *   1. Creates the tabs if missing: Members / Passes / Attendance / Sessions / AdminLog / PassProducts
 *   2. Writes header rows (row 1) with bold + frozen
 *   3. Adds drop-down validation on Members columns K (태그), L (등급), M (유입경로)
 *   4. Locks the DB-owned column ranges so only the Service Account can edit
 *      them; manager memo columns stay free
 *
 * The script only talks to the Google Sheets API, no DB access required.
 */

import { google } from 'googleapis';

// ─── Config (mirrors src/lib/sheets.ts) ──────────────────────────────────

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const RAW_CREDS = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!SHEET_ID) {
  console.error('GOOGLE_SHEET_ID is required');
  process.exit(1);
}
if (!RAW_CREDS) {
  console.error('GOOGLE_SERVICE_ACCOUNT_JSON is required');
  process.exit(1);
}

const TABS = {
  members:    process.env.GOOGLE_SHEET_TAB_MEMBERS    ?? 'Members',
  passes:     process.env.GOOGLE_SHEET_TAB_PASSES     ?? 'Passes',
  attendance: process.env.GOOGLE_SHEET_TAB_ATTENDANCE ?? 'Attendance',
  sessions:   process.env.GOOGLE_SHEET_TAB_SESSIONS   ?? 'Sessions',
  adminLog:   process.env.GOOGLE_SHEET_TAB_ADMIN_LOG  ?? 'AdminLog',
  passProducts: process.env.GOOGLE_SHEET_TAB_PASS_PRODUCTS ?? 'PassProducts',
};

const HEADERS = {
  members: [
    '회원ID', '이름', '연락처', '이메일', '권한', '가입일', '활성여부',
    '시스템메모', '최종동기화',
    '매니저메모', '태그', '회원등급', '유입경로', '다음컨택예정일', '담당매니저',
  ],
  passes: [
    '수강권ID', '회원ID', '회원이름', '상품명', '카테고리',
    '총횟수', '잔여횟수', '시작일', '만료일', '발급일',
    '상태', '일시정지시각', '가격', '결제상태', '결제수단',
    '실수령액', '결제시각', '거래번호', '할인금액', '할인사유',
    '최종동기화', '매니저메모',
  ],
  attendance: [
    '출석ID', '회원ID', '회원이름', '세션ID', '세션명',
    '세션일자', '시작시간', '체크인시각', '출석상태', '사용수강권ID',
    '동기화시각',
  ],
  sessions: [
    '세션ID', '세션명', '유형', '일자', '시작시간', '종료시간',
    '장소', '정원', '예약수', '대기수', '상태', '실내여부', '최종동기화',
    '매니저코멘트',
  ],
  adminLog: [
    '시각', '관리자ID', '관리자이름', '행동', '대상유형',
    '대상ID', '대상이름', '변경요약', 'IP',
  ],
  passProducts: [
    '상품ID', '상품명', '분류', '적용세션', '총횟수', '기간(일)',
    '정가', '판매가', '추천', '판매중', '정렬', '최종동기화',
    '매니저메모', '태그', '할인코드', '내부분류',
  ],
};

// DB-owned column count (1-based last column index that the server overwrites)
const DB_COL_COUNT = {
  members:    9,   // A..I
  passes:     21,  // A..U
  attendance: 11,  // A..K  (append-only, fully owned)
  sessions:   13,  // A..M
  adminLog:   9,   // A..I  (append-only audit log)
  passProducts: 12, // A..L
};

const DROPDOWNS = {
  membersTag:    ['VIP', '이탈주의', '신규', '휴면', '기타'],
  membersGrade:  ['일반', '우수', 'VIP', '블랙'],
  membersSource: ['지인추천', '인스타그램', '검색', '광고', '직접방문', '기타'],
};

// ─── Auth ────────────────────────────────────────────────────────────────

function loadCreds() {
  const raw = RAW_CREDS.trim();
  const json = raw.startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(json);
}

function buildClient() {
  const creds = loadCreds();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return { sheets: google.sheets({ version: 'v4', auth }), creds };
}

// ─── Steps ───────────────────────────────────────────────────────────────

async function getMeta(sheets) {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title,gridProperties))',
  });
  return res.data.sheets ?? [];
}

async function ensureTabs(sheets) {
  const existing = await getMeta(sheets);
  const existingTitles = new Set(existing.map((s) => s.properties.title));
  const requests = [];
  for (const title of Object.values(TABS)) {
    if (!existingTitles.has(title)) {
      requests.push({ addSheet: { properties: { title } } });
    }
  }
  if (requests.length) {
    console.log(`[init] creating ${requests.length} tab(s):`, requests.map((r) => r.addSheet.properties.title).join(', '));
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });
  } else {
    console.log(`[init] all ${Object.keys(TABS).length} tabs already exist`);
  }
  // Re-fetch with new sheetIds
  return await getMeta(sheets);
}

async function writeHeaders(sheets) {
  const data = [];
  for (const [key, headers] of Object.entries(HEADERS)) {
    data.push({
      range: `${TABS[key]}!A1`,
      values: [headers],
    });
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
  console.log('[init] headers written');
}

function findSheetId(meta, title) {
  const s = meta.find((x) => x.properties.title === title);
  if (!s) throw new Error(`tab not found: ${title}`);
  return s.properties.sheetId;
}

async function styleHeaders(sheets, meta) {
  const requests = [];
  for (const [key, headers] of Object.entries(HEADERS)) {
    const sheetId = findSheetId(meta, TABS[key]);
    // Bold + light grey background on row 1
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
      },
    });
    // Freeze row 1
    requests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    });
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  });
  console.log('[init] header styling + freeze applied');
}

async function applyDropdowns(sheets, meta) {
  const sheetId = findSheetId(meta, TABS.members);
  // Members columns: K=10, L=11, M=12 (0-based)
  const COL = { tag: 10, grade: 11, source: 12 };
  const oneOf = (values) => ({
    condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) },
    showCustomUi: true,
    strict: true,
  });
  const requests = [
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: COL.tag, endColumnIndex: COL.tag + 1 },
        rule: oneOf(DROPDOWNS.membersTag),
      },
    },
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: COL.grade, endColumnIndex: COL.grade + 1 },
        rule: oneOf(DROPDOWNS.membersGrade),
      },
    },
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: COL.source, endColumnIndex: COL.source + 1 },
        rule: oneOf(DROPDOWNS.membersSource),
      },
    },
  ];
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  });
  console.log('[init] drop-downs applied to Members K/L/M');
}

async function applyProtections(sheets, meta, creds) {
  // Lock the DB-owned column range of each tab so that only the Service
  // Account itself can edit those cells. The manager-editable columns
  // (Members J..O, Passes V, Sessions N, PassProducts M..P) stay open for everyone with
  // edit access on the spreadsheet.
  //
  // We split Members into two protected ranges so that column J (매니저메모)
  // sits between the locked range (A..I) and the editable range (K..O).
  // Actually J should stay editable too, so the protected range is just A..I.
  const requests = [];
  const editors = { users: [creds.client_email] };

  // Members: protect A..I (cols 0..9 exclusive)
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: {
          sheetId: findSheetId(meta, TABS.members),
          startRowIndex: 1, startColumnIndex: 0, endColumnIndex: DB_COL_COUNT.members,
        },
        description: 'DB-owned (A~I). Do not edit by hand.',
        warningOnly: false,
        editors,
      },
    },
  });
  // Passes: protect A..U
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: {
          sheetId: findSheetId(meta, TABS.passes),
          startRowIndex: 1, startColumnIndex: 0, endColumnIndex: DB_COL_COUNT.passes,
        },
        description: 'DB-owned (A~U). Do not edit by hand.',
        warningOnly: false,
        editors,
      },
    },
  });
  // Attendance: protect entire data area (append-only, no edits)
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: {
          sheetId: findSheetId(meta, TABS.attendance),
          startRowIndex: 1, startColumnIndex: 0, endColumnIndex: DB_COL_COUNT.attendance,
        },
        description: 'Append-only attendance log. Do not edit by hand.',
        warningOnly: false,
        editors,
      },
    },
  });
  // Sessions: protect A..M
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: {
          sheetId: findSheetId(meta, TABS.sessions),
          startRowIndex: 1, startColumnIndex: 0, endColumnIndex: DB_COL_COUNT.sessions,
        },
        description: 'DB-owned (A~M). Do not edit by hand.',
        warningOnly: false,
        editors,
      },
    },
  });
  // AdminLog: protect entire data area (append-only audit log)
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: {
          sheetId: findSheetId(meta, TABS.adminLog),
          startRowIndex: 1, startColumnIndex: 0, endColumnIndex: DB_COL_COUNT.adminLog,
        },
        description: 'Append-only admin audit log. Do not edit by hand.',
        warningOnly: false,
        editors,
      },
    },
  });
  // PassProducts: protect A..L
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: {
          sheetId: findSheetId(meta, TABS.passProducts),
          startRowIndex: 1, startColumnIndex: 0, endColumnIndex: DB_COL_COUNT.passProducts,
        },
        description: 'DB-owned (A~L). Do not edit by hand.',
        warningOnly: false,
        editors,
      },
    },
  });

  // Idempotency: if protections already exist on these ranges, skip silently.
  // The Sheets API returns 400 'duplicate' — we tolerate it.
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });
    console.log('[init] protections applied (6 ranges)');
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (/already|duplicate/i.test(msg)) {
      console.log('[init] protections already in place (skipping)');
    } else {
      throw err;
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[init] sheet=${SHEET_ID}`);
  const { sheets, creds } = buildClient();

  let meta = await ensureTabs(sheets);
  await writeHeaders(sheets);
  meta = await getMeta(sheets); // refresh after addSheet
  await styleHeaders(sheets, meta);
  await applyDropdowns(sheets, meta);
  await applyProtections(sheets, meta, creds);

  console.log('[init] ✓ done');
  console.log('');
  console.log('Next step: invite your manager(s) as Editors via the sheet UI.');
  console.log(`Service account email (already an editor): ${creds.client_email}`);
}

main().catch((err) => {
  console.error('[init] FAILED:', err?.message ?? err);
  process.exit(1);
});
