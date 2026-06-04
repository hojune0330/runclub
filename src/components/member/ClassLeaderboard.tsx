'use client';

import { useEffect, useState, useCallback } from 'react';
import { Trophy, Loader2, Medal, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { LeaderboardResult } from '@/types';

const METRIC_OPTIONS = [
  { value: 'distance', label: '거리' },
  { value: 'mileage', label: '마일리지' },
  { value: 'attendance', label: '출석' },
  { value: 'homework', label: '과제 달성률' },
];

function rankColor(rank: number): string {
  if (rank === 1) return 'text-amber-500';
  if (rank === 2) return 'text-slate-400';
  if (rank === 3) return 'text-orange-400';
  return 'text-[var(--color-text-muted)]';
}

export default function ClassLeaderboard({ classId, defaultMetric }: { classId: string; defaultMetric?: string }) {
  const [metric, setMetric] = useState(defaultMetric || 'distance');
  const [data, setData] = useState<LeaderboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.classes.leaderboard(classId, { metric });
      setData(res);
    } catch (e: any) {
      setErr(e?.message ?? '리더보드를 불러오지 못했어요');
    } finally {
      setLoading(false);
    }
  }, [classId, metric]);

  useEffect(() => { void load(); }, [load]);

  const maxTeamTotal = data?.teams.reduce((mx, t) => Math.max(mx, t.total), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {METRIC_OPTIONS.map(o => (
          <button key={o.value} onClick={() => setMetric(o.value)}
            className={cn('px-2.5 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
              metric === o.value ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-white text-[var(--color-text-secondary)] border-[var(--color-border)]')}>
            {o.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" /></div>
      ) : err ? (
        <p className="text-[12.5px] text-[var(--color-text-muted)] py-6 text-center">{err}</p>
      ) : data ? (
        <>
          {/* 팀 비교 */}
          {data.teams.length > 0 && (
            <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
              <h3 className="text-[13px] font-semibold text-[var(--color-text)] flex items-center gap-1.5 mb-3">
                <Users size={14} className="text-[var(--color-primary)]" /> 팀 비교 · {data.metricLabel}
              </h3>
              <ul className="space-y-2.5">
                {data.teams.map((t, i) => (
                  <li key={t.teamId}>
                    <div className="flex items-center justify-between text-[12.5px] mb-1">
                      <span className="inline-flex items-center gap-1.5 text-[var(--color-text)]">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color || 'var(--color-primary)' }} />
                        {i === 0 && <Trophy size={12} className="text-amber-500" />}
                        {t.teamName} <span className="text-[var(--color-text-muted)]">({t.memberCount}명)</span>
                      </span>
                      <strong className="text-[var(--color-text)]">{t.displayTotal}</strong>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--color-bg-subtle)] overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: maxTeamTotal > 0 ? `${Math.max(4, (t.total / maxTeamTotal) * 100)}%` : '4%', background: t.color || 'var(--color-primary)' }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 개인 랭킹 */}
          <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
            <h3 className="text-[13px] font-semibold text-[var(--color-text)] flex items-center gap-1.5 mb-2">
              <Medal size={14} className="text-[var(--color-primary)]" /> 개인 랭킹 · {data.metricLabel}
            </h3>
            {data.individuals.length === 0 ? (
              <p className="text-[12.5px] text-[var(--color-text-muted)] py-3">아직 집계된 기록이 없어요. 활동을 기록하면 순위에 반영돼요!</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border-subtle)]">
                {data.individuals.map(row => (
                  <li key={row.memberId} className={cn('flex items-center justify-between py-2.5 px-1 rounded',
                    row.isMe && 'bg-[var(--color-primary-bg)]/50 -mx-1 px-2')}>
                    <span className="flex items-center gap-3 min-w-0">
                      <span className={cn('w-6 text-center text-[13px] font-bold tabular-nums', rankColor(row.rank))}>{row.rank}</span>
                      <span className="text-[13px] text-[var(--color-text)] truncate">
                        {row.memberName}{row.isMe && <span className="ml-1 text-[11px] text-[var(--color-primary)]">나</span>}
                        {row.teamName && <span className="ml-1.5 text-[11px] text-[var(--color-text-muted)]">· {row.teamName}</span>}
                      </span>
                    </span>
                    <strong className="text-[13px] text-[var(--color-text)] tabular-nums">{row.displayValue}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.periodStart && (
            <p className="text-[11px] text-[var(--color-text-muted)] text-center">
              집계 기간: {data.periodStart} ~ {data.periodEnd ?? '현재'}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
