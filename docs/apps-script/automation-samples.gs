/**
 * RunClub Sheet — Apps Script 자동화 샘플 모음.
 *
 * 시트 자체에는 영향이 없으며, 매니저가 원하는 자동화를 골라 활성화할 수
 * 있도록 패턴만 제공. 각 함수는 독립적이라 일부만 사용해도 무방합니다.
 *
 * 사용법:
 *   1. 시트 → 확장 프로그램 → Apps Script
 *   2. 본 파일 내용을 새 .gs 파일로 추가 (setup.gs와 별도 권장)
 *   3. 트리거 메뉴(시계 아이콘) → 사용할 함수에 시간 기반/이벤트 트리거 등록
 *
 * 트리거 권장:
 *   • notifyNewMembers       : 시트 변경 시(onChange) 또는 매시간
 *   • dailyAttendanceDigest  : 매일 아침 09:00 (시간 기반, daily)
 *   • weeklyChurnReport      : 매주 월요일 09:00 (시간 기반, weekly)
 *   • monthlyStatsSnapshot   : 매월 1일 09:00 (시간 기반, monthly)
 *   • upcomingContactReminder: 매일 아침 09:00 (시간 기반, daily)
 */

// ─── 공통 상수 ─────────────────────────────────────────────────────────

const NOTIFY_TO = 'manager@example.com';        // 알림 수신 이메일
const TZ = 'Asia/Seoul';

const COL_MEMBERS = {
  id: 1, name: 2, phone: 3, email: 4, role: 5, joinDate: 6, isActive: 7,
  systemMemo: 8, syncedAt: 9,
  managerMemo: 10, tag: 11, grade: 12, source: 13, nextContact: 14, manager: 15,
};

const COL_PASSES = {
  id: 1, memberId: 2, memberName: 3, productName: 4, category: 5,
  totalCount: 6, remainingCount: 7, startDate: 8, expiryDate: 9, issuedDate: 10,
  status: 11, pausedAt: 12, price: 13, syncedAt: 14, managerMemo: 15,
};

const COL_ATTENDANCE = {
  id: 1, memberId: 2, memberName: 3, sessionId: 4, sessionName: 5,
  sessionDate: 6, sessionStartTime: 7, checkedInAt: 8, status: 9,
  passId: 10, syncedAt: 11,
};

// ─── 1. 신규 가입자 알림 ────────────────────────────────────────────────
//
// 동작: Members 시트에서 가입일이 어제~오늘인 행을 골라 1통의 메일로 묶어서
// 매니저에게 보냄. 매시간 또는 onChange 트리거 권장.

function notifyNewMembers() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Members');
  const data = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const yesterday = Utilities.formatDate(
    new Date(Date.now() - 86400000), TZ, 'yyyy-MM-dd'
  );

  const fresh = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const joinDate = String(row[COL_MEMBERS.joinDate - 1] ?? '');
    if (joinDate === today || joinDate === yesterday) {
      fresh.push({
        name: row[COL_MEMBERS.name - 1],
        phone: row[COL_MEMBERS.phone - 1],
        email: row[COL_MEMBERS.email - 1],
        joinDate,
        source: row[COL_MEMBERS.source - 1] || '(미입력)',
      });
    }
  }
  if (fresh.length === 0) return;

  const body = fresh.map((m) =>
    `• ${m.name} (${m.phone}) — ${m.joinDate} 가입 / 유입: ${m.source}`
  ).join('\n');

  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: `[RunClub] 신규 가입 ${fresh.length}건`,
    body: `최근 24시간 내 가입자 목록입니다.\n\n${body}\n\n— 자동 발송`,
  });
}

// ─── 2. 일일 출석 다이제스트 ───────────────────────────────────────────
//
// 동작: 어제 출석 처리된 회원 수, 노쇼, 취소 건수를 집계하여 매일 오전 메일.

function dailyAttendanceDigest() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Attendance');
  const data = sheet.getDataRange().getValues();
  const target = Utilities.formatDate(
    new Date(Date.now() - 86400000), TZ, 'yyyy-MM-dd'
  );

  let attended = 0, cancelled = 0, noshow = 0;
  const attendedNames = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const sessionDate = String(row[COL_ATTENDANCE.sessionDate - 1] ?? '');
    if (sessionDate !== target) continue;
    const status = row[COL_ATTENDANCE.status - 1];
    if (status === 'attended') {
      attended++;
      attendedNames.push(row[COL_ATTENDANCE.memberName - 1]);
    } else if (status === 'cancelled') cancelled++;
    else if (status === 'noshow') noshow++;
  }

  const body = [
    `일자: ${target}`,
    `출석 ${attended}명 / 취소 ${cancelled}건 / 노쇼 ${noshow}건`,
    '',
    `출석자: ${attendedNames.join(', ') || '(없음)'}`,
  ].join('\n');

  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: `[RunClub] ${target} 출석 요약`,
    body,
  });
}

// ─── 3. 주간 이탈 위험 리포트 ──────────────────────────────────────────
//
// 동작: 활성 회원 중 최근 30일 출석이 0회인 회원을 찾아서 매니저에게 보고.
// 매니저는 시트 K(태그) 컬럼에서 "이탈주의" 라벨을 손쉽게 토글 가능.

function weeklyChurnReport() {
  const ss = SpreadsheetApp.getActive();
  const members = ss.getSheetByName('Members').getDataRange().getValues();
  const attendance = ss.getSheetByName('Attendance').getDataRange().getValues();

  const cutoff = Utilities.formatDate(
    new Date(Date.now() - 30 * 86400000), TZ, 'yyyy-MM-dd'
  );

  const attendedSet = new Set();
  for (let i = 1; i < attendance.length; i++) {
    const row = attendance[i];
    const date = String(row[COL_ATTENDANCE.sessionDate - 1] ?? '');
    const status = row[COL_ATTENDANCE.status - 1];
    if (status === 'attended' && date >= cutoff) {
      attendedSet.add(row[COL_ATTENDANCE.memberId - 1]);
    }
  }

  const churnRisks = [];
  for (let i = 1; i < members.length; i++) {
    const row = members[i];
    const isActive = row[COL_MEMBERS.isActive - 1];
    if (!isActive) continue;
    const id = row[COL_MEMBERS.id - 1];
    if (!attendedSet.has(id)) {
      churnRisks.push({
        name: row[COL_MEMBERS.name - 1],
        phone: row[COL_MEMBERS.phone - 1],
        joinDate: row[COL_MEMBERS.joinDate - 1],
        manager: row[COL_MEMBERS.manager - 1] || '(미지정)',
      });
    }
  }

  if (churnRisks.length === 0) {
    MailApp.sendEmail({
      to: NOTIFY_TO,
      subject: '[RunClub] 주간 이탈 위험 리포트 — 해당 없음',
      body: '최근 30일간 모든 활성 회원이 1회 이상 출석했습니다. 👏',
    });
    return;
  }

  const body = churnRisks
    .map((m) => `• ${m.name} (${m.phone}) / 가입 ${m.joinDate} / 담당 ${m.manager}`)
    .join('\n');

  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: `[RunClub] 이탈 위험 ${churnRisks.length}명`,
    body: `최근 30일간 출석 0회인 활성 회원입니다.\n\n${body}\n\n시트 K열에 "이탈주의" 태그를 적용하면 다음 주에도 추적할 수 있습니다.\n\n— 자동 발송`,
  });
}

// ─── 4. 월간 통계 스냅샷 ───────────────────────────────────────────────
//
// 동작: 매월 1일에 새 시트 'Snapshot_YYYY-MM' 생성 → 활성 회원 수, 신규 가입,
// 출석 건수, 수강권 발급/환불 등을 한 줄로 기록. 누적 트렌드 분석용.

function monthlyStatsSnapshot() {
  const ss = SpreadsheetApp.getActive();
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const stamp = Utilities.formatDate(lastMonth, TZ, 'yyyy-MM');
  const sheetName = `Snapshot_${stamp}`;

  if (ss.getSheetByName(sheetName)) return; // 이미 있음

  const monthStart = Utilities.formatDate(lastMonth, TZ, 'yyyy-MM-dd');
  const monthEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
  const monthEnd = Utilities.formatDate(monthEndDate, TZ, 'yyyy-MM-dd');

  const members = ss.getSheetByName('Members').getDataRange().getValues();
  const passes = ss.getSheetByName('Passes').getDataRange().getValues();
  const attendance = ss.getSheetByName('Attendance').getDataRange().getValues();

  let activeMembers = 0, newMembers = 0;
  for (let i = 1; i < members.length; i++) {
    const row = members[i];
    if (row[COL_MEMBERS.isActive - 1]) activeMembers++;
    const join = String(row[COL_MEMBERS.joinDate - 1] ?? '');
    if (join >= monthStart && join <= monthEnd) newMembers++;
  }

  let issuedPasses = 0, refundedPasses = 0;
  for (let i = 1; i < passes.length; i++) {
    const row = passes[i];
    const issued = String(row[COL_PASSES.issuedDate - 1] ?? '');
    if (issued >= monthStart && issued <= monthEnd) issuedPasses++;
    if (row[COL_PASSES.status - 1] === 'refunded' &&
        issued >= monthStart && issued <= monthEnd) refundedPasses++;
  }

  let attendedCount = 0;
  for (let i = 1; i < attendance.length; i++) {
    const row = attendance[i];
    const date = String(row[COL_ATTENDANCE.sessionDate - 1] ?? '');
    if (row[COL_ATTENDANCE.status - 1] === 'attended' &&
        date >= monthStart && date <= monthEnd) attendedCount++;
  }

  const sheet = ss.insertSheet(sheetName);
  sheet.getRange(1, 1, 2, 6).setValues([
    ['기간', '활성회원', '신규가입', '수강권발급', '환불', '출석건수'],
    [`${monthStart} ~ ${monthEnd}`, activeMembers, newMembers, issuedPasses, refundedPasses, attendedCount],
  ]);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#eeeeee');
}

// ─── 5. 다음 컨택 예정일 알림 ───────────────────────────────────────────
//
// 동작: Members 시트 N열(다음 컨택 예정일)이 오늘이거나 이미 지난 회원을
// 모아서 담당 매니저별로 메일 발송. 매니저메모(J)도 함께 포함.

function upcomingContactReminder() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Members');
  const data = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');

  const due = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[COL_MEMBERS.isActive - 1]) continue;
    const next = row[COL_MEMBERS.nextContact - 1];
    if (!next) continue;
    const nextStr = next instanceof Date
      ? Utilities.formatDate(next, TZ, 'yyyy-MM-dd')
      : String(next);
    if (nextStr <= today) {
      due.push({
        name: row[COL_MEMBERS.name - 1],
        phone: row[COL_MEMBERS.phone - 1],
        memo: row[COL_MEMBERS.managerMemo - 1] || '',
        nextContact: nextStr,
        manager: row[COL_MEMBERS.manager - 1] || '(미지정)',
      });
    }
  }
  if (due.length === 0) return;

  const body = due
    .map((m) => `• [${m.nextContact}] ${m.name} (${m.phone}) / 담당 ${m.manager} — ${m.memo}`)
    .join('\n');

  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: `[RunClub] 컨택 예정 ${due.length}건`,
    body: `오늘 또는 지난 컨택 예정 회원입니다.\n\n${body}\n\n— 자동 발송`,
  });
}
