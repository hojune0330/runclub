'use client';

import { useState, useMemo } from 'react';
import { CreditCard, HelpCircle, Calendar, RefreshCw, ChevronDown, ShoppingBag, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/AppContext';

interface FAQ {
  q: string;
  a: string;
}

const faqs: FAQ[] = [
  {
    q: '한 달에 두 번 다 와도 추가 요금이 있나요?',
    a: '없습니다. 10,000원으로 30일간 무제한 이용입니다.',
  },
  {
    q: '중간에 해지하면 환불되나요?',
    a: '이미 시작된 이용권은 기간이 끝날 때까지 사용하시는 것을 원칙으로 합니다. 다음 달부터 결제가 중단됩니다.',
  },
  {
    q: '한 번도 못 나왔는데 환불 가능한가요?',
    a: '세션 시작 전에 미리 말씀해주시면 다음 달로 이월해드릴 수 있습니다. 케이스별로 코치에게 문의 부탁드립니다.',
  },
];

/** SKILL:slowrun-membership-status
 *  현재 slowrun 태그가 있는 활성 수강권을 찾아 상태 배지를 표시한다.
 *  memberPasses / passProducts API 에 의존성이 있으며, 둘 중 하나라도
 *  변경되면 자동으로 재계산된다. 이 블록만 제거하면 바로 이전 버전으로 복원 가능.
 */
function useSlowRunStatus() {
  const { memberPasses, passProducts } = useApp();
  return useMemo(() => {
    // slowrun 태그가 있는 상품 id 목록
    const slowrunProductIds = new Set(
      passProducts
        .filter(p => p.tags && p.tags.includes('slowrun') && p.isActive)
        .map(p => p.id)
    );
    // 활성(active)이면서 slowrun 상품에 해당하는 수강권 중 만료일 기준 내림차순
    const activeSlowRunPasses = memberPasses
      .filter(
        p =>
          p.status === 'active' &&
          slowrunProductIds.has(p.productId) &&
          new Date(p.expiryDate) > new Date()
      )
      .sort((a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime());

    if (activeSlowRunPasses.length === 0) return null;
    const latest = activeSlowRunPasses[0];
    const now = new Date();
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(latest.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );
    return { pass: latest, daysLeft };
  }, [memberPasses, passProducts]);
}

/** SKILL:slowrun-catalog-filter
 *  수강권 구매 CTA 클릭 시 catalog 탭이 slowrun 상품을 자동 필터링하도록
 *  sessionStorage 에 플래그를 기록한 후 member:navigate 이벤트를 발생시킨다.
 *  PassCatalog 는 마운트 시 이 플래그를 읽고 필터를 적용한다.
 *  sessionStorage 는 탭 이동 후 읽자마자 삭제하므로 오염 위험이 없다.
 */
const CATALOG_FILTER_KEY = 'slowrun:catalogFilter';

function navigateToCatalogWithFilter() {
  try { sessionStorage.setItem(CATALOG_FILTER_KEY, 'slowrun'); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent('member:navigate', { detail: 'catalog' }));
}

export default function SlowRunMembership() {
  const [openFaqs, setOpenFaqs] = useState<Record<string, boolean>>({});
  const slowRunStatus = useSlowRunStatus();

  const toggleFaq = (q: string) => {
    setOpenFaqs(prev => ({ ...prev, [q]: !prev[q] }));
  };

  return (
    <div className="max-w-[960px]">
      {/* ── Page Heading ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Calendar size={18} className="text-[var(--color-slowrun)]" />
          <h1 className="page-title">슬로우 롱런 멤버십</h1>
        </div>
        <p className="text-[13px] text-[var(--color-text-muted)]">
          월 10,000원, 수요일과 금요일 모두 자유롭게 참여하세요.
        </p>
      </div>

      {/* ── Membership Status Badge (active pass detected) ── */}
      {slowRunStatus && (
        <div className="bg-[var(--color-success-bg)] border border-[var(--color-success)]/30 rounded px-5 py-4 mb-6 animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--color-success)] flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-bold text-[var(--color-text)] mb-0.5">
                현재 이용 중인 멤버십
              </h2>
              <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                <strong className="text-[var(--color-text)]">{slowRunStatus.pass.productName}</strong>이 활성 상태입니다.
                만료일까지 <strong className="text-[var(--color-success)]">{slowRunStatus.daysLeft}일</strong> 남았습니다
                ({new Date(slowRunStatus.pass.expiryDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}까지).
              </p>
              {slowRunStatus.pass.paymentMethod && (
                <p className="text-[12px] text-[var(--color-text-muted)] mt-1">
                  결제 수단: {slowRunStatus.pass.paymentMethod === 'toss' || slowRunStatus.pass.paymentMethod === 'tosspay' ? '토스 자동결제' : slowRunStatus.pass.paymentMethod}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Hero Banner (only shown when no active pass) ── */}
      {!slowRunStatus && (
        <div className="bg-[var(--color-slowrun-bg)] border border-[var(--color-slowrun)]/20 rounded px-5 py-5 mb-6">
          <h2 className="text-[16px] font-bold text-[var(--color-text)] mb-2">
            월 10,000원, 수요일과 금요일 모두 자유롭게 참여하세요
          </h2>
          <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            기존에 수요일에만 운영되던 슬로우 롱런이 <strong className="text-[var(--color-text)]">금요일까지 확대</strong>됩니다.
            가격은 그대로 <strong className="text-[var(--color-text)]">월 10,000원</strong>, 한 달 동안 수요일과 금요일 세션에{' '}
            <strong className="text-[var(--color-text)]">횟수 제한 없이</strong> 참여하실 수 있습니다.
          </p>
        </div>
      )}

      {/* ── Price Highlight Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-[var(--color-border)] rounded px-4 py-4 text-center">
          <p className="text-[12px] text-[var(--color-text-muted)] mb-1">가격</p>
          <p className="price-num">10,000<span className="text-[13px] font-medium text-[var(--color-text-muted)]">원</span></p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">월 정액</p>
        </div>
        <div className="bg-white border border-[var(--color-border)] rounded px-4 py-4 text-center">
          <p className="text-[12px] text-[var(--color-text-muted)] mb-1">기간</p>
          <p className="kpi-num">30<span className="text-[13px] font-medium text-[var(--color-text-muted)]">일</span></p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">결제일 기준</p>
        </div>
        <div className="bg-white border border-[var(--color-border)] rounded px-4 py-4 text-center">
          <p className="text-[12px] text-[var(--color-text-muted)] mb-1">횟수</p>
          <p className="kpi-num">무제한</p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">수·금 자유 참여</p>
        </div>
      </div>

      {/* ── CTA Button (only shown when no active pass) ── */}
      {!slowRunStatus && (
        <div className="mb-6">
          <button
            onClick={navigateToCatalogWithFilter}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[var(--color-primary)] text-white text-[13.5px] font-medium px-6 py-2.5 rounded transition-colors hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)]"
          >
            <ShoppingBag size={15} />
            수강권 구매하러 가기
          </button>
        </div>
      )}

      {/* ── How It Works ── */}
      <section className="bg-white border border-[var(--color-border)] rounded mb-4">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-start gap-3">
          <div className="w-8 h-8 rounded bg-[var(--color-bg-subtle)] flex items-center justify-center shrink-0 mt-0.5">
            <RefreshCw size={15} className="text-[var(--color-text-secondary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14.5px] font-semibold text-[var(--color-text)]">
              이용 방식
            </h2>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">
              결제일로부터 30일 동안 자유롭게 참여하는 멤버십입니다.
            </p>
          </div>
        </header>
        <div className="px-5 py-4">
          <div className="flex items-start gap-3 mb-3">
            <span className="w-5 h-5 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-secondary)] flex items-center justify-center shrink-0 mt-0.5 tabular-nums">1</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                결제일로부터 <strong className="text-[var(--color-text)]">30일 동안</strong> 슬로우 롱런 세션에
                자유롭게 참여할 수 있는 멤버십입니다. 예를 들어 5월 25일에 결제하시면 6월 23일까지 이용 가능합니다.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-secondary)] flex items-center justify-center shrink-0 mt-0.5 tabular-nums">2</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                별도 횟수 차감은 없습니다. 일이 바빠서 한 번밖에 못 오시는 달도, 매주 두 번 다 나오시는 달도 같은 금액으로 운영됩니다.
                <strong className="text-[var(--color-text)]"> 편하게 오실 수 있을 때 오시면 됩니다.</strong>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Payment Method ── */}
      <section className="bg-white border border-[var(--color-border)] rounded mb-4">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-start gap-3">
          <div className="w-8 h-8 rounded bg-[var(--color-bg-subtle)] flex items-center justify-center shrink-0 mt-0.5">
            <CreditCard size={15} className="text-[var(--color-text-secondary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14.5px] font-semibold text-[var(--color-text)]">
              결제 방법
            </h2>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">
              편리한 자동결제 또는 현장 현금 등록
            </p>
          </div>
        </header>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[var(--color-primary-bg)] border border-[var(--color-primary-border)] text-[11px] font-semibold text-[var(--color-primary)] flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
              1
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--color-text)]">토스 자동결제 (추천)</p>
              <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">
                가장 편한 방법입니다. 한 번 등록해두시면 매달 자동으로 갱신되고, 해지하고 싶으실 때 언제든 해지하실 수 있습니다.
                해지하셔도 <strong className="text-[var(--color-text)]">결제한 기간이 끝날 때까지는 정상적으로 이용 가능</strong>합니다.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-secondary)] flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
              2
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--color-text)]">현장 현금 등록</p>
              <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">
                현장에서 코치에게 직접 현금으로 등록하시는 것도 가능합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ Accordion ── */}
      <section className="bg-white border border-[var(--color-border)] rounded">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-start gap-3">
          <div className="w-8 h-8 rounded bg-[var(--color-bg-subtle)] flex items-center justify-center shrink-0 mt-0.5">
            <HelpCircle size={15} className="text-[var(--color-text-secondary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14.5px] font-semibold text-[var(--color-text)]">
              자주 묻는 질문
            </h2>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">
              궁금한 질문을 눌러 답변을 확인하세요.
            </p>
          </div>
        </header>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {faqs.map((faq) => {
            const isOpen = openFaqs[faq.q] ?? false;
            return (
              <div key={faq.q}>
                <button
                  onClick={() => toggleFaq(faq.q)}
                  className="w-full px-5 py-4 flex items-start gap-2.5 text-left hover:bg-[var(--color-bg-hover)] transition-colors"
                >
                  <span className="text-[13px] font-bold text-[var(--color-primary)] shrink-0 mt-0.5">Q.</span>
                  <span className="flex-1 text-[13px] font-medium text-[var(--color-text)] leading-relaxed">{faq.q}</span>
                  <ChevronDown
                    size={16}
                    className={cn(
                      'shrink-0 mt-0.5 text-[var(--color-text-muted)] transition-transform',
                      isOpen && 'rotate-180'
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 animate-slide-up">
                    <div className="flex items-start gap-2.5 pl-0">
                      <span className="text-[13px] font-bold text-[var(--color-text-muted)] shrink-0 mt-0.5">A.</span>
                      <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">{faq.a}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Footer Note ── */}
      <div className="mt-5 p-4 bg-[var(--color-bg-hover)] rounded border border-[var(--color-border-subtle)]">
        <p className="text-[12.5px] text-[var(--color-text-muted)] leading-relaxed">
          이용 중 궁금한 점이 있으면 언제든 코치에게 문의하거나 프로필 메뉴의 <strong>문의하기</strong>를 이용해주세요.
          FAQ는 실제 문의 내용을 바탕으로 계속 업데이트됩니다.
        </p>
      </div>
    </div>
  );
}
