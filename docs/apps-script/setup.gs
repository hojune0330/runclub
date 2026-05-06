/**
 * RunClub Sheet — Apps Script setup helper.
 *
 * 언제 쓰는가:
 *   • 운영자가 시트를 직접 새로 만들었거나 보호/드롭다운이 깨졌을 때, 코드
 *     푸시 없이 시트 안에서 한 번만 실행하여 보호 범위·드롭다운·헤더 서식을
 *     일괄 재적용하기 위함.
 *   • 평상시 시트 생성은 `npm run sheet:init` (scripts/sheet-init.mjs)로
 *     처리하므로 이 스크립트는 보조 수단.
 *
 * 사용 방법:
 *   1. 시트 → 확장 프로그램 → Apps Script
 *   2. 본 파일 내용을 통째로 붙여넣기
 *   3. 상단의 SERVICE_ACCOUNT_EMAIL 값을 자신의 Service Account 이메일로 교체
 *   4. 메뉴: 함수 선택 → applyAll → 실행. 권한 동의 화면은 [허용].
 *
 * 안전성:
 *   • 모든 함수는 멱등(여러 번 실행해도 동일 결과). 기존 보호 범위/드롭다운이
 *     있으면 덮어쓰지 않고 추가하지 않음.
 *   • 매니저 메모 컬럼(Members J~O / Passes O / Sessions N)은 절대 잠그지
 *     않음 — 매니저가 수기 입력하는 영역.
 */

// ─── 설정 ──────────────────────────────────────────────────────────────
//
// 본인 Service Account 이메일로 교체. (Google Cloud Console → IAM →
// 서비스 계정 → 본 서비스 계정의 client_email)
const SERVICE_ACCOUNT_EMAIL = 'runclub-sync@your-project.iam.gserviceaccount.com';

const TAB = {
  members:    'Members',
  passes:     'Passes',
  attendance: 'Attendance',
  sessions:   'Sessions',
};

const HEADERS = {
  Members: [
    '회원ID', '이름', '연락처', '이메일', '권한', '가입일', '활성여부',
    '시스템메모', '최종동기화',
    '매니저메모', '태그', '회원등급', '유입경로', '다음컨택예정일', '담당매니저',
  ],
  Passes: [
    '수강권ID', '회원ID', '회원이름', '상품명', '카테고리',
    '총횟수', '잔여횟수', '시작일', '만료일', '발급일',
    '상태', '일시정지시각', '가격', '최종동기화',
    '매니저메모',
  ],
  Attendance: [
    '출석ID', '회원ID', '회원이름', '세션ID', '세션명',
    '세션일자', '시작시간', '체크인시각', '출석상태', '사용수강권ID',
    '동기화시각',
  ],
  Sessions: [
    '세션ID', '세션명', '유형', '일자', '시작시간', '종료시간',
    '장소', '정원', '예약수', '대기수', '상태', '실내여부', '최종동기화',
    '매니저코멘트',
  ],
};

// DB가 소유하는 컬럼 수 (= 잠금 끝 열, A부터 N번째까지 잠금)
const DB_COL_COUNT = {
  Members:    9,   // A..I
  Passes:     14,  // A..N
  Attendance: 11,  // A..K (전체 잠금, append-only)
  Sessions:   13,  // A..M
};

const DROPDOWNS = {
  membersTag:    ['VIP', '이탈주의', '신규', '휴면', '기타'],
  membersGrade:  ['일반', '우수', 'VIP', '블랙'],
  membersSource: ['지인추천', '인스타그램', '검색', '광고', '직접방문', '기타'],
};

// ─── 메인 ──────────────────────────────────────────────────────────────

function applyAll() {
  ensureTabs_();
  writeHeaders_();
  styleHeaders_();
  applyDropdowns_();
  applyProtections_();
  SpreadsheetApp.getActive().toast('RunClub 시트 초기화 완료', '✓', 5);
}

// ─── 탭 생성 ───────────────────────────────────────────────────────────

function ensureTabs_() {
  const ss = SpreadsheetApp.getActive();
  Object.values(TAB).forEach((title) => {
    if (!ss.getSheetByName(title)) ss.insertSheet(title);
  });
}

// ─── 헤더 ──────────────────────────────────────────────────────────────

function writeHeaders_() {
  const ss = SpreadsheetApp.getActive();
  Object.entries(HEADERS).forEach(([title, headers]) => {
    const sheet = ss.getSheetByName(title);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  });
}

function styleHeaders_() {
  const ss = SpreadsheetApp.getActive();
  Object.entries(HEADERS).forEach(([title, headers]) => {
    const sheet = ss.getSheetByName(title);
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight('bold');
    range.setBackground('#eeeeee');
    range.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  });
}

// ─── 드롭다운 (Members K/L/M) ──────────────────────────────────────────

function applyDropdowns_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(TAB.members);
  const lastRow = Math.max(sheet.getMaxRows() - 1, 1);

  // K = 11번째 컬럼 (태그)
  const tagRange = sheet.getRange(2, 11, lastRow, 1);
  tagRange.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(DROPDOWNS.membersTag, true)
      .setAllowInvalid(false)
      .build()
  );

  // L = 12번째 컬럼 (등급)
  const gradeRange = sheet.getRange(2, 12, lastRow, 1);
  gradeRange.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(DROPDOWNS.membersGrade, true)
      .setAllowInvalid(false)
      .build()
  );

  // M = 13번째 컬럼 (유입경로)
  const sourceRange = sheet.getRange(2, 13, lastRow, 1);
  sourceRange.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(DROPDOWNS.membersSource, true)
      .setAllowInvalid(false)
      .build()
  );
}

// ─── 보호 범위 ─────────────────────────────────────────────────────────

function applyProtections_() {
  const ss = SpreadsheetApp.getActive();
  Object.entries(DB_COL_COUNT).forEach(([title, dbCols]) => {
    const sheet = ss.getSheetByName(title);
    const lastRow = Math.max(sheet.getMaxRows() - 1, 1);
    const range = sheet.getRange(2, 1, lastRow, dbCols);

    // 같은 description의 보호가 이미 있으면 스킵 (멱등)
    const existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    const desc = `DB-owned (1~${dbCols}열). 손으로 수정하지 마세요.`;
    if (existing.some((p) => p.getDescription() === desc)) return;

    const protection = range.protect();
    protection.setDescription(desc);

    // Service Account만 편집 가능, 나머지(매니저)는 J~O / O / N 열만 편집 가능
    protection.removeEditors(protection.getEditors());
    if (SERVICE_ACCOUNT_EMAIL && SERVICE_ACCOUNT_EMAIL.indexOf('@') > 0) {
      protection.addEditor(SERVICE_ACCOUNT_EMAIL);
    }
    // 본인은 편집자로 유지 (Apps Script 실행자)
    protection.addEditor(Session.getEffectiveUser());
    // warning 모드가 아닌 strict 모드
    protection.setWarningOnly(false);
  });
}

// ─── 보조: 보호 전부 해제 (긴급 복구용) ──────────────────────────────

function unlockAll() {
  const ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach((sheet) => {
    const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    protections.forEach((p) => p.remove());
  });
  SpreadsheetApp.getActive().toast('모든 보호가 해제되었습니다', '⚠', 5);
}

// ─── 메뉴 등록 (시트 열릴 때 자동) ─────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('RunClub 관리')
    .addItem('초기화 (탭/헤더/드롭다운/보호)', 'applyAll')
    .addSeparator()
    .addItem('보호 모두 해제 (긴급)', 'unlockAll')
    .addToUi();
}
