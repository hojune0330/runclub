/**
 * 2026 봄 시즌 유료 회원/이용권 장부 (오너 확정 데이터, 40건 · 행별 합계 690,000원).
 * 원 장부 하단의 760,000원 표기는 합계 오기로 추정되며, 검증 메모는 docs/spring-2026-passes.md 에 둔다.
 *
 * 이 파일은 "운영 장부의 정본(canonical) 스냅샷"이다. 시작/종료일은 직접
 * 손으로 적지 않고 computePassTerm() 규칙으로 생성·검증한다. (raw 입력은
 * 결제일·개월수·금액·이름뿐 — 나머지 파생값은 코드가 책임진다)
 *
 *  규칙 요약(자세한 내용은 src/lib/pass-term.ts):
 *   - 4월 결제 = 개강 대기 → 이용시작 5/6 고정, 종료 = 5/6 + 개월×30일
 *   - 5월+ 결제 = 결제일 = 시작, 종료 = 결제일 + 개월×30일
 *
 *  ⚠️ memberId 는 아직 비어 있다. 이 장부의 이름을 웹 DB members 와
 *     매칭한 뒤 이용권(member_passes)을 발급하는 것은 별도 import
 *     스크립트(scripts/import-spring-2026-passes.mjs)의 책임이다.
 */

import { computePassTerm, type PassTerm } from './pass-term';

/** 개월수 → 카탈로그 상품 id 매핑(런클럽 멤버십 = 월 10,000원, pp_001). */
export const SPRING_PASS_PRODUCT_ID = 'pp_001';

export interface SpringPassRecordRaw {
  /** 회원 이름 (동명이인/재결제 가능 — phone 으로 최종 식별 권장). */
  name: string;
  /** 결제일 ("M/D"). */
  paymentDate: string;
  /** 이용권 개월수. */
  months: number;
  /** 결제 금액(원). */
  amount: number;
  /** 비고(원 장부 표기). */
  note?: string;
}

/** 봄 시즌 기준 연도. */
export const SPRING_YEAR = 2026;

/**
 * 원 장부 입력(40건). 시작/종료일은 일부러 적지 않는다 — computePassTerm 으로
 * 생성하므로 규칙과 데이터가 절대 어긋날 수 없다.
 */
export const SPRING_2026_RAW: SpringPassRecordRaw[] = [
  { name: '한혜지', paymentDate: '4/1',  months: 1, amount: 10000 },
  { name: '윤용기', paymentDate: '4/1',  months: 1, amount: 10000 },
  { name: '김은영', paymentDate: '4/1',  months: 1, amount: 10000 },
  { name: '류진희', paymentDate: '4/1',  months: 1, amount: 10000 },
  { name: '김준택', paymentDate: '4/8',  months: 1, amount: 10000 },
  { name: '임안나', paymentDate: '4/8',  months: 1, amount: 10000 },
  { name: '김화경', paymentDate: '4/8',  months: 1, amount: 10000 },
  { name: '유명훈', paymentDate: '4/10', months: 1, amount: 10000 },
  { name: '노혜윤', paymentDate: '4/17', months: 1, amount: 10000 },
  { name: '김명성', paymentDate: '4/22', months: 1, amount: 10000 },
  { name: '유명훈', paymentDate: '4/22', months: 2, amount: 20000 },
  { name: '최윤희', paymentDate: '4/24', months: 1, amount: 10000 },
  { name: '임주혁', paymentDate: '4/28', months: 1, amount: 10000 },
  { name: '권준욱', paymentDate: '4/30', months: 3, amount: 30000 },
  { name: '임송이', paymentDate: '5/6',  months: 1, amount: 10000 },
  { name: '조수연', paymentDate: '5/13', months: 1, amount: 10000 },
  { name: '조정호', paymentDate: '5/23', months: 1, amount: 10000 },
  { name: '김도연', paymentDate: '5/24', months: 3, amount: 30000 },
  { name: '오세욱', paymentDate: '5/24', months: 3, amount: 30000 },
  { name: '정보민', paymentDate: '5/24', months: 3, amount: 30000 },
  { name: '이영훈', paymentDate: '5/24', months: 3, amount: 30000 },
  { name: '고은희', paymentDate: '5/26', months: 3, amount: 30000 },
  { name: '정예빈', paymentDate: '5/29', months: 1, amount: 10000 },
  { name: '류서윤', paymentDate: '5/30', months: 1, amount: 10000 },
  { name: '홍지표', paymentDate: '5/30', months: 1, amount: 10000 },
  { name: '홍은서', paymentDate: '5/28', months: 1, amount: 10000 },
  { name: '김하나', paymentDate: '6/3',  months: 1, amount: 10000 },
  { name: '김준택', paymentDate: '6/3',  months: 1, amount: 10000 },
  { name: '서보경', paymentDate: '6/2',  months: 1, amount: 10000 },
  { name: '김소영', paymentDate: '5/1',  months: 3, amount: 30000 },
  { name: '이지환', paymentDate: '4/27', months: 3, amount: 30000 },
  { name: '김영환', paymentDate: '4/23', months: 3, amount: 30000 },
  { name: '정연경', paymentDate: '6/2',  months: 1, amount: 10000 },
  { name: '김동근', paymentDate: '6/3',  months: 3, amount: 30000 },
  { name: '전명익', paymentDate: '4/25', months: 3, amount: 30000 },
  { name: '서보경', paymentDate: '6/12', months: 3, amount: 30000 },
  { name: '서희성', paymentDate: '6/12', months: 3, amount: 30000 },
  { name: '송현섭', paymentDate: '6/12', months: 3, amount: 30000 },
  { name: '박용진', paymentDate: '5/8',  months: 1, amount: 10000 },
  { name: '김원혁', paymentDate: '5/8',  months: 1, amount: 10000 },
];

export interface SpringPassRecord extends SpringPassRecordRaw, PassTerm {
  /** 0-based 입력 순서(장부 행과 매칭용). */
  index: number;
}

/** 규칙을 적용해 시작/종료일까지 채운 완성 레코드 목록. */
export function buildSpring2026Passes(): SpringPassRecord[] {
  return SPRING_2026_RAW.map((raw, index) => {
    const term = computePassTerm({
      paymentDate: raw.paymentDate,
      months: raw.months,
      year: SPRING_YEAR,
    });
    return { ...raw, ...term, index };
  });
}

/** 합계/검증용 요약. */
export function springPassSummary() {
  const records = buildSpring2026Passes();
  const total = records.reduce((s, r) => s + r.amount, 0);
  const waitlist = records.filter((r) => r.openingWaitlist).length;
  return {
    count: records.length,
    totalAmount: total,
    openingWaitlistCount: waitlist,
    regularCount: records.length - waitlist,
  };
}
