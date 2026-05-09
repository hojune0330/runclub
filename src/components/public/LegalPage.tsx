import PublicLayout from './PublicLayout';

/**
 * LegalPage — 이용약관/개인정보처리방침/환불정책 공통 레이아웃.
 *
 * 토스 PG 심사관이 클릭으로 도달하는 페이지라 가독성 + 인쇄 친화 + 명확한
 * 시행일 표기가 핵심. 마케팅 톤 X, 법적 문서 톤 O.
 *
 * 스타일 원칙:
 * - 본문 폰트는 ~14px, 단락 간격 넉넉히
 * - 헤딩 위계는 h2/h3만 (h1은 페이지 타이틀에서)
 * - 링크는 underline 고정 (의도적으로 강조)
 */

interface Props {
  title: string;
  effectiveDate: string;
  description?: string;
  children: React.ReactNode;
}

export default function LegalPage({ title, effectiveDate, description, children }: Props) {
  return (
    <PublicLayout>
      <article className="max-w-[820px] mx-auto px-5 md:px-6 py-8 md:py-14">
        <header className="mb-6 md:mb-8 pb-5 md:pb-6 border-b border-[var(--color-border)]">
          <h1 className="text-[22px] md:text-[28px] font-bold tracking-[-0.01em] text-[var(--color-text)]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-[13.5px] md:text-[14.5px] text-[var(--color-text-secondary)] leading-relaxed">
              {description}
            </p>
          )}
          <p className="mt-3 text-[12px] text-[var(--color-text-muted)] tabular-nums">
            시행일: {effectiveDate}
          </p>
        </header>

        <div className="legal-prose text-[13.5px] md:text-[14.5px] text-[var(--color-text)] leading-[1.75]">
          {children}
        </div>
      </article>

      {/*
        legal-prose: 법적 문서용 인라인 스타일.
        Tailwind plugin 없이 styled-jsx로 처리해 페이지에서 별도 의존성 없이 동작.
        - h2: 큰 섹션 타이틀
        - h3: 하위 섹션
        - p: 본문 단락
        - ul/ol: 들여쓰기 + 행간
        - strong: 강조
      */}
      <style>{`
        .legal-prose h2 {
          font-size: 17px;
          font-weight: 700;
          margin-top: 2.4em;
          margin-bottom: 0.7em;
          letter-spacing: -0.01em;
          color: var(--color-text);
        }
        @media (min-width: 768px) {
          .legal-prose h2 { font-size: 19px; }
        }
        .legal-prose h2:first-child {
          margin-top: 0;
        }
        .legal-prose h3 {
          font-size: 15px;
          font-weight: 600;
          margin-top: 1.6em;
          margin-bottom: 0.5em;
          color: var(--color-text);
        }
        .legal-prose p {
          margin: 0.7em 0;
        }
        .legal-prose ul,
        .legal-prose ol {
          margin: 0.7em 0;
          padding-left: 1.5em;
        }
        .legal-prose li {
          margin: 0.3em 0;
        }
        .legal-prose ul li {
          list-style: disc;
        }
        .legal-prose ol li {
          list-style: decimal;
        }
        .legal-prose strong {
          font-weight: 600;
          color: var(--color-text);
        }
        .legal-prose table {
          width: 100%;
          border-collapse: collapse;
          margin: 1em 0;
          font-size: 13px;
        }
        .legal-prose th,
        .legal-prose td {
          border: 1px solid var(--color-border);
          padding: 8px 10px;
          text-align: left;
          vertical-align: top;
        }
        .legal-prose th {
          background: var(--color-bg-subtle);
          font-weight: 600;
        }
        .legal-prose a {
          color: var(--color-primary);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .legal-prose hr {
          border: 0;
          border-top: 1px solid var(--color-border);
          margin: 2em 0;
        }
      `}</style>
    </PublicLayout>
  );
}
