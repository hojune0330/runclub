'use client';

/**
 * 정책 설명 UI (재사용 컴포넌트 모음).
 *
 * 마일리지 적립 규칙 / 혈당 가드레일 / 외부 연동 안내를
 * "보기 좋게" 보여주는 컴포넌트들. 회원·관리자·구매(클래스 소개)
 * 어느 화면에서든 그대로 가져다 쓸 수 있도록 src/lib/policy.ts 의
 * 단일 소스 데이터를 읽어서 렌더링한다.
 */

import { useState } from 'react';
import {
  Footprints, Route, ClipboardCheck, ShieldCheck, Percent, EyeOff, HeartPulse,
  Info, X, Gift, Sparkles, Link2, Clock, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MILEAGE_RULES, MILEAGE_USAGE_NOTE,
  GLUCOSE_GUARDRAILS, GLUCOSE_GUARDRAIL_SHORT, GLUCOSE_TARGET_LABEL,
  INTEGRATION_PROVIDERS, INTEGRATION_PRINCIPLE_NOTE,
  type MileageRule, type GuardrailPoint,
} from '@/lib/policy';

const MILEAGE_ICON = { Footprints, Route, ClipboardCheck } as const;
const GUARD_ICON = { ShieldCheck, Percent, EyeOff, HeartPulse } as const;

/* ──────────────────────────────────────────
 * 마일리지 적립 안내
 * ────────────────────────────────────────── */

/** 마일리지 규칙 카드 1개 */
function MileageRuleCard({ rule, compact }: { rule: MileageRule; compact?: boolean }) {
  const Icon = MILEAGE_ICON[rule.icon];
  return (
    <div className="flex items-start gap-3 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] p-3">
      <div className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13.5px] font-semibold text-[var(--color-text)]">{rule.title}</span>
          <span className="shrink-0 px-2 py-0.5 rounded-full text-[12px] font-bold text-[var(--color-primary)] bg-[var(--color-primary-bg)]">
            {rule.pointsLabel}
          </span>
        </div>
        <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5">{rule.summary}</p>
        {!compact && (
          <>
            <p className="text-[12px] text-[var(--color-text-muted)] mt-1.5 leading-relaxed">{rule.detail}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {rule.conditions.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] bg-white border border-[var(--color-border-subtle)] rounded-full px-2 py-0.5">
                  <Check size={10} className="text-[var(--color-primary)]" /> {c}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 마일리지 적립 가이드(전체) — 카드형 */
export function MileageGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Gift size={15} className="text-[var(--color-primary)]" />
        <h3 className="text-[13.5px] font-semibold text-[var(--color-text)]">마일리지 적립 방법</h3>
      </div>
      <div className="space-y-2">
        {MILEAGE_RULES.map(r => <MileageRuleCard key={r.id} rule={r} compact={compact} />)}
      </div>
      <p className="text-[11.5px] text-[var(--color-text-muted)] flex items-start gap-1 mt-1">
        <Info size={12} className="mt-0.5 shrink-0" /> {MILEAGE_USAGE_NOTE}
      </p>
    </div>
  );
}

/** 마일리지 요약 배지(한 줄, 작게) */
export function MileagePolicyBadge() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
      <span className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
        <Sparkles size={12} className="text-[var(--color-primary)]" /> 적립:
      </span>
      {MILEAGE_RULES.map(r => (
        <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)] px-2 py-0.5 font-medium">
          {r.title} {r.pointsLabel}
        </span>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────
 * 혈당(건강) 가드레일 안내
 * ────────────────────────────────────────── */

function GuardrailRow({ g }: { g: GuardrailPoint }) {
  const Icon = GUARD_ICON[g.icon];
  return (
    <li className="flex items-start gap-2.5">
      <div className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-emerald-50 text-emerald-600">
        <Icon size={15} />
      </div>
      <div>
        <p className="text-[12.5px] font-semibold text-[var(--color-text)]">{g.title}</p>
        <p className="text-[12px] text-[var(--color-text-secondary)] leading-relaxed mt-0.5">{g.text}</p>
      </div>
    </li>
  );
}

/** 혈당 가드레일 카드(전체) */
export function GlucoseGuardrailCard() {
  return (
    <section className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <ShieldCheck size={15} className="text-emerald-600" />
        <h3 className="text-[13.5px] font-semibold text-[var(--color-text)]">혈당·건강 데이터 보호 안내</h3>
      </div>
      <p className="text-[11.5px] text-emerald-700 mb-3">
        목표 범위 <strong>{GLUCOSE_TARGET_LABEL}</strong> · 비의료 일반 가이드라인
      </p>
      <ul className="space-y-3">
        {GLUCOSE_GUARDRAILS.map((g, i) => <GuardrailRow key={i} g={g} />)}
      </ul>
    </section>
  );
}

/** 혈당 가드레일 한 줄 배지(작게) */
export function GlucoseGuardrailBadge() {
  return (
    <p className="inline-flex items-start gap-1.5 text-[11.5px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5">
      <ShieldCheck size={13} className="mt-0.5 shrink-0" />
      <span>{GLUCOSE_GUARDRAIL_SHORT}</span>
    </p>
  );
}

/* ──────────────────────────────────────────
 * 외부 연동 안내
 * ────────────────────────────────────────── */

/** 연동 제공자 안내(목록형, 읽기 전용 안내) */
export function IntegrationGuide({ filterCategory }: { filterCategory?: 'run' | 'health' | 'glucose' }) {
  const list = filterCategory
    ? INTEGRATION_PROVIDERS.filter(p => p.category === filterCategory || p.id === 'manual')
    : INTEGRATION_PROVIDERS;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Link2 size={15} className="text-[var(--color-primary)]" />
        <h3 className="text-[13.5px] font-semibold text-[var(--color-text)]">데이터 연동</h3>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {list.map(p => (
          <li key={p.id} className="flex items-start gap-2.5 rounded-md border border-[var(--color-border-subtle)] bg-white p-3">
            <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[var(--color-text)]">{p.name}</span>
                {p.status === 'available' ? (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                    <Check size={9} /> 사용 가능
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                    <Clock size={9} /> 준비 중
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">{p.desc}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11.5px] text-[var(--color-text-muted)] flex items-start gap-1">
        <Info size={12} className="mt-0.5 shrink-0" /> {INTEGRATION_PRINCIPLE_NOTE}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────
 * 통합 정책 모달 + 트리거 버튼
 * ────────────────────────────────────────── */

type PolicyTab = 'mileage' | 'integration' | 'glucose';

export function PolicyInfoModal({
  onClose,
  initialTab = 'mileage',
  showGlucose = false,
}: { onClose: () => void; initialTab?: PolicyTab; showGlucose?: boolean }) {
  const [tab, setTab] = useState<PolicyTab>(initialTab);
  const tabs: { id: PolicyTab; label: string }[] = [
    { id: 'mileage', label: '마일리지' },
    { id: 'integration', label: '데이터 연동' },
    ...(showGlucose ? [{ id: 'glucose' as const, label: '건강 보호' }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-lg rounded-t-2xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="sticky top-0 bg-white border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[var(--color-text)] flex items-center gap-1.5">
            <Info size={16} className="text-[var(--color-primary)]" /> 클래스 안내
          </h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={18} /></button>
        </header>

        <div className="flex items-center gap-1 px-4 border-b border-[var(--color-border)]">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors',
                tab === t.id ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]')}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'mileage' && <MileageGuide />}
          {tab === 'integration' && <IntegrationGuide />}
          {tab === 'glucose' && <GlucoseGuardrailCard />}
        </div>
      </div>
    </div>
  );
}

/** "안내 보기" 작은 트리거 버튼 + 모달 (어디서든 한 줄로 삽입) */
export function PolicyInfoButton({
  label = '적립·연동 안내',
  initialTab = 'mileage',
  showGlucose = false,
  className,
}: { label?: string; initialTab?: PolicyTab; showGlucose?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className={cn('inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-primary)] hover:underline', className)}>
        <Info size={13} /> {label}
      </button>
      {open && <PolicyInfoModal onClose={() => setOpen(false)} initialTab={initialTab} showGlucose={showGlucose} />}
    </>
  );
}
