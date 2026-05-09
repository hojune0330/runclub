'use client';

/**
 * BusinessFooter — 전자상거래법 제13조·시행령 제10조에 따른 사업자 정보 의무 표기.
 *
 * 비회원(공개 페이지) 푸터, 회원 앱(`/app`), 어드민 앱, 결제 결과 페이지 등
 * 결제가 발생할 수 있는 모든 화면에서 동일한 정보를 표시하기 위해 단일 컴포넌트로 분리.
 *
 * ── 표기 정책 (2025-05 정리) ──
 * 전상법 제13조 제1항이 의무화하는 항목만 표기, 그 외 정보(개업일/업태/종목/운영시간)는 제거.
 * - 의무: 상호, 대표자, 사업장 주소, 전화번호, 이메일, 사업자등록번호, 통신판매업 신고번호, 결제대행 고지
 * - 비의무 (제거): 개업일, 업태, 종목, 운영시간
 *
 * 환경변수:
 * - NEXT_PUBLIC_BUSINESS_TEL: 사업용 전화번호 (없으면 기본값)
 * - NEXT_PUBLIC_BUSINESS_EMAIL: 사업용 이메일
 * - NEXT_PUBLIC_BUSINESS_MAILORDER_NO: 통신판매업 신고번호 (없으면 "신고 예정" 표기)
 *
 * variant
 *  - 'full'    : 공개 푸터(사업자 정보 + 카피라이트 분리 행). PublicLayout 에서 사용.
 *  - 'compact' : 사업자 정보 + 카피라이트만 노출. 회원/어드민/결제 페이지에서 사용.
 */

type Variant = 'full' | 'compact';

const TEL = process.env.NEXT_PUBLIC_BUSINESS_TEL || '010-2428-2655';
const EMAIL = process.env.NEXT_PUBLIC_BUSINESS_EMAIL || 'hojune0330@gmail.com';
const MAILORDER_NO = process.env.NEXT_PUBLIC_BUSINESS_MAILORDER_NO || '';

// "010-2428-2655" → "01024282655" (tel: 링크용)
const telDigits = TEL.replace(/[^0-9]/g, '');

export default function BusinessFooter({ variant = 'compact' }: { variant?: Variant }) {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
      <div className="bg-white">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4 md:py-5">
          <p className="text-[11px] font-semibold text-[var(--color-text-secondary)] mb-2">사업자 정보</p>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            <div className="flex gap-1.5">
              <dt className="shrink-0">상호</dt>
              <dd>인피니트 오퍼튜니티</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0">대표자</dt>
              <dd>장호준</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0">사업자등록번호</dt>
              <dd className="tabular-nums">528-05-02781</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0">통신판매업 신고</dt>
              <dd className="tabular-nums">{MAILORDER_NO || '신고 예정'}</dd>
            </div>
            <div className="flex gap-1.5 md:col-span-2">
              <dt className="shrink-0">사업장 소재지</dt>
              <dd>서울특별시 강남구 삼성로115길 28, 지하1층</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0">전화</dt>
              <dd>
                <a href={`tel:${telDigits}`} className="hover:text-[var(--color-primary)]">{TEL}</a>
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0">이메일</dt>
              <dd>
                <a href={`mailto:${EMAIL}`} className="hover:text-[var(--color-primary)]">{EMAIL}</a>
              </dd>
            </div>
          </dl>
          <p className="text-[10.5px] text-[var(--color-text-muted)] mt-3 leading-relaxed">
            결제대행: 토스페이먼츠(주) · 본 사이트는 결제·취소·환불을 토스페이먼츠를 통해 처리합니다.
          </p>
          {variant === 'compact' && (
            <p className="text-[10.5px] text-[var(--color-text-muted)] mt-2">
              © 2026 인피니트 오퍼튜니티. All rights reserved.
            </p>
          )}
        </div>
      </div>
      {variant === 'full' && (
        <div className="border-t border-[var(--color-border)] py-3 px-4 md:px-6 text-center text-[11px] text-[var(--color-text-muted)]">
          © 2026 인피니트 오퍼튜니티. All rights reserved.
        </div>
      )}
    </footer>
  );
}
