'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity, Trophy, Gift, HeartPulse, Repeat, Link2, ChevronRight, Loader2,
  Sparkles, Target, Compass, Coins,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import ClassFeed from './ClassFeed';
import HealthLog from './HealthLog';
import TrainingCycle from '@/components/coaching/TrainingCycle';
import IntegrationsPanel from '@/components/coaching/IntegrationsPanel';
import { MileageGuide, GlucoseGuardrailCard } from '@/components/coaching/PolicyInfo';
import type { CoachingClass } from '@/types';

type HubTab = 'overview' | 'feed' | 'health' | 'cycle' | 'mileage' | 'connect';

/**
 * 코칭 허브 ("트레이닝").
 * 클래스 수강 여부와 무관하게 **모든 회원**이 활동 기록·리더보드·마일리지·건강관리·
 * 외부 연동·주기화를 직접 써보고 발견할 수 있는 공간.
 *
 * onOpenClasses: 코칭 클래스 화면으로 이동(상위 MemberApp 탭 전환).
 */
export default function TrainingHub({ onOpenClasses }: { onOpenClasses?: () => void }) {
  const [tab, setTab] = useState<HubTab>('overview');
  const [mileage, setMileage] = useState<number | null>(null);
  const [myClasses, setMyClasses] = useState<CoachingClass[]>([]);
  const [openClasses, setOpenClasses] = useState<CoachingClass[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mil, mine, all] = await Promise.all([
        api.mileage.get().catch(() => ({ mileageBalance: 0 })),
        api.classes.list('mine').catch(() => ({ classes: [] as CoachingClass[] })),
        api.classes.list('all').catch(() => ({ classes: [] as CoachingClass[] })),
      ]);
      setMileage(mil.mileageBalance ?? 0);
      setMyClasses(mine.classes);
      const mineIds = new Set(mine.classes.map(c => c.id));
      setOpenClasses(all.classes.filter(c => !mineIds.has(c.id)));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const features: { id: HubTab; label: string; desc: string; icon: typeof Activity; color: string }[] = [
    { id: 'feed', label: '활동 기록', desc: '러닝·운동을 기록하고 마일리지 적립', icon: Activity, color: '#0ea5e9' },
    { id: 'cycle', label: '주기화 트레이닝', desc: '9.5일 같은 나만의 사이클 설계', icon: Repeat, color: '#8b5cf6' },
    { id: 'health', label: '건강 관리', desc: '혈당·체성분 기록과 목표 범위 관리', icon: HeartPulse, color: '#22c55e' },
    { id: 'connect', label: '데이터 연동', desc: 'Strava 등 자동으로 기록 가져오기', icon: Link2, color: '#fc4c02' },
    { id: 'mileage', label: '마일리지', desc: '적립 방법과 내역 확인', icon: Gift, color: '#f59e0b' },
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <h1 className="text-[20px] font-bold text-[var(--color-text)] flex items-center gap-2">
          <Sparkles size={20} className="text-[var(--color-primary)]" /> 트레이닝
        </h1>
        <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">
          클래스를 듣지 않아도 괜찮아요. 활동을 기록하고, 마일리지를 모으고, 건강을 관리해보세요.
        </p>
      </header>

      {/* 탭 바 */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] overflow-x-auto">
        {([
          ['overview', '둘러보기', Compass],
          ['feed', '활동', Activity],
          ['cycle', '주기화', Repeat],
          ['health', '건강', HeartPulse],
          ['connect', '연동', Link2],
          ['mileage', '마일리지', Gift],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 -mb-px whitespace-nowrap transition-colors',
              tab === id ? 'border-[var(--color-primary)] text-[var(--color-text)] font-medium' : 'border-transparent text-[var(--color-text-muted)]')}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          {/* 마일리지 요약 배너 */}
          <div className="rounded-md bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-hover)] text-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] opacity-90 inline-flex items-center gap-1"><Coins size={13} /> 내 마일리지</p>
                <p className="text-[26px] font-bold mt-0.5 tabular-nums">{loading ? '—' : (mileage ?? 0).toLocaleString()}<span className="text-[15px] font-medium ml-0.5">P</span></p>
              </div>
              <button onClick={() => setTab('feed')}
                className="inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded-full px-3 py-1.5 text-[12.5px] font-medium">
                <Activity size={13} /> 활동 기록하고 적립
              </button>
            </div>
          </div>

          {/* 기능 발견 카드 — '눌러보면 이런 게 있구나' */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {features.map(f => (
              <button key={f.id} onClick={() => setTab(f.id)}
                className="flex items-start gap-3 text-left bg-white border border-[var(--color-border)] rounded-md p-3.5 hover:border-[var(--color-primary)] hover:shadow-sm transition-all group">
                <span className="grid place-items-center w-10 h-10 rounded-full shrink-0" style={{ background: f.color + '1a', color: f.color }}>
                  <f.icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between">
                    <span className="text-[13.5px] font-semibold text-[var(--color-text)]">{f.label}</span>
                    <ChevronRight size={15} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors" />
                  </span>
                  <span className="block text-[12px] text-[var(--color-text-muted)] mt-0.5">{f.desc}</span>
                </span>
              </button>
            ))}
          </div>

          {/* 클래스 안내 — 더 깊게 가고 싶다면 */}
          <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[14px] font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                <Trophy size={15} className="text-[var(--color-primary)]" /> 코칭 클래스
              </h2>
              {onOpenClasses && (
                <button onClick={onOpenClasses} className="text-[12.5px] text-[var(--color-primary)] font-medium inline-flex items-center gap-0.5">
                  전체 보기 <ChevronRight size={13} />
                </button>
              )}
            </div>
            <p className="text-[12.5px] text-[var(--color-text-secondary)] mb-2.5">
              팀과 함께 목표에 도전하고 리더보드로 경쟁하고 싶다면, 코치가 운영하는 클래스에 참여해보세요.
            </p>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-[var(--color-text-muted)]" /></div>
            ) : (myClasses.length + openClasses.length) === 0 ? (
              <p className="text-[12px] text-[var(--color-text-muted)] py-1">아직 열린 클래스가 없어요. 곧 새로운 클래스가 열릴 거예요!</p>
            ) : (
              <ul className="space-y-1.5">
                {myClasses.slice(0, 2).map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-2 border border-[var(--color-border-subtle)] rounded px-3 py-2">
                    <span className="text-[13px] text-[var(--color-text)] truncate">{c.name}</span>
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 shrink-0">참여 중</span>
                  </li>
                ))}
                {openClasses.slice(0, 3).map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-2 border border-[var(--color-border-subtle)] rounded px-3 py-2">
                    <span className="text-[13px] text-[var(--color-text)] truncate">{c.name}</span>
                    <button onClick={onOpenClasses} className="text-[11.5px] text-[var(--color-primary)] shrink-0">자세히 →</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 마일리지 적립 방법(안내) */}
          <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
            <MileageGuide />
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
          <div className="rounded-md bg-[var(--color-primary-bg)] p-4 text-center">
            <p className="text-[12px] text-[var(--color-text-secondary)]">현재 보유 마일리지</p>
            <p className="text-[28px] font-bold text-[var(--color-primary)] tabular-nums mt-0.5">{(mileage ?? 0).toLocaleString()}P</p>
          </div>
          <section className="bg-white border border-[var(--color-border)] rounded-md p-4"><MileageGuide /></section>
        </div>
      )}
    </div>
  );
}

function PersonalHealthHint() {
  return (
    <div className="rounded-md bg-emerald-50/60 border border-emerald-200 p-3 text-[12px] text-emerald-800 flex items-start gap-1.5">
      <Target size={13} className="mt-0.5 shrink-0" />
      혈당·체성분을 기록하면 “목표 범위 비율”로 내 컨디션 흐름을 볼 수 있어요. 상세 수치는 나만 볼 수 있습니다.
    </div>
  );
}
