'use client';

import { useState, useCallback } from 'react';
import {
  ShoppingBag,
  CreditCard,
  Shield,
  AlertTriangle,
  TrendingUp,
  Eye,
  BookOpen,
  Settings,
  ExternalLink,
} from 'lucide-react';

interface Row {
  label: string;
  value: string;
}

interface TableData {
  caption: string;
  headers: string[];
  rows: Row[];
}

interface Step {
  title: string;
  desc: string;
}

interface Section {
  id: string;
  icon: typeof ShoppingBag;
  title: string;
  summary: string;
  steps?: Step[];
  table?: TableData;
  tips?: string[];
}

const sections: Section[] = [
  {
    id: 'product',
    icon: ShoppingBag,
    title: '상품 구조',
    summary: '슬로우 롱런 30일 멤버십 상품의 구성입니다.',
    table: {
      caption: '상품 정의',
      headers: ['항목', '내용'],
      rows: [
        { label: '상품명', value: '슬로우 롱런 30일 멤버십' },
        { label: '가격', value: '10,000원' },
        { label: '기간', value: '결제일(또는 시작일) 기준 30일' },
        { label: '이용 범위', value: '"슬로우 롱런" 태그가 붙은 모든 세션 (현재 수/금)' },
        { label: '횟수 제한', value: '없음' },
        { label: '자동 갱신', value: '토스 자동결제 시 30일마다 자동 결제' },
      ],
    },
  },
  {
    id: 'channels',
    icon: CreditCard,
    title: '결제 채널별 처리 원칙',
    summary: '각 결제 채널에 따른 이용권 발급 절차입니다.',
    steps: [
      {
        title: '토스 자동결제 (메인 채널)',
        desc: '회원이 직접 등록, 시스템이 자동으로 30일 이용권 발급. 운영자 개입 불필요. 이 채널로 최대한 유도하는 것이 운영 효율의 핵심입니다.',
      },
      {
        title: '현금 (현장 한정)',
        desc: '세션 현장에서 코치가 직접 수령한 경우에만 허용. 관리자 페이지에서 해당 회원에게 수동으로 30일권 발급, 시작일은 수령 당일로 입력합니다.',
      },
      {
        title: '네이버 스토어',
        desc: '당분간 운영하지 않거나, 운영하더라도 "수동 발급, 24시간 소요" 명시. 주문 확인 후 관리자가 수동으로 30일권 발급합니다.',
      },
    ],
    tips: [
      '가능한 모든 회원을 토스 자동결제로 유도하세요. 운영 부담이 크게 줄어듭니다.',
    ],
  },
  {
    id: 'principles',
    icon: Shield,
    title: '운영 기본 원칙',
    summary: '일관된 운영을 위한 핵심 원칙입니다.',
    steps: [
      {
        title: '원칙 1. 발급된 이용권은 기간 끝까지 보장',
        desc: '한 번 발급된 30일권은 해지·변경 요청과 무관하게 만료일까지 정상 작동합니다.',
      },
      {
        title: '원칙 2. 변경은 다음 주기부터 적용',
        desc: '해지, 가격 변경, 상품 변경 모두 현재 이용권 만료 후 다음 결제부터 반영됩니다.',
      },
      {
        title: '원칙 3. 일할 계산은 하지 않음',
        desc: '중도 해지 환불, 중도 가입 일할 차감 모두 시스템상 자동 계산하지 않습니다. 예외 케이스는 코치 재량으로 수동 처리합니다.',
      },
      {
        title: '원칙 4. 이월은 가능, 환불은 원칙적으로 불가',
        desc: '한 번도 사용하지 않은 회원에 한해 다음 달 이월 허용. 부분 사용 시 환불 없음.',
      },
    ],
  },
  {
    id: 'exceptions',
    icon: AlertTriangle,
    title: '예외 케이스 처리 가이드',
    summary: '상황별 처리 방법을 숙지하고 일관되게 적용하세요.',
    table: {
      caption: '예외 처리',
      headers: ['상황', '처리 방법'],
      rows: [
        { label: '회원이 중도 해지 요청', value: '다음 결제 중단, 현재 기간은 정상 이용' },
        { label: '한 번도 못 나옴, 이월 요청', value: '코치 확인 후 수동으로 만료일 30일 연장' },
        { label: '부상·장기 출장 등 일시 정지 요청', value: '코치 재량, 만료일 수동 연장으로 처리' },
        { label: '중복 결제 발생', value: '즉시 환불 또는 다음 달 자동 이월 중 선택' },
        { label: '현금 결제 후 자동결제 추가 등록', value: '현금분 기간 종료 후 자동결제 활성화' },
      ],
    },
    tips: [
      '모든 예외 처리는 감사 로그에 자동 기록됩니다. 코치의 재량 판단이 필요한 경우, 처리 사유를 메모로 남기세요.',
    ],
  },
  {
    id: 'expansion',
    icon: TrendingUp,
    title: '향후 확장 시 의사결정 트리거',
    summary: '지금은 단일 상품으로 운영하되, 아래 조건 충족 시 다음 단계로 이동합니다.',
    steps: [
      {
        title: '티어 분화 검토 시점',
        desc: '월 8회(수·금 풀참) 참석 회원이 전체의 20%를 넘을 때, 또는 회원 수가 현재의 2배 이상으로 늘어 코치 1인 운영 한계가 보일 때.',
      },
      {
        title: '가격 인상 검토 시점',
        desc: '신규 가입자 평균 LTV가 6개월 이상 유지될 때, 정원 대비 참석률이 80%를 상시 넘을 때.',
      },
      {
        title: '자동 일할 계산 도입 시점',
        desc: '토스 자동결제 회원이 전체의 70% 이상이 되었을 때, 월 해지 요청이 5건 이상으로 정기화될 때.',
      },
    ],
  },
  {
    id: 'admin-view',
    icon: Eye,
    title: '관리자 페이지에서 확인할 정보',
    summary: '각 회원 카드에서 다음 정보를 한눈에 파악할 수 있어야 합니다.',
    steps: [
      {
        title: '현재 이용권 상태',
        desc: '활성 / 만료 / 정지 상태를 시각적으로 구분하여 표시합니다.',
      },
      {
        title: '이용권 시작일과 만료일',
        desc: '날짜를 명확히 표시하여 기간을 파악할 수 있게 합니다.',
      },
      {
        title: '결제 채널',
        desc: '토스 자동 / 현금 / 네이버 등 결제 경로를 확인합니다.',
      },
      {
        title: '자동 갱신 여부',
        desc: '다음 결제가 예정되어 있는지 여부를 표시합니다.',
      },
      {
        title: '최근 30일 참석 횟수 (중요)',
        desc: '헤비 유저 식별용 지표입니다. 가격 정책 변경 시 "실제 헤비 유저가 몇 명인지" 데이터로 판단하려면 지금부터 참석 로그가 쌓여야 합니다.',
      },
    ],
    tips: [
      '참석 횟수 데이터가 가장 중요합니다. 미래의 모든 가격·운영 정책 결정은 이 데이터를 근거로 이루어집니다.',
    ],
  },
];

/* ── SKILL:admin-view-checklist ──
 * localStorage 를 키로 한 체크리스트. 각 체크박스는 sections 의 admin-view
 * steps 항목에 대응한다. 키가 없으면 기본값 false.
 * 이 블록 + AdminViewChecklist 컴포넌트만 제거하면 이전 버전으로 복원된다.
 */
const CHECKLIST_STORAGE_KEY = 'opsmanual:adminViewChecks';

interface ChecklistState {
  [itemKey: string]: boolean;
}

function loadChecklist(): ChecklistState {
  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChecklistState) : {};
  } catch {
    return {};
  }
}

function AdminViewChecklist() {
  const [checks, setChecks] = useState<ChecklistState>(loadChecklist);

  const toggleItem = useCallback((key: string) => {
    setChecks(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const adminViewSection = sections.find(s => s.id === 'admin-view');
  if (!adminViewSection?.steps) return null;

  const items = adminViewSection.steps;
  const checkedCount = items.filter(s => checks[s.title]).length;

  return (
    <div className="border-t border-[var(--color-border)] mt-4 pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          구현 체크리스트 — {checkedCount}/{items.length} 완료
        </p>
      </div>
      <ul className="space-y-2">
        {items.map(item => {
          const isChecked = checks[item.title] ?? false;
          return (
            <li key={item.title}>
              <button
                onClick={() => toggleItem(item.title)}
                className="w-full flex items-start gap-2.5 text-left group"
              >
                <span className={[
                  'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-[3px] transition-colors',
                  isChecked
                    ? 'bg-[var(--color-success)] border-[var(--color-success)]'
                    : 'border-[var(--color-border-strong)] group-hover:border-[var(--color-primary)]',
                ].join(' ')}>
                  {isChecked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <span className={[
                    'text-[12.5px] leading-relaxed',
                    isChecked ? 'text-[var(--color-text-muted)] line-through' : 'text-[var(--color-text-secondary)]',
                  ].join(' ')}>
                    {item.title}
                  </span>
                  <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">{item.desc}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── SKILL:exception-table-actions ──
 * 예외 케이스 테이블의 각 행에 대해 적절한 관리 페이지로 이동하는 액션
 * 링크를 추가한다. admin:navigate 이벤트를 통해 AdminApp 의 탭을 전환한다.
 * 이 블록만 제거하면 일반 테이블로 복원된다.
 */
interface ExceptionAction {
  /** row.label 과 매칭할 부분 문자열 */
  match: string;
  /** admin:navigate 이벤트 detail 값 */
  targetTab: string;
  label: string;
}

const exceptionActions: ExceptionAction[] = [
  { match: '중도 해지', targetTab: 'members', label: '회원 관리로 이동' },
  { match: '이월', targetTab: 'passes', label: '수강권 관리로 이동' },
  { match: '부상', targetTab: 'passes', label: '수강권 관리로 이동' },
  { match: '중복 결제', targetTab: 'passes', label: '수강권 관리로 이동' },
  { match: '현금 결제 후', targetTab: 'passes', label: '수강권 관리로 이동' },
];

function getExceptionAction(rowLabel: string): ExceptionAction | undefined {
  return exceptionActions.find(a => rowLabel.includes(a.match));
}

function handleNavigate(tab: string) {
  window.dispatchEvent(new CustomEvent('admin:navigate', { detail: tab }));
}

/* ── SKILL:quick-jump-nav ──
 * 상단 sticky 가로 스크롤 pill 네비게이션. 각 섹션 id 로 앵커 이동.
 * scroll-mt-[72px] 로 sticky 헤더(52px) + 여백 확보.
 * 이 블록만 제거하면 바로 이전 버전으로 복원 가능.
 */
const navItems = sections.map((s, i) => ({ id: s.id, index: i + 1, title: s.title }));

function scrollToSection(id: string) {
  const el = document.getElementById(`ops-section-${id}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function OperationsManual() {
  return (
    <div className="max-w-[960px]">
      {/* ── Page Heading ── */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={18} className="text-[var(--color-primary)]" />
          <h1 className="page-title">운영 매뉴얼</h1>
        </div>
        <p className="text-[13px] text-[var(--color-text-muted)]">
          슬로우 롱런 30일 멤버십 상품 구조, 결제 채널별 처리, 예외 케이스 가이드, 향후 확장 기준을 정리한 내부 운영 문서입니다.
        </p>
      </div>

      {/* ── Quick Jump Navigation ── */}
      <nav className="sticky top-[52px] md:top-[56px] z-20 -mx-3 md:-mx-0 mb-5">
        <div className="scroll-x scrollbar-hide mx-3 md:mx-0">
          <div className="flex gap-1.5 pb-1 min-w-max">
            {navItems.map(n => (
              <button
                key={n.id}
                onClick={() => scrollToSection(n.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-white text-[12.5px] font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] active:bg-[var(--color-primary-bg)] transition-colors shrink-0"
              >
                <span className="w-4 h-4 rounded-full bg-[var(--color-bg-subtle)] text-[10px] font-bold text-[var(--color-text-muted)] flex items-center justify-center tabular-nums">
                  {n.index}
                </span>
                {n.title}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Quick Reference Banner ── */}
      <div className="bg-[var(--color-primary-bg)] border border-[var(--color-primary)]/20 rounded px-5 py-4 mb-6">
        <p className="text-[13px] text-[var(--color-text)] leading-relaxed">
          <strong>핵심 요약:</strong> 단일 상품 — 월 10,000원, 30일 멤버십, 수·금 무제한. 토스 자동결제가 메인 채널이며
          운영자 개입은 예외 케이스에만 필요합니다. 모든 정책 변경은 <strong>참석 데이터</strong>를 근거로 판단합니다.
        </p>
      </div>

      {/* ── Sections ── */}
      <div className="space-y-4">
        {sections.map((section, idx) => {
          const Icon = section.icon;
          const isAdminView = section.id === 'admin-view';
          const isExceptions = section.id === 'exceptions';

          return (
            <article
              key={section.id}
              id={`ops-section-${section.id}`}
              className="bg-white border border-[var(--color-border)] rounded scroll-mt-[72px]"
            >
              <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-[var(--color-bg-subtle)] flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={15} className="text-[var(--color-text-secondary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[14.5px] font-semibold text-[var(--color-text)]">
                    {idx + 1}. {section.title}
                  </h2>
                  <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">
                    {section.summary}
                  </p>
                </div>
              </header>

              <div className="px-5 py-4">
                {/* Steps mode */}
                {section.steps && section.steps.length > 0 && !isAdminView && (
                  <ol className="space-y-3">
                    {section.steps.map((step, i) => (
                      <li key={step.title} className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-secondary)] flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-[var(--color-text)]">{step.title}</p>
                          <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{step.desc}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {/* Table mode */}
                {section.table && (
                  <div className="scroll-x">
                    <table className="responsive-table" style={{ minWidth: 480 }}>
                      <thead>
                        <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                          {section.table.headers.map((h) => (
                            <th key={h} className="text-left font-medium px-4 py-2.5">{h}</th>
                          ))}
                          {/* 예외 케이스 테이블: 액션 열 추가 */}
                          {isExceptions && (
                            <th className="text-left font-medium px-4 py-2.5">바로가기</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.rows.map((row) => {
                          const action = isExceptions ? getExceptionAction(row.label) : undefined;
                          return (
                            <tr key={row.label} className="border-b border-[var(--color-border-subtle)] last:border-b-0">
                              <td className="px-4 py-3 text-[13px] font-medium text-[var(--color-text)] whitespace-nowrap">
                                {row.label}
                              </td>
                              <td className="px-4 py-3 text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                                {row.value}
                              </td>
                              {isExceptions && (
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {action ? (
                                    <button
                                      onClick={() => handleNavigate(action.targetTab)}
                                      className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--color-primary)] hover:underline transition-colors"
                                    >
                                      <ExternalLink size={11} />
                                      {action.label}
                                    </button>
                                  ) : (
                                    <span className="text-[11.5px] text-[var(--color-text-muted)]">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Tips */}
                {section.tips && section.tips.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
                    <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">TIP</p>
                    <ul className="space-y-1">
                      {section.tips.map((tip, tipIdx) => (
                        <li key={`${section.id}-tip-${tipIdx}`} className="text-[12.5px] text-[var(--color-text-secondary)] leading-relaxed flex gap-2">
                          <span className="text-[var(--color-text-muted)] shrink-0">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ── Admin-view checklist ── */}
                {isAdminView && <AdminViewChecklist />}
              </div>
            </article>
          );
        })}
      </div>

      {/* ── Footer Note ── */}
      <div className="mt-5 p-4 bg-[var(--color-bg-hover)] rounded border border-[var(--color-border-subtle)]">
        <p className="text-[12.5px] text-[var(--color-text-muted)] leading-relaxed">
          <Settings size={12} className="inline mr-1" />
          이 매뉴얼은 운영하면서 실제 발생하는 케이스와 회원 문의를 반영해 계속 업데이트하세요.
          FAQ는 한 달 운영 후 다듬고, 예외 처리 기준은 분기마다 점검하는 것을 권장합니다.
        </p>
      </div>
    </div>
  );
}
