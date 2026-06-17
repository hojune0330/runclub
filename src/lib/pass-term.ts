/**
 * 이용권(수강권) 기간 계산 규칙 — 단일 진실 공급원(Single Source of Truth).
 *
 * 이 모듈은 "결제일/이용권 개월수 → 이용시작·이용종료" 를 계산하는 규칙을
 * 한 곳에 모은다. 관리자 직접 지급(pass_grant_records), 시트 일괄 import,
 * 정산 화면 어디서든 같은 함수를 써서 종료일이 화면마다 어긋나지 않게 한다.
 *
 * ⚠️ 클라이언트/서버/스크립트 어디서든 import 되므로 순수 함수만 둔다.
 *    (pg/db 등 서버 전용 모듈 import 금지)
 *
 * ────────────────────────────────────────────────────────────
 * 확정 규칙 (오너 확정 — 2026 봄 시즌 장부 기준)
 * ────────────────────────────────────────────────────────────
 *  ① 4월 결제자 = "개강 대기 특수 케이스"
 *       - 개강일(5/6)에 다 같이 시작하기로 한 회원들.
 *       - 이용시작 = 개강일(5/6) 고정.
 *       - 이용종료 = 5/6 + (개월수 × 30일).
 *  ② 5월 이후 결제자 = "안내문(앞으로의 판매) 규칙"
 *       - 결제일 = 이용시작.
 *       - 이용종료 = 이용시작 + (개월수 × 30일).
 *
 *  "1개월 = +30일" 로 고정한다(달력 월말 보정 없음). 운영 장부가 이미
 *  30일 기준으로 작성돼 있어 그대로 맞춘다. (예: 5/6 + 30일 = 6/5)
 */

/** 개강일(개강 대기 특수 케이스의 고정 시작일). YYYY-MM-DD. */
export const OPENING_DATE_2026 = '2026-05-06';

/** "1개월" 을 며칠로 계산할지. 운영 장부와 동일하게 30일 고정. */
export const DAYS_PER_MONTH = 30;

/** YYYY-MM-DD 문자열 → UTC Date (시간대 흔들림 방지). */
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Date → YYYY-MM-DD (UTC 기준). */
function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** ISO 날짜에 일수를 더한 ISO 날짜를 반환. */
export function addDaysISO(iso: string, days: number): string {
  const base = parseISODate(iso);
  base.setUTCDate(base.getUTCDate() + days);
  return toISODate(base);
}

/** 개월수 → 만료까지의 일수( = 개월수 × 30 ). */
export function monthsToDays(months: number): number {
  return Math.round(months * DAYS_PER_MONTH);
}

/** "4/1", "4/8" 같은 M/D 표기를 특정 연도의 YYYY-MM-DD 로 변환. */
export function normalizeShortDate(short: string, year: number): string {
  const trimmed = short.trim();
  // 이미 ISO 면 그대로 통과
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})$/);
  if (!m) throw new Error(`날짜 형식을 인식할 수 없습니다: "${short}"`);
  const month = String(Number(m[1])).padStart(2, '0');
  const day = String(Number(m[2])).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 결제일이 4월(개강 대기 특수 케이스)인지 판정. */
export function isOpeningWaitlistPayment(paymentDateISO: string, openingDateISO = OPENING_DATE_2026): boolean {
  const pay = parseISODate(paymentDateISO);
  const opening = parseISODate(openingDateISO);
  // 같은 해의 4월(=개강일이 속한 달의 직전 달 이전) 결제는 개강 대기로 본다.
  // 운영 규칙상 "개강일(5/6)보다 앞서 결제했고, 결제 월이 개강 월보다 이른" 회원.
  return pay.getUTCFullYear() === opening.getUTCFullYear() && pay.getUTCMonth() < opening.getUTCMonth();
}

export interface PassTermInput {
  /** 결제일 (YYYY-MM-DD 또는 "M/D"). */
  paymentDate: string;
  /** 이용권 개월수 (1, 2, 3 …). */
  months: number;
  /** "M/D" 표기를 보정할 기준 연도(기본 2026). */
  year?: number;
  /** 개강일(개강 대기 케이스의 고정 시작일). 기본 2026-05-06. */
  openingDate?: string;
}

export interface PassTerm {
  /** 이용시작 (YYYY-MM-DD). */
  startDate: string;
  /** 이용종료 (YYYY-MM-DD). */
  expiryDate: string;
  /** 결제일 (YYYY-MM-DD, 정규화됨). */
  paymentDate: string;
  /** 4월 개강 대기 특수 케이스로 계산됐는지. */
  openingWaitlist: boolean;
  /** 적용된 일수( = months × 30 ). */
  durationDays: number;
}

/**
 * 확정 규칙에 따라 이용시작/이용종료를 계산한다.
 *
 *  - 4월 결제(개강 대기): 시작 = 개강일(5/6) 고정, 종료 = 5/6 + months×30.
 *  - 5월+ 결제: 시작 = 결제일, 종료 = 결제일 + months×30.
 */
export function computePassTerm(input: PassTermInput): PassTerm {
  const year = input.year ?? 2026;
  const openingDate = input.openingDate ?? OPENING_DATE_2026;
  const paymentDate = normalizeShortDate(input.paymentDate, year);
  const durationDays = monthsToDays(input.months);
  const openingWaitlist = isOpeningWaitlistPayment(paymentDate, openingDate);

  const startDate = openingWaitlist ? openingDate : paymentDate;
  const expiryDate = addDaysISO(startDate, durationDays);

  return { startDate, expiryDate, paymentDate, openingWaitlist, durationDays };
}
