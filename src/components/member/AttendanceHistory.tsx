'use client';

import { useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { reservationStatusConfig, sessionTypeConfig } from '@/lib/config';
import {
  formatKoreanDate,
  cn,
  format,
  parseISO,
  getMonthlyAttendance,
  calculateWeeklyStreak,
} from '@/lib/utils';
import { Flame, TrendingUp, Calendar as CalIcon, ClipboardList } from 'lucide-react';

export default function AttendanceHistory() {
  const { reservations, sessions, currentMember } = useApp();

  const myHistory = useMemo(() => {
    return reservations
      .filter(r => r.memberId === currentMember.id && (r.status === 'attended' || r.status === 'noshow'))
      .map(r => ({
        ...r,
        session: r.session || sessions.find(s => s.id === r.sessionId),
      }))
      .sort((a, b) => (b.session?.date || '').localeCompare(a.session?.date || ''));
  }, [reservations, sessions, currentMember.id]);

  const attended = myHistory.filter(r => r.status === 'attended').length;
  const noshow = myHistory.filter(r => r.status === 'noshow').length;
  const total = myHistory.length;
  const rate = total > 0 ? Math.round((attended / total) * 100) : 0;

  const attendedDates = myHistory
    .filter(r => r.status === 'attended' && r.session)
    .map(r => r.session!.date);
  const streak = useMemo(() => calculateWeeklyStreak(attendedDates), [attendedDates]);

  const monthlyChart = useMemo(
    () =>
      getMonthlyAttendance(
        myHistory.filter(r => r.session).map(r => ({ date: r.session!.date, status: r.status })),
        6
      ),
    [myHistory]
  );
  const maxBar = Math.max(1, ...monthlyChart.map(m => m.attended + m.noshow));

  const grouped = useMemo(() => {
    const groups: Record<string, typeof myHistory> = {};
    myHistory.forEach(r => {
      if (!r.session) return;
      const month = r.session.date.substring(0, 7);
      if (!groups[month]) groups[month] = [];
      groups[month].push(r);
    });
    return groups;
  }, [myHistory]);

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Page heading */}
      <div>
        <h1 className="page-title">출석 이력</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          참여한 세션의 출석 기록을 확인할 수 있습니다.
        </p>
      </div>

      {/* KPI cards */}
      <div className="kpi-grid-4">
        <SummaryCard label="출석" value={attended} suffix="회" icon={CalIcon} />
        <SummaryCard label="노쇼" value={noshow} suffix="회" tone={noshow > 0 ? 'danger' : 'default'} />
        <SummaryCard
          label="출석률"
          value={rate}
          suffix="%"
          tone={rate >= 80 ? 'success' : 'default'}
          icon={TrendingUp}
        />
        <SummaryCard
          label="연속 출석"
          value={streak}
          suffix="주"
          tone={streak >= 3 ? 'success' : 'default'}
          icon={Flame}
        />
      </div>

      {/* Monthly chart */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">최근 6개월 추이</h2>
          <div className="flex items-center gap-3 text-[11.5px] text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-[var(--color-primary)]" /> 출석
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-[var(--color-danger)] opacity-70" /> 노쇼
            </span>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-end gap-3 h-[140px] px-2">
            {monthlyChart.map(m => {
              const sum = m.attended + m.noshow;
              const barH = sum === 0 ? 4 : (sum / maxBar) * 120;
              const attH = sum === 0 ? 0 : (m.attended / sum) * barH;
              const noH = sum === 0 ? 0 : (m.noshow / sum) * barH;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                    {sum > 0 ? `${m.rate}%` : '—'}
                  </span>
                  <div
                    className="w-full max-w-[44px] rounded-t relative flex flex-col justify-end overflow-hidden bg-[var(--color-bg-hover)]"
                    style={{ height: `${barH}px`, minHeight: '4px' }}
                    title={`${m.label}: 출석 ${m.attended}회, 노쇼 ${m.noshow}회`}
                  >
                    {m.noshow > 0 && (
                      <div
                        className="w-full"
                        style={{ height: `${noH}px`, backgroundColor: 'var(--color-danger)', opacity: 0.7 }}
                      />
                    )}
                    <div
                      className="w-full"
                      style={{ height: `${attH}px`, backgroundColor: 'var(--color-primary)' }}
                    />
                  </div>
                  <div className="text-center">
                    <span className="block text-[11.5px] text-[var(--color-text-secondary)] tabular-nums">
                      {m.label}
                    </span>
                    <span className="block text-[10.5px] text-[var(--color-text-muted)] tabular-nums">
                      {sum}회
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* History */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">월별 출석 내역</h2>
          <span className="text-[12px] text-[var(--color-text-muted)]">
            {Object.keys(grouped).length}개월
          </span>
        </div>

        {Object.keys(grouped).length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
              <ClipboardList size={18} className="text-[var(--color-text-muted)]" />
            </div>
            <p className="text-[13.5px] text-[var(--color-text)] font-medium mb-1">아직 출석 기록이 없어요</p>
            <p className="text-[12.5px] text-[var(--color-text-muted)] max-w-[400px] mx-auto leading-relaxed">
              세션에 참여하시면 월별 출석률·연속 출석 주가 자동으로 집계돼요.
            </p>
          </div>
        ) : (
          <div>
            {Object.entries(grouped).map(([month, items]) => {
              const monthAttended = items.filter(i => i.status === 'attended').length;
              const monthNoshow = items.filter(i => i.status === 'noshow').length;
              return (
                <div key={month}>
                  <div className="bg-[var(--color-bg-subtle)] px-4 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-[var(--color-text)] tabular-nums">
                      {format(parseISO(month + '-01'), 'yyyy년 M월')}
                    </p>
                    <div className="flex items-center gap-3 text-[12px]">
                      <span className="text-[var(--color-success)]">
                        출석 {monthAttended}
                      </span>
                      {monthNoshow > 0 && (
                        <span className="text-[var(--color-danger)]">노쇼 {monthNoshow}</span>
                      )}
                    </div>
                  </div>
                  <div className="scroll-x">
                  <table className="responsive-table" style={{ minWidth: 640 }}>
                    <thead>
                      <tr className="border-b border-[var(--color-border-subtle)] text-[12px] text-[var(--color-text-muted)]">
                        <th className="text-left font-medium px-4 py-2 w-[140px]">날짜</th>
                        <th className="text-left font-medium px-4 py-2 w-[80px]">시간</th>
                        <th className="text-left font-medium px-4 py-2 w-[120px]">유형</th>
                        <th className="text-left font-medium px-4 py-2">세션명</th>
                        <th className="text-right font-medium px-4 py-2 w-[100px]">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(r => {
                        if (!r.session) return null;
                        const config = sessionTypeConfig[r.session.type];
                        const statusConf = reservationStatusConfig[r.status];
                        return (
                          <tr
                            key={r.id}
                            className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)] transition-colors"
                          >
                            <td className="px-4 py-3 text-[var(--color-text)] tabular-nums">
                              {formatKoreanDate(r.session.date, 'M월 d일 (EEE)')}
                            </td>
                            <td className="px-4 py-3 text-[var(--color-text-secondary)] tabular-nums">
                              {r.session.startTime}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium"
                                style={{ backgroundColor: config.bgColor, color: config.textColor }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: config.color }}
                                />
                                {config.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[var(--color-text)]">{r.session.name}</td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium"
                                style={{
                                  backgroundColor: statusConf.bgColor,
                                  color: statusConf.color,
                                }}
                              >
                                {statusConf.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  suffix,
  tone = 'default',
  icon: Icon,
}: {
  label: string;
  value: number;
  suffix: string;
  tone?: 'default' | 'success' | 'danger';
  icon?: typeof Flame;
}) {
  const color =
    tone === 'success'
      ? 'text-[var(--color-success)]'
      : tone === 'danger'
      ? 'text-[var(--color-danger)]'
      : 'text-[var(--color-text)]';
  const iconColor =
    tone === 'success'
      ? 'text-[var(--color-success)]'
      : tone === 'danger'
      ? 'text-[var(--color-danger)]'
      : 'text-[var(--color-text-muted)]';
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] text-[var(--color-text-secondary)] font-medium">{label}</p>
        {Icon && <Icon size={15} className={iconColor} />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn('kpi-num', color)}>
          {value}
        </span>
        <span className="text-[13px] text-[var(--color-text-muted)]">{suffix}</span>
      </div>
    </div>
  );
}
