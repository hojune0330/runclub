/**
 * business-info — 사업자 정보 단일 진실 공급원.
 *
 * 토스페이먼츠 PG 심사 + 전자상거래법 제13조·개보법 제30조 의무 표기를 위해
 * BusinessFooter, /terms, /privacy, /refund 등 모든 화면에서 동일한 정보를
 * 참조해야 한다. PG 심사관이 신청서/하단/약관 정보 일치 여부를 확인하므로
 * 한 군데서만 관리한다.
 *
 * 환경변수로 운영 환경에서 주입 가능. 미설정 시 기본값으로 fallback.
 */

export const BUSINESS_INFO = {
  // 상호 및 대표자
  companyName: '인피니트 오퍼튜니티',
  ceo: '장호준',

  // 서비스 명 (사용자에게 노출되는 이름)
  serviceName: '런클럽 매니저',
  serviceShortName: '런클럽',

  // 사업자 등록 정보
  businessRegistrationNumber: '528-05-02781',
  mailOrderNumber:
    process.env.NEXT_PUBLIC_BUSINESS_MAILORDER_NO || '제2022-서울강남-05276호',

  // 사업장 소재지
  address: '서울특별시 강남구 삼성로115길 28, 지하1층',

  // 연락처 (전상법상 의무)
  tel: process.env.NEXT_PUBLIC_BUSINESS_TEL || '010-2428-2655',
  email: process.env.NEXT_PUBLIC_BUSINESS_EMAIL || 'hojune0330@gmail.com',

  // 개인정보보호책임자 (개보법 제31조 의무)
  // 별도 지정 가능하지만, 1인 사업자라 대표자가 겸임
  privacyOfficer: '장호준',
  privacyOfficerEmail:
    process.env.NEXT_PUBLIC_BUSINESS_EMAIL || 'hojune0330@gmail.com',

  // 결제대행
  paymentProvider: '토스페이먼츠(주)',

  // 약관/정책 시행일 — 변경 시 업데이트 필요
  termsEffectiveDate: '2026-05-09',
  privacyEffectiveDate: '2026-05-09',
  refundEffectiveDate: '2026-05-09',
} as const;

// "010-2428-2655" → "01024282655" (tel: 링크용)
export function telDigits(tel: string = BUSINESS_INFO.tel): string {
  return tel.replace(/[^0-9]/g, '');
}
