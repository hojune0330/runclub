'use client';

/**
 * BusinessFooter — 전자상거래법 제13조·시행령 제10조에 따른 사업자 정보 의무 표기.
 *
 * 비회원(공개 페이지) 푸터, 회원 앱(`/app`), 어드민 앱, 결제 결과 페이지 등
 * 결제가 발생할 수 있는 모든 화면에서 동일한 정보를 표시하기 위해 단일 컴포넌트로 분리.
 *
 * variant
 *  - 'full'    : 공개 푸터(헤더 행 + 사업자 정보 + 카피라이트). PublicLayout 에서 사용.
 *  - 'compact' : 사업자 정보 + 카피라이트만 노출. 회원/어드민/결제 페이지에서 사용.
 */

type Variant = 'full' | 'compact';

export default function BusinessFooter({ variant = 'compact' }: { variant?: Variant }) {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
      <div className="bg-white">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4 md:py-5">
          <p className="text-[11.5px] font-semibold text-[var(--color-text)] mb-2">사업자 정보</p>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[11.5px] text-[var(--color-text-muted)] leading-relaxed">
            <div className="flex gap-1.5">
              <dt className="text-[var(--color-text-muted)] shrink-0">상호</dt>
              <dd className="text-[var(--color-text-secondary)]">인피니트 오퍼튜니티</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-[var(--color-text-muted)] shrink-0">대표자</dt>
              <dd className="text-[var(--color-text-secondary)]">장호준</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-[var(--color-text-muted)] shrink-0">사업자등록번호</dt>
              <dd className="text-[var(--color-text-secondary)] tabular-nums">528-05-02781</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-[var(--color-text-muted)] shrink-0">개업일</dt>
              <dd className="text-[var(--color-text-secondary)] tabular-nums">2022.09.14</dd>
            </div>
            <div className="flex gap-1.5 md:col-span-2">
              <dt className="text-[var(--color-text-muted)] shrink-0">사업장 소재지</dt>
              <dd className="text-[var(--color-text-secondary)]">서울특별시 강남구 삼성로115길 28, 지하1층 (삼성동)</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-[var(--color-text-muted)] shrink-0">업태</dt>
              <dd className="text-[var(--color-text-secondary)]">예술, 스포츠 및 여가관련 서비스업 외</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-[var(--color-text-muted)] shrink-0">종목</dt>
              <dd className="text-[var(--color-text-secondary)]">기타 스포츠 서비스업 외</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-[var(--color-text-muted)] shrink-0">고객센터</dt>
              <dd className="text-[var(--color-text-secondary)]">
                <a href="tel:01024282655" className="hover:text-[var(--color-primary)]">010-2428-2655</a>
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-[var(--color-text-muted)] shrink-0">이메일</dt>
              <dd className="text-[var(--color-text-secondary)]">
                <a href="mailto:hojune0330@gmail.com" className="hover:text-[var(--color-primary)]">hojune0330@gmail.com</a>
              </dd>
            </div>
          </dl>
          <p className="text-[10.5px] text-[var(--color-text-muted)] mt-3 leading-relaxed">
            결제대행: 토스페이먼츠(주) · 본 사이트는 결제·취소·환불을 토스페이먼츠를 통해 처리합니다.
            회원의 개인정보는 결제 처리 목적에 한해 제공되며 처리 위탁 종료 시 즉시 파기됩니다.
          </p>
          {variant === 'compact' && (
            <p className="text-[10.5px] text-[var(--color-text-muted)] mt-2">
              © 2026 인피니트 오퍼튜니티. All rights reserved.
            </p>
          )}
        </div>
      </div>
      {variant === 'full' && (
        <div className="border-t border-[var(--color-border)] py-3 px-4 md:px-6 text-center text-[11px] md:text-[11.5px] text-[var(--color-text-muted)]">
          © 2026 인피니트 오퍼튜니티. All rights reserved.
        </div>
      )}
    </footer>
  );
}
