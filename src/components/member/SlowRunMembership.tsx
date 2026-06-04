'use client';

import { useState, useMemo } from 'react';
import {
  CreditCard, HelpCircle, Calendar, RefreshCw, ChevronDown, ShoppingBag,
  CheckCircle2, MapPin, Clock, Users, MessageCircle, Bell, Gift, Sparkles,
  Footprints, ClipboardCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/AppContext';

// ── 슬로우롱런클럽 운영 정보 (한 곳에서 관리) ──
const CLUB_INFO = {
  name: '슬로우롱런클럽',
  place: '여의도공원 문화의마당',
  placeDetail: '문화의마당 비행기 모형 앞 집결 (여의도공원 세븐일레븐 3호점 · 여의도공원 출입구6과 태극기 게양대 사이)',
  mapUrl: 'https://naver.me/52cgNgZX',
  meetTime: '오후 7:30',
  warmupTime: '7:30 워밍업 시작 · 7:40 러닝 출발',
  days: '매주 수요일 · 금요일',
  monthlyCount: 8, // 주 2회 × 4주
  weeklyCount: 2,
  pricePerSession: 1250, // 10,000원 / 8회
  kakaoOpenChat: 'https://open.kakao.com/o/gQsrUACh',
};

interface FAQ {
  q: string;
  a: string;
}

const faqs: FAQ[] = [
  {
    q: '슬로우롱런클럽이 정확히 어떤 모임인가요?',
    a: '매주 수요일·금요일 저녁, 여의도공원 문화의마당에 모여 전문 코치와 함께 천천히·길게 달리는 러닝 클럽입니다. "슬로우 롱런(Slow Long Run)"은 숨이 차지 않을 속도로 오래 달리는 러닝 방식으로, 초보자도 무리 없이 따라올 수 있고 부상 위험이 낮으면서 심폐지구력은 확실히 올라갑니다. 혼자서는 꾸준히 못 하던 러닝을, 정해진 시간·장소·동료가 있으니 "헬스장 회원권"처럼 습관으로 만들 수 있습니다.',
  },
  {
    q: '왜 월 10,000원이 그렇게 좋은 건가요?',
    a: '매주 수·금 2회, 한 달이면 총 8회 참여할 수 있습니다. 10,000원 ÷ 8회 = 회당 약 1,250원. 커피 한 잔보다 싼 가격에 전문 코치의 페이스 메이킹, 짐 보관, 급수, 그리고 함께 달리는 동료까지 따라옵니다. 게다가 멤버십 회원이 되면 아이오의 모든 전문 클래스(EBW·마라톤·공무원 특화·1:1 PT 등)를 상시 10% 할인받습니다.',
  },
  {
    q: '러닝을 한 번도 안 해봤는데 따라갈 수 있을까요?',
    a: '네, 슬로우 롱런은 "대화가 가능한 속도"로 천천히 달리는 것이 원칙입니다. 코치가 페이스를 조절하고 그룹을 나눠 운영하기 때문에 입문자도 낙오 없이 완주할 수 있습니다. 실제로 회원의 상당수가 러닝을 처음 시작한 분들이며, 함께 시작한 동료들과 빠르게 친해집니다.',
  },
  {
    q: '준비물이나 복장은 어떻게 하나요?',
    a: '편한 운동복과 러닝화면 충분합니다. 귀중품·겉옷 등은 현장에서 짐 보관을 지원하니 가볍게 오시면 됩니다. 물은 현장에서 급수가 제공되지만, 개인 물통을 가져오셔도 좋습니다.',
  },
  {
    q: '중간에 해지하면 환불되나요?',
    a: '이미 시작된 이용권은 기간(결제일로부터 30일)이 끝날 때까지 사용하시는 것을 원칙으로 합니다. 자동결제는 다음 달부터 결제가 중단됩니다.',
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
        .filter(p => p.tags && p.tags.includes('runclub') && p.isActive)
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
  try { sessionStorage.setItem(CATALOG_FILTER_KEY, 'runclub'); } catch { /* noop */ }
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
          <Footprints size={18} className="text-[var(--color-runclub)]" />
          <h1 className="page-title">아이오 런클럽 멤버십 — 슬로우롱런클럽</h1>
        </div>
        <p className="text-[13px] text-[var(--color-text-muted)]">
          매주 수·금 저녁 7시 30분, 여의도공원 문화의마당에서 함께 달려요. 월 10,000원 · 한 달 8회.
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
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-slowrun)] bg-white/70 border border-[var(--color-slowrun)]/25 rounded-full px-2.5 py-1 mb-2.5">
            <Sparkles size={12} /> 신규 가입자 첫 참여 1회 무료
          </span>
          <h2 className="text-[17px] font-bold text-[var(--color-text)] mb-2 leading-snug">
            매주 수·금 저녁, 여의도 한강에서 함께 달려요
          </h2>
          <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            <strong className="text-[var(--color-text)]">슬로우롱런클럽</strong>은 천천히·길게 달리며
            러닝을 "습관"으로 만들어주는 모임입니다. 월 10,000원으로 <strong className="text-[var(--color-text)]">한 달 8회(주 2회)</strong> 참여 —
            회당 약 <strong className="text-[var(--color-slowrun)]">1,250원</strong>, 커피 한 잔보다 쌉니다.
            전문 코치의 페이스 메이킹, 짐 보관, 급수가 모두 포함되고,
            멤버가 되면 아이오의 <strong className="text-[var(--color-primary)]">모든 전문 클래스를 상시 10% 할인</strong>받습니다.
          </p>
        </div>
      )}

      {/* ── Price Highlight Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-[var(--color-border)] rounded px-4 py-4 text-center">
          <p className="text-[12px] text-[var(--color-text-muted)] mb-1">가격</p>
          <p className="price-num">10,000<span className="text-[13px] font-medium text-[var(--color-text-muted)]">원</span></p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">월 정액</p>
        </div>
        <div className="bg-white border border-[var(--color-border)] rounded px-4 py-4 text-center">
          <p className="text-[12px] text-[var(--color-text-muted)] mb-1">참여 횟수</p>
          <p className="kpi-num">8<span className="text-[13px] font-medium text-[var(--color-text-muted)]">회/월</span></p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">매주 수·금 2회</p>
        </div>
        <div className="bg-white border border-[var(--color-border)] rounded px-4 py-4 text-center">
          <p className="text-[12px] text-[var(--color-text-muted)] mb-1">회당 단가</p>
          <p className="kpi-num text-[var(--color-slowrun)]">1,250<span className="text-[13px] font-medium text-[var(--color-text-muted)]">원</span></p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">8회 기준</p>
        </div>
        <div className="bg-white border border-[var(--color-border)] rounded px-4 py-4 text-center">
          <p className="text-[12px] text-[var(--color-text-muted)] mb-1">기간</p>
          <p className="kpi-num">30<span className="text-[13px] font-medium text-[var(--color-text-muted)]">일</span></p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">결제일 기준</p>
        </div>
      </div>

      {/* ── 장소 & 시간 (가장 중요한 실전 정보) ── */}
      <section className="bg-white border border-[var(--color-border)] rounded mb-4">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-start gap-3">
          <div className="w-8 h-8 rounded bg-[var(--color-runclub-bg)] flex items-center justify-center shrink-0 mt-0.5">
            <MapPin size={15} className="text-[var(--color-runclub)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14.5px] font-semibold text-[var(--color-text)]">언제 · 어디서 모이나요?</h2>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">처음 오시는 분도 헤매지 않도록 안내해 드려요.</p>
          </div>
        </header>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-2.5">
            <Calendar size={16} className="text-[var(--color-runclub)] shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] text-[var(--color-text-muted)]">요일</p>
              <p className="text-[13.5px] font-semibold text-[var(--color-text)]">{CLUB_INFO.days}</p>
              <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">한 달 총 {CLUB_INFO.monthlyCount}회</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Clock size={16} className="text-[var(--color-runclub)] shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] text-[var(--color-text-muted)]">시간</p>
              <p className="text-[13.5px] font-semibold text-[var(--color-text)]">{CLUB_INFO.meetTime} 집합</p>
              <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">{CLUB_INFO.warmupTime}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPin size={16} className="text-[var(--color-runclub)] shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] text-[var(--color-text-muted)]">장소</p>
              <p className="text-[13.5px] font-semibold text-[var(--color-text)]">{CLUB_INFO.place}</p>
              <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">{CLUB_INFO.placeDetail}</p>
              <a
                href={CLUB_INFO.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] font-medium text-[var(--color-runclub)] hover:underline"
              >
                <MapPin size={12} /> 네이버 지도로 위치 보기
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── 참여 방법 & 출석 방법 ── */}
      <section className="bg-white border border-[var(--color-border)] rounded mb-4">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-start gap-3">
          <div className="w-8 h-8 rounded bg-[var(--color-bg-subtle)] flex items-center justify-center shrink-0 mt-0.5">
            <ClipboardCheck size={15} className="text-[var(--color-text-secondary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14.5px] font-semibold text-[var(--color-text)]">어떻게 참여하고 출석하나요?</h2>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">처음 한 번만 익히면 그다음은 아주 간단해요.</p>
          </div>
        </header>
        <div className="px-5 py-4 space-y-3">
          {[
            { n: '1', t: '집결', d: `러닝 당일 ${CLUB_INFO.meetTime}까지 ${CLUB_INFO.place}로 오세요. ${CLUB_INFO.placeDetail}. 처음 오시는 분은 코치/매니저에게 "처음 왔어요"라고 말씀만 해주시면 됩니다.` },
            { n: '2', t: '출석 체크', d: '현장에서 앱의 출석 QR을 코치에게 보여주거나, 코치가 명단에서 이름을 확인합니다. 멤버십이 활성 상태면 별도 횟수 차감 없이 바로 참여할 수 있습니다.' },
            { n: '3', t: '워밍업 & 러닝', d: '가벼운 스트레칭과 워밍업 후 7시 40분쯤 출발합니다. 코치가 페이스를 조절하고 수준별로 그룹을 나눠 함께 달립니다. "대화가 가능한 속도"로 천천히 달리니 입문자도 안심하세요.' },
            { n: '4', t: '쿨다운 & 마무리', d: '러닝 후 가볍게 쿨다운 스트레칭으로 마무리합니다. 끝나고 자연스럽게 인사 나누고, 종종 가볍게 커피·번개 모임으로 이어지기도 합니다.' },
          ].map(step => (
            <div key={step.n} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-[var(--color-runclub-bg)] border border-[var(--color-runclub)]/30 text-[11px] font-semibold text-[var(--color-runclub)] flex items-center justify-center shrink-0 mt-0.5 tabular-nums">{step.n}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-text)]">{step.t}</p>
                <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{step.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 분위기 & 함께하는 사람들 ── */}
      <section className="bg-white border border-[var(--color-border)] rounded mb-4">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-start gap-3">
          <div className="w-8 h-8 rounded bg-[var(--color-bg-subtle)] flex items-center justify-center shrink-0 mt-0.5">
            <Users size={15} className="text-[var(--color-text-secondary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14.5px] font-semibold text-[var(--color-text)]">어떤 사람들이, 어떤 분위기로 모이나요?</h2>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">혼자 오셔도 금방 동료가 생겨요.</p>
          </div>
        </header>
        <div className="px-5 py-4">
          <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed mb-3">
            슬로우롱런클럽은 <strong className="text-[var(--color-text)]">경쟁보다 꾸준함</strong>을 중요하게 생각합니다.
            20대 직장인부터 러닝을 처음 시작한 분, 마라톤을 준비하는 분까지 다양한 분들이 함께합니다.
            대부분 <strong className="text-[var(--color-text)]">혼자 등록해서 오신 분들</strong>이라 처음 오셔도 어색하지 않고,
            같은 페이스로 달리다 보면 자연스럽게 친해집니다.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              ['🐢', '천천히, 함께', '낙오 없이 모두 완주하는 페이스'],
              ['🤝', '편안한 동료', '혼자 와도 금방 친구가 되는 분위기'],
              ['📈', '눈에 보이는 성장', '매주 쌓이는 러닝으로 확실한 체력 향상'],
            ].map(([emoji, t, d]) => (
              <div key={t} className="bg-[var(--color-bg-subtle)] rounded px-3 py-3 text-center">
                <div className="text-[20px] mb-1">{emoji}</div>
                <p className="text-[12.5px] font-semibold text-[var(--color-text)]">{t}</p>
                <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5 leading-snug">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 신규 가입자 1회 무료 참가 (강조) ── */}
      <div className="bg-[var(--color-runclub-bg)] border border-[var(--color-runclub)]/30 rounded px-5 py-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--color-runclub)] flex items-center justify-center shrink-0 mt-0.5">
            <Gift size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14.5px] font-bold text-[var(--color-text)] mb-1">처음이라면, 첫 참여 1회는 무료예요</h2>
            <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
              "나랑 잘 맞을까?" 고민되시죠. <strong className="text-[var(--color-runclub)]">신규 가입 전, 첫 러닝 1회는 무료로 체험</strong>하실 수 있습니다.
              일단 {CLUB_INFO.meetTime}에 {CLUB_INFO.place}로 편하게 나와서 한 번 달려보세요.
              분위기와 강도를 직접 느껴보신 뒤 멤버십에 가입하셔도 늦지 않습니다.
            </p>
          </div>
        </div>
      </div>

      {/* ── 핵심 후크: 런클럽 회원 = 전 상품 10% 상시 할인 ── */}
      <div className="bg-[var(--color-primary-bg)] border border-[var(--color-primary-border)] rounded px-5 py-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle2 size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14.5px] font-bold text-[var(--color-text)] mb-1">
              런클럽 회원만의 혜택 — 모든 전문 클래스 상시 10% 할인
            </h2>
            <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
              멤버십을 보유한 동안에는 EBW 정기반, io러닝 클래스, 공무원 체력시험 특화반,
              강병규 코치 1:1 러닝 PT, 맞춤형 깔창 제작까지 <strong className="text-[var(--color-primary)]">결제 금액에서 자동으로 10%가 차감</strong>됩니다.
              단돈 1만 원의 멤버십 하나로 한 해 내내 할인받으세요.
            </p>
          </div>
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
            슬로우롱런클럽 멤버십 가입하기
          </button>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-2">
            가입 전, 첫 러닝 1회는 무료로 체험할 수 있어요. 일단 한 번 나와보세요!
          </p>
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
                결제일로부터 <strong className="text-[var(--color-text)]">30일 동안</strong> 런클럽 세션에
                자유롭게 참여할 수 있는 멤버십입니다. 예를 들어 5월 25일에 결제하시면 6월 23일까지 이용 가능합니다.
                멤버십이 활성인 동안은 다른 전문 클래스 구매 시 <strong className="text-[var(--color-primary)]">10% 할인</strong>도 계속 적용됩니다.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-secondary)] flex items-center justify-center shrink-0 mt-0.5 tabular-nums">2</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                매주 <strong className="text-[var(--color-text)]">수·금 2회, 한 달 총 8회</strong> 참여할 수 있습니다.
                일이 바빠서 한두 번 못 오시는 주가 있어도 같은 금액으로 운영되니
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
              <p className="text-[13px] font-medium text-[var(--color-text)]">앱에서 바로 구매</p>
              <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">
                아래 <strong className="text-[var(--color-text)]">"멤버십 가입하기"</strong> 버튼을 누르면 수강권 구매 화면으로 이동합니다.
                결제 즉시 멤버십이 활성화되어 다음 러닝부터 바로 참여할 수 있습니다.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-secondary)] flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
              3
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

      {/* ── 카톡방 & 공지 안내 ── */}
      <section className="bg-white border border-[var(--color-border)] rounded mb-4">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-start gap-3">
          <div className="w-8 h-8 rounded bg-[var(--color-bg-subtle)] flex items-center justify-center shrink-0 mt-0.5">
            <MessageCircle size={15} className="text-[var(--color-text-secondary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14.5px] font-semibold text-[var(--color-text)]">카톡방 & 공지는 어떻게 받나요?</h2>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">날씨로 인한 휴무·변경 안내를 놓치지 마세요.</p>
          </div>
        </header>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-start gap-3">
            <MessageCircle size={16} className="text-[#FAE100] shrink-0 mt-0.5" style={{ color: '#3C1E1E', fill: '#FAE100' }} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--color-text)]">슬로우롱런클럽 오픈채팅방</p>
              <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">
                멤버 전원이 모인 카카오톡 오픈채팅방입니다. 매 러닝 전 집결 안내, 우천·폭염 시 휴무 공지,
                번개·이벤트 소식이 가장 먼저 올라옵니다. <strong className="text-[var(--color-text)]">가입 후 꼭 입장해 주세요.</strong>
              </p>
              <a
                href={CLUB_INFO.kakaoOpenChat}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-[12.5px] font-medium text-[var(--color-runclub)] hover:underline"
              >
                <MessageCircle size={13} /> 오픈채팅방 입장하기
              </a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Bell size={16} className="text-[var(--color-text-secondary)] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--color-text)]">앱 공지 & 푸시 알림</p>
              <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">
                중요한 공지는 앱의 <strong className="text-[var(--color-text)]">공지사항</strong>에도 함께 올라가며, 알림을 켜두시면
                러닝 휴무·일정 변경을 푸시로 바로 받아보실 수 있습니다.
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
