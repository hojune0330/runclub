'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity, Trophy, Gift, HeartPulse, Repeat, Link2, ChevronRight, Loader2,
  Compass, Database, FileText, type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import ClassFeed from './ClassFeed';
import HealthLog from './HealthLog';
import TrainingCycle from '@/components/coaching/TrainingCycle';
import IntegrationsPanel from '@/components/coaching/IntegrationsPanel';
import { MileageGuide, GlucoseGuardrailCard } from '@/components/coaching/PolicyInfo';
import type { ActivityLog, CoachingClass, TrainingPlan } from '@/types';

type HubTab = 'overview' | 'feed' | 'health' | 'cycle' | 'mileage' | 'connect';

type HubFeature = {
  id: HubTab;
  section: string;
  label: string;
  desc: string;
  code: string;
  color: string;
  icon: LucideIcon;
};

const ORACLE_BRAND = '#0D5F5A';
const INK = '#0E1412';
const HAIR = '#E8E6DF';

const ACTIVITY_LABEL: Record<string, string> = {
  run: '러닝',
  walk_run: '걷기/달리기',
  long_run: '롱런',
  interval: '인터벌',
  glucose: '혈당',
  body_comp: '체성분',
  fasting: '공복/식단',
  weight: '체중',
  custom: '기타',
};

const SOURCE_LABEL: Record<string, string> = {
  manual: '직접 입력',
  strava: 'Strava',
  garmin: 'Garmin',
  apple_health: 'Apple 건강',
  samsung_health: 'Samsung',
  barojaenfit_manual: 'BaroJaenfit',
  barojaenfit_api: 'BaroJaenfit',
  libre_cgm: 'CGM',
};

const features: HubFeature[] = [
  { id: 'feed', section: '§2', label: 'Training Log', desc: '러닝·운동·메모를 먼저 남깁니다', code: 'LOG', color: '#4A8FC7', icon: Activity },
  { id: 'cycle', section: '§3', label: '9.5-day Cycle', desc: 'MAIN / BASE / REST 흐름으로 계획합니다', code: 'CYC', color: '#B8A024', icon: Repeat },
  { id: 'health', section: '§4', label: 'Body Signal', desc: '혈당·체성분처럼 컨디션 신호를 기록합니다', code: 'SIG', color: '#C7761C', icon: HeartPulse },
  { id: 'connect', section: '§5', label: 'Data Source', desc: 'Strava·Garmin·Apple Health를 출처로 묶습니다', code: 'SRC', color: '#0D5F5A', icon: Link2 },
];

/**
 * 트레이닝 허브.
 * 독립 제품인 Train Oracle을 복제하지 않고, 런클럽 안에서는 기록·근거·다음 행동의
 * 경량 대시보드로 사용한다. 실제 분석/AI는 추후 Train Oracle 연동 지점으로 남긴다.
 */
export default function TrainingHub({ onOpenClasses }: { onOpenClasses?: () => void }) {
  const [tab, setTab] = useState<HubTab>('overview');
  const [mileage, setMileage] = useState<number | null>(null);
  const [myClasses, setMyClasses] = useState<CoachingClass[]>([]);
  const [openClasses, setOpenClasses] = useState<CoachingClass[]>([]);
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mil, mine, all, activities, trainingPlan] = await Promise.all([
        api.mileage.get().catch(() => ({ mileageBalance: 0 })),
        api.classes.list('mine').catch(() => ({ classes: [] as CoachingClass[] })),
        api.classes.list('all').catch(() => ({ classes: [] as CoachingClass[] })),
        api.activities.list({ limit: 8 }).catch(() => ({ activities: [] as ActivityLog[] })),
        api.trainingPlans.get().catch(() => ({ plan: null as TrainingPlan | null })),
      ]);
      setMileage(mil.mileageBalance ?? 0);
      setMyClasses(mine.classes);
      setRecentLogs(activities.activities ?? []);
      setPlan(trainingPlan.plan ?? null);
      const mineIds = new Set(mine.classes.map(c => c.id));
      setOpenClasses(all.classes.filter(c => !mineIds.has(c.id)));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const latestLog = recentLogs[0];
  const sourceCount = new Set(recentLogs.map(log => log.source).filter(Boolean)).size;
  const evidenceVerdict = recentLogs.length >= 3 ? 'RECOMMEND' : recentLogs.length > 0 ? 'UNC' : 'LACK';
  const evidenceConfidence = recentLogs.length >= 3 ? 74 : recentLogs.length > 0 ? 58 : 32;

  return (
    <div className="max-w-4xl space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[20px] font-bold text-[var(--color-text)] tracking-[-0.01em]">
            트레이닝 허브
          </h1>
          <span className="inline-flex items-center gap-1 border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ borderColor: '#D9D6CE', color: ORACLE_BRAND }}>
            powered by Train Oracle
          </span>
        </div>
        <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          세션 예약 앱 안에서는 가볍게 씁니다. 핵심은 <strong className="text-[var(--color-text)]">기록 → 근거 → 다음 행동</strong>입니다.
          정밀 분석과 AI 코칭은 추후 독립 Train Oracle과 연결합니다.
        </p>
      </header>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {([
          ['overview', 'Overview', Compass],
          ['feed', 'Log', Activity],
          ['cycle', 'Cycle', Repeat],
          ['health', 'Signal', HeartPulse],
          ['connect', 'Source', Link2],
          ['mileage', 'Mileage', Gift],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 -mb-px whitespace-nowrap transition-colors',
              tab === id ? 'border-[var(--color-primary)] text-[var(--color-text)] font-semibold' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]')}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <section className="border bg-white p-4 md:p-5" style={{ borderColor: '#D9D6CE', boxShadow: 'inset 0 1px 0 #FAFAF7' }}>
            <SectionHeader no="§1" title="Today · 기록에서 시작" action="Train Oracle preview" />
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-3">
                <div className="border-l-2 pl-3" style={{ borderColor: ORACLE_BRAND }}>
                  <p className="text-[15px] font-semibold text-[var(--color-text)]">
                    {latestLog ? `${formatDate(latestLog.activityDate)} · ${ACTIVITY_LABEL[latestLog.kind] ?? latestLog.kind}` : '오늘 첫 기록을 남겨주세요'}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
                    {latestLog
                      ? `${SOURCE_LABEL[latestLog.source] ?? latestLog.source} 출처의 기록을 기준으로 다음 훈련 판단에 사용할 수 있어요.`
                      : '14일 이상 기록이 쌓이면 권장 강도와 회복 판단의 신뢰도가 올라갑니다.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-0 border" style={{ borderColor: HAIR }}>
                  <MetricCell label="Mileage" value={loading ? '—' : `${(mileage ?? 0).toLocaleString()}P`} />
                  <MetricCell label="Recent logs" value={loading ? '—' : `${recentLogs.length}건`} />
                  <MetricCell label="My classes" value={loading ? '—' : `${myClasses.length}개`} />
                  <MetricCell label="Sources" value={loading ? '—' : `${sourceCount || 1}종`} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setTab('feed')} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-2 text-[13px] font-semibold text-white hover:bg-[var(--color-primary-hover)]">
                    <Activity size={14} /> 기록 남기기
                  </button>
                  <button onClick={() => setTab('connect')} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]">
                    <Database size={14} /> 데이터 출처 연결
                  </button>
                </div>
              </div>
              <OracleVerdict verdict={evidenceVerdict} confidence={evidenceConfidence} hasPlan={!!plan} logCount={recentLogs.length} />
            </div>
          </section>

          <section className="border bg-white p-4" style={{ borderColor: '#D9D6CE' }}>
            <SectionHeader no="§2" title="9.5-day cycle · 런클럽 경량 버전" />
            <div className="mt-4">
              <CycleRail plan={plan} />
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
              Train Oracle의 핵심 개념인 9.5일 사이클을 이 앱에서는 계획 템플릿으로만 제공합니다. MAIN, BASE, LT, REST 같은 용어를 먼저 익히고 실제 처방은 코치 판단과 향후 연동으로 확장합니다.
            </p>
          </section>

          <section className="grid gap-2.5 sm:grid-cols-2">
            {features.map(f => (
              <button key={f.id} onClick={() => setTab(f.id)}
                className="group border bg-white p-3.5 text-left transition-colors hover:border-[var(--color-primary)]"
                style={{ borderColor: '#D9D6CE' }}>
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{f.section}</span>
                    <span className="mt-1 flex items-center gap-2 text-[13.5px] font-semibold text-[var(--color-text)]">
                      <span className="h-2 w-2 rounded-full" style={{ background: f.color }} />
                      {f.label}
                    </span>
                    <span className="mt-1 block text-[12px] leading-relaxed text-[var(--color-text-secondary)]">{f.desc}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]">
                    {f.code} <ChevronRight size={13} />
                  </span>
                </span>
              </button>
            ))}
          </section>

          <TrainingClassPanel loading={loading} myClasses={myClasses} openClasses={openClasses} onOpenClasses={onOpenClasses} />

          <section className="border bg-white p-4" style={{ borderColor: '#D9D6CE' }}>
            <SectionHeader no="§6" title="Mileage · 보조 지표" />
            <div className="mt-3 grid gap-3 md:grid-cols-[140px_1fr] md:items-start">
              <div className="border px-3 py-2 text-center" style={{ borderColor: HAIR }}>
                <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Balance</p>
                <p className="mt-1 font-mono text-[22px] font-semibold text-[var(--color-text)]">{(mileage ?? 0).toLocaleString()}P</p>
              </div>
              <MileageGuide compact />
            </div>
          </section>
        </div>
      )}

      {tab === 'feed' && <ClassFeed />}
      {tab === 'cycle' && <TrainingCycle />}
      {tab === 'health' && (
        <div className="space-y-4">
          <PersonalHealthHint />
          <HealthLog />
          <GlucoseGuardrailCard />
        </div>
      )}
      {tab === 'connect' && <IntegrationsPanel />}
      {tab === 'mileage' && (
        <div className="space-y-4">
          <div className="border bg-white p-4 text-center" style={{ borderColor: '#D9D6CE' }}>
            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">현재 보유 마일리지</p>
            <p className="mt-1 font-mono text-[28px] font-semibold text-[var(--color-text)] tabular-nums">{(mileage ?? 0).toLocaleString()}P</p>
          </div>
          <section className="rounded-md bg-white border border-[var(--color-border)] p-4"><MileageGuide /></section>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ no, title, action }: { no: string; title: string; action?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b pb-2" style={{ borderColor: HAIR }}>
      <h2 className="flex items-baseline gap-2 text-[14px] font-semibold text-[var(--color-text)]">
        <span className="font-mono text-[11px] font-medium text-[var(--color-text-muted)]">{no}</span>
        {title}
      </h2>
      {action && <span className="hidden sm:inline font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{action}</span>}
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r px-3 py-2 last:border-r-0 even:border-r-0 [&:nth-child(n+3)]:border-b-0" style={{ borderColor: HAIR }}>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 font-mono text-[17px] font-semibold text-[var(--color-text)] tabular-nums">{value}</p>
    </div>
  );
}

function OracleVerdict({ verdict, confidence, hasPlan, logCount }: { verdict: 'RECOMMEND' | 'UNC' | 'LACK'; confidence: number; hasPlan: boolean; logCount: number }) {
  const meta = verdict === 'RECOMMEND'
    ? { label: 'RECOMMEND', text: '기록이 쌓이고 있어 다음 행동을 제안할 수 있습니다.' }
    : verdict === 'UNC'
      ? { label: 'UNC', text: '아직 신호가 적어 코치 판단과 함께 보는 것이 좋습니다.' }
      : { label: 'LACK', text: '분석보다 기록 축적이 우선입니다.' };

  return (
    <div className="border p-3.5" style={{ borderColor: HAIR, background: '#FAFAF7' }}>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center border px-2 py-0.5 font-mono text-[11px] font-semibold" style={{ borderColor: ORACLE_BRAND, color: ORACLE_BRAND }}>{meta.label}</span>
        <span className="font-mono text-[11px] text-[var(--color-text-muted)]">confidence {confidence}%</span>
      </div>
      <p className="mt-3 text-[13.5px] font-semibold text-[var(--color-text)]">Train Oracle 미리보기</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">{meta.text}</p>
      <dl className="mt-3 space-y-1.5 text-[12px] text-[var(--color-text-secondary)]">
        <div className="flex justify-between gap-3"><dt>근거</dt><dd className="font-mono text-[var(--color-text)]">log {logCount} · plan {hasPlan ? 'yes' : 'no'}</dd></div>
        <div className="flex justify-between gap-3"><dt>다음 행동</dt><dd className="text-right text-[var(--color-text)]">기록 또는 9.5일 계획 생성</dd></div>
        <div className="border-l-2 pl-2 text-[11.5px] leading-relaxed" style={{ borderColor: INK }}>
          다른 관점: 기록이 적을수록 자동 권장보다 주관 컨디션과 코치 판단을 우선합니다.
        </div>
      </dl>
    </div>
  );
}

function CycleRail({ plan }: { plan: TrainingPlan | null }) {
  const slots = [
    { d: 'D-1', code: 'REC', color: '#7A7A70' },
    { d: 'D-2', code: 'BASE', color: '#4A8FC7' },
    { d: 'D-3', code: 'BASE', color: '#4A8FC7' },
    { d: 'D-4', code: 'BASE+', color: '#4A8FC7' },
    { d: 'D-5', code: 'MAIN', color: '#C7761C' },
    { d: 'D-6', code: 'REC', color: '#7A7A70' },
    { d: 'D-7', code: 'LT', color: '#B8A024' },
    { d: 'D-8', code: 'BASE', color: '#4A8FC7' },
    { d: 'D-9', code: 'REST', color: '#7A7A70' },
    { d: 'D-.5', code: 'TR', color: '#0D5F5A' },
  ];
  const active = plan?.cyclePosition == null ? -1 : Math.min(9, Math.max(0, Math.floor(plan.cyclePosition)));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {slots.map((slot, index) => {
          const isActive = index === active;
          return (
            <div key={`${slot.d}-${slot.code}`} className={cn('border px-2 py-2', isActive && 'ring-1 ring-[var(--color-text)]')} style={{ borderColor: HAIR }}>
              <div className="flex items-center justify-between gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: slot.color }} />
                <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{slot.d}</span>
              </div>
              <p className="mt-1.5 font-mono text-[10.5px] font-semibold text-[var(--color-text)]">{slot.code}</p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--color-text-secondary)]">
        <span>현재 계획: <strong className="text-[var(--color-text)]">{plan?.name ?? '개인 9.5일 계획 없음'}</strong></span>
        {plan?.todayBlock && <span>오늘 블록: <strong className="text-[var(--color-text)]">{plan.todayBlock.label}</strong></span>}
      </div>
    </div>
  );
}

function TrainingClassPanel({
  loading,
  myClasses,
  openClasses,
  onOpenClasses,
}: {
  loading: boolean;
  myClasses: CoachingClass[];
  openClasses: CoachingClass[];
  onOpenClasses?: () => void;
}) {
  return (
    <section className="border bg-white p-4" style={{ borderColor: '#D9D6CE' }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <SectionTitle icon={Trophy} title="§5 Coaching class" />
        {onOpenClasses && (
          <button onClick={onOpenClasses} className="inline-flex items-center gap-0.5 text-[12.5px] font-medium text-[var(--color-primary)]">
            전체 보기 <ChevronRight size={13} />
          </button>
        )}
      </div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
        클래스는 팀 경쟁보다 운영자가 목표, 과제, 주기, 건강 신호를 관리하는 공간으로 정리했습니다.
      </p>
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-[var(--color-text-muted)]" /></div>
      ) : (myClasses.length + openClasses.length) === 0 ? (
        <p className="py-1 text-[12px] text-[var(--color-text-muted)]">아직 열린 클래스가 없습니다. 개인 기록부터 시작해도 됩니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {myClasses.slice(0, 2).map(c => (
            <li key={c.id} className="flex items-center justify-between gap-2 border px-3 py-2" style={{ borderColor: HAIR }}>
              <span className="truncate text-[13px] text-[var(--color-text)]">{c.name}</span>
              <span className="shrink-0 border px-2 py-0.5 text-[11px]" style={{ borderColor: ORACLE_BRAND, color: ORACLE_BRAND }}>참여 중</span>
            </li>
          ))}
          {openClasses.slice(0, 3).map(c => (
            <li key={c.id} className="flex items-center justify-between gap-2 border px-3 py-2" style={{ borderColor: HAIR }}>
              <span className="truncate text-[13px] text-[var(--color-text)]">{c.name}</span>
              <button onClick={onOpenClasses} className="shrink-0 text-[11.5px] text-[var(--color-primary)]">자세히 →</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--color-text)]">
      <Icon size={15} className="text-[var(--color-primary)]" /> {title}
    </h2>
  );
}

function PersonalHealthHint() {
  return (
    <div className="flex items-start gap-2 border bg-white p-3 text-[12px] leading-relaxed text-[var(--color-text-secondary)]" style={{ borderColor: '#D9D6CE' }}>
      <FileText size={13} className="mt-0.5 shrink-0" style={{ color: ORACLE_BRAND }} />
      <span>
        혈당·체성분은 의료 진단이 아니라 훈련 판단을 보조하는 신호입니다. 수치보다 같은 조건에서 꾸준히 남긴 기록의 흐름을 봅니다.
      </span>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return '날짜 없음';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(d);
}
