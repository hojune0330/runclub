'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Flame,
  Ticket,
  Target,
  TrendingUp,
  Share2,
  ArrowRight,
  Trophy,
  Clock,
  MapPin,
  UserPlus,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import {
  cn,
  format,
  parseISO,
  formatKoreanDate,
  getDaysUntilExpiry,
  calculateWeeklyStreak,
  getMonthlyAttendance,
  getWeeklyHeatmap,
} from '@/lib/utils';
import { sessionTypeConfig } from '@/lib/config';
import InviteModal from './InviteModal';

export default function Overview() {
  const { reservations, sessions, memberPasses, currentMember } = useApp();
  const [inviteOpen, setInviteOpen] = useState(false);

  // ── My attendance records ──
  const myHistory = useMemo(() => {
    return reservations
      .filter(r => r.memberId === currentMember.id && (r.status === 'attended' || r.status === 'noshow'))
      .map(r => ({
        ...r,
        session: r.session || sessions.find(s => s.id === r.sessionId),
      }))
      .filter(r => r.session)
      .sort((a, b) => (a.session!.date).localeCompare(b.session!.date));
  }, [reservations, sessions, currentMember.id]);

  // ── Upcoming reservations ──
  const today = format(new Date(), 'yyyy-MM-dd');
  const upcoming = useMemo(() => {
    return reservations
      .filter(r => r.memberId === currentMember.id && r.status === 'reserved')
      .map(r => ({
        ...r,
        session: r.session || sessions.find(s => s.id === r.sessionId),
      }))
      .filter(r => r.session && r.session.date >= today)
      .sort((a, b) => {
        const da = a.session!.date + a.session!.startTime;
        const db = b.session!.date + b.session!.startTime;
        return da.localeCompare(db);
      });
  }, [reservations, sessions, currentMember.id, today]);

  // ── Stats ──
  const totalAttended = myHistory.filter(r => r.status === 'attended').length;
  const totalNoshow = myHistory.filter(r => r.status === 'noshow').length;
  const totalRecords = totalAttended + totalNoshow;
  const attendanceRate = totalRecords > 0 ? Math.round((totalAttended / totalRecords) * 100) : 0;

  // This month stats
  const thisMonth = format(new Date(), 'yyyy-MM');
  const thisMonthRecords = myHistory.filter(r => r.session!.date.startsWith(thisMonth));
  const thisMonthAttended = thisMonthRecords.filter(r => r.status === 'attended').length;
  const thisMonthNoshow = thisMonthRecords.filter(r => r.status === 'noshow').length;
  const thisMonthRate =
    thisMonthRecords.length > 0
      ? Math.round((thisMonthAttended / thisMonthRecords.length) * 100)
      : 0;

  // Streak
  const attendedDates = myHistory
    .filter(r => r.status === 'attended')
    .map(r => r.session!.date);
  const streak = calculateWeeklyStreak(attendedDates);

  // Monthly chart data (last 6 months)
  const monthly = useMemo(
    () =>
      getMonthlyAttendance(
        myHistory.map(r => ({ date: r.session!.date, status: r.status })),
        6
      ),
    [myHistory]
  );

  // Heatmap (last 12 weeks)
  const heatmap = useMemo(() => getWeeklyHeatmap(attendedDates, 12), [attendedDates]);
  const maxHeatmap = Math.max(1, ...heatmap.flatMap(w => w.days.map(d => d.count)));

  // Session type breakdown
  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    myHistory
      .filter(r => r.status === 'attended')
      .forEach(r => {
        counts[r.session!.type] = (counts[r.session!.type] || 0) + 1;
      });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(counts)
      .map(([type, count]) => ({
        type,
        count,
        percent: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [myHistory]);

  // Active passes
  const activePasses = memberPasses.filter(p => p.memberId === currentMember.id && p.status === 'active');

  const navigate = (tab: string) => {
    window.dispatchEvent(new CustomEvent('member:navigate', { detail: tab }));
  };

  // ── Achievement badge ──
  const achievements: { icon: typeof Trophy; label: string; earned: boolean; hint: string }[] = [
    {
      icon: Trophy,
      label: '첫 출석',
      earned: totalAttended >= 1,
      hint: '세션 첫 참여 완료',
    },
    {
      icon: Flame,
      label: '3주 연속',
      earned: streak >= 3,
      hint: '3주 연속 출석',
    },
    {
      icon: Target,
      label: '10회 출석',
      earned: totalAttended >= 10,
      hint: '누적 10회 달성',
    },
    {
      icon: TrendingUp,
      label: '출석률 80%',
      earned: totalRecords >= 5 && attendanceRate >= 80,
      hint: '5회 이상 & 80% 이상',
    },
  ];

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Greeting */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--color-text)]">
            안녕하세요, {currentMember.name}님 👋
          </h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
            {formatKoreanDate(new Date(), 'yyyy년 M월 d일 EEEE')} · 오늘도 좋은 러닝 되세요!
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="h-11 md:h-9 inline-flex items-center gap-1.5 px-3.5 rounded-md text-[13px] font-medium bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white transition-colors"
        >
          <UserPlus size={14} />
          친구 초대
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          icon={Flame}
          label="연속 출석"
          value={streak}
          suffix="주"
          hint={streak > 0 ? `${streak}주째 이어가는 중 🔥` : '이번 주 출석하고 시작해보세요'}
          tone={streak >= 3 ? 'highlight' : 'default'}
        />
        <KpiCard
          icon={CalendarDays}
          label="이번 달 출석"
          value={thisMonthAttended}
          suffix="회"
          hint={
            thisMonthRecords.length > 0
              ? `출석률 ${thisMonthRate}% · 노쇼 ${thisMonthNoshow}`
              : '아직 출석 기록이 없어요'
          }
        />
        <KpiCard
          icon={Target}
          label="누적 출석"
          value={totalAttended}
          suffix="회"
          hint={`전체 출석률 ${attendanceRate}%`}
        />
        <KpiCard
          icon={Ticket}
          label="이용 가능 수강권"
          value={activePasses.length}
          suffix="개"
          hint={
            activePasses.length > 0
              ? activePasses[0].category === 'count'
                ? `${activePasses[0].productName} · 잔여 ${activePasses[0].remainingCount}회`
                : activePasses[0].productName
              : '수강권을 등록해주세요'
          }
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Monthly chart */}
        <Panel
          title="최근 6개월 출석"
          action={`총 ${monthly.reduce((a, m) => a + m.attended, 0)}회`}
          className="col-span-2"
        >
          <div className="p-4">
            <MonthlyBarChart data={monthly} />
          </div>
        </Panel>

        {/* Session type breakdown */}
        <Panel title="세션 유형" action={totalAttended > 0 ? `${totalAttended}회` : undefined}>
          <div className="p-4">
            {typeBreakdown.length === 0 ? (
              <p className="text-[13px] text-[var(--color-text-muted)] text-center py-6">
                출석 기록이 쌓이면 표시돼요.
              </p>
            ) : (
              <ul className="space-y-3">
                {typeBreakdown.map(t => {
                  const config = sessionTypeConfig[t.type as keyof typeof sessionTypeConfig];
                  return (
                    <li key={t.type}>
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
                          style={{ color: config.textColor }}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: config.color }}
                          />
                          {config.label}
                        </span>
                        <span className="text-[12px] text-[var(--color-text-secondary)] tabular-nums">
                          {t.count}회 · {t.percent}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${t.percent}%`, backgroundColor: config.color }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>
      </div>

      {/* Heatmap + Upcoming */}
      <div className="grid grid-cols-3 gap-4">
        <Panel title="최근 12주 출석 히트맵" className="col-span-2">
          <div className="p-4">
            <HeatmapView heatmap={heatmap} max={maxHeatmap} />
            <div className="flex items-center justify-between mt-3 text-[11.5px] text-[var(--color-text-muted)]">
              <span>{heatmap[0]?.weekStart ? formatKoreanDate(heatmap[0].weekStart, 'M.d') : ''}</span>
              <div className="flex items-center gap-1">
                <span>적음</span>
                {[0, 1, 2, 3].map(i => (
                  <span
                    key={i}
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{
                      backgroundColor:
                        i === 0
                          ? 'var(--color-bg-hover)'
                          : `rgba(37, 99, 235, ${0.3 + i * 0.23})`,
                    }}
                  />
                ))}
                <span>많음</span>
              </div>
              <span>오늘</span>
            </div>
          </div>
        </Panel>

        {/* Upcoming */}
        <Panel
          title="다가올 예약"
          action={upcoming.length > 0 ? `${upcoming.length}건` : undefined}
        >
          <div className="p-3">
            {upcoming.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[13px] text-[var(--color-text-muted)] mb-3">
                  예정된 예약이 없습니다.
                </p>
                <button
                  onClick={() => navigate('calendar')}
                  className="inline-flex items-center justify-center gap-1 min-h-9 px-3 text-[12.5px] text-[var(--color-primary)] hover:underline font-medium"
                >
                  세션 예약하기 <ArrowRight size={12} />
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {upcoming.slice(0, 3).map(r => {
                  const s = r.session!;
                  const config = sessionTypeConfig[s.type];
                  return (
                    <li
                      key={r.id}
                      className="border border-[var(--color-border-subtle)] rounded-md p-2.5 hover:bg-[var(--color-bg-subtle)] transition-colors cursor-pointer"
                      onClick={() => navigate('reservations')}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
                          style={{ backgroundColor: config.bgColor, color: config.textColor }}
                        >
                          <span
                            className="w-1 h-1 rounded-full"
                            style={{ backgroundColor: config.color }}
                          />
                          {config.label}
                        </span>
                        <span className="text-[12px] text-[var(--color-text-muted)] tabular-nums">
                          {formatKoreanDate(s.date, 'M.d (EEE)')}
                        </span>
                      </div>
                      <p className="text-[13px] font-medium text-[var(--color-text)] mb-1">
                        {s.name}
                      </p>
                      <div className="flex items-center gap-3 text-[11.5px] text-[var(--color-text-muted)]">
                        <span className="inline-flex items-center gap-0.5 tabular-nums">
                          <Clock size={10} /> {s.startTime}
                        </span>
                        {s.location && (
                          <span className="inline-flex items-center gap-0.5 truncate">
                            <MapPin size={10} /> {s.location}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
                {upcoming.length > 3 && (
                  <button
                    onClick={() => navigate('reservations')}
                    className="w-full text-[12px] text-[var(--color-primary)] hover:underline py-1.5 text-center"
                  >
                    +{upcoming.length - 3}건 더 보기
                  </button>
                )}
              </ul>
            )}
          </div>
        </Panel>
      </div>

      {/* Achievements + Pass */}
      <div className="grid grid-cols-3 gap-4">
        {/* Achievements */}
        <Panel title="배지" action={`${achievements.filter(a => a.earned).length}/${achievements.length}`} className="col-span-2">
          <div className="p-4 grid grid-cols-4 gap-3">
            {achievements.map(a => {
              const Icon = a.icon;
              return (
                <div
                  key={a.label}
                  className={cn(
                    'border rounded-md p-3 text-center transition-colors',
                    a.earned
                      ? 'bg-[var(--color-primary-bg)] border-[var(--color-primary-border)]'
                      : 'bg-[var(--color-bg-subtle)] border-[var(--color-border-subtle)] opacity-70'
                  )}
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center mx-auto mb-1.5',
                      a.earned
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'
                    )}
                  >
                    <Icon size={16} />
                  </div>
                  <p
                    className={cn(
                      'text-[12.5px] font-medium',
                      a.earned ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
                    )}
                  >
                    {a.label}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{a.hint}</p>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Pass summary */}
        <Panel title="내 수강권">
          <div className="p-3">
            {activePasses.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[13px] text-[var(--color-text-muted)] mb-3">
                  활성 수강권이 없습니다.
                </p>
                <button
                  onClick={() => navigate('passes')}
                  className="inline-flex items-center gap-1 text-[12.5px] text-[var(--color-primary)] hover:underline font-medium"
                >
                  수강권 보기 <ArrowRight size={12} />
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {activePasses.slice(0, 2).map(p => {
                  const daysLeft = getDaysUntilExpiry(p);
                  const lowRemaining = p.category === 'count' && (p.remainingCount ?? 0) <= 3;
                  const lowDays = daysLeft <= 7;
                  return (
                    <li
                      key={p.id}
                      className="border border-[var(--color-border-subtle)] rounded-md p-2.5"
                    >
                      <p className="text-[13px] font-medium text-[var(--color-text)] mb-1 truncate">
                        {p.productName}
                      </p>
                      {p.category === 'count' && (
                        <div className="mb-1.5">
                          <div className="flex items-center justify-between text-[11.5px] mb-0.5">
                            <span className="text-[var(--color-text-muted)]">잔여</span>
                            <span
                              className={cn(
                                'tabular-nums font-medium',
                                lowRemaining
                                  ? 'text-[var(--color-warning)]'
                                  : 'text-[var(--color-text)]'
                              )}
                            >
                              {p.remainingCount}/{p.totalCount}회
                            </span>
                          </div>
                          <div className="h-1 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${
                                  ((p.remainingCount ?? 0) / (p.totalCount ?? 1)) * 100
                                }%`,
                                backgroundColor: lowRemaining
                                  ? 'var(--color-warning)'
                                  : 'var(--color-primary)',
                              }}
                            />
                          </div>
                        </div>
                      )}
                      <p
                        className={cn(
                          'text-[11.5px] tabular-nums',
                          lowDays ? 'text-[var(--color-warning)] font-medium' : 'text-[var(--color-text-muted)]'
                        )}
                      >
                        {formatKoreanDate(p.expiryDate, 'yyyy.M.d')} 만료 · D-{daysLeft}
                      </p>
                    </li>
                  );
                })}
                <button
                  onClick={() => navigate('passes')}
                  className="w-full text-[12.5px] text-[var(--color-primary)] hover:underline py-2.5 text-center inline-flex items-center justify-center gap-1"
                >
                  전체 보기 <ArrowRight size={11} />
                </button>
              </ul>
            )}
          </div>
        </Panel>
      </div>

      {/* Invite banner */}
      <section className="bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)] rounded-md p-5 flex items-center justify-between">
        <div className="flex items-center gap-3 text-white">
          <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
            <Share2 size={18} />
          </div>
          <div>
            <p className="text-[14px] font-semibold">친구와 함께 달려요</p>
            <p className="text-[12.5px] text-white/85 mt-0.5">
              초대 링크를 공유하면 친구도 런클럽에 가입할 수 있어요.
            </p>
          </div>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="h-11 md:h-9 px-4 rounded-md text-[13px] font-medium bg-white text-[var(--color-primary)] hover:bg-white/90 transition-colors shrink-0"
        >
          초대 링크 만들기
        </button>
      </section>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}

// ─── Monthly bar chart ───
function MonthlyBarChart({
  data,
}: {
  data: { month: string; label: string; attended: number; noshow: number; rate: number }[];
}) {
  const max = Math.max(1, ...data.map(d => d.attended + d.noshow));
  return (
    <div className="flex items-end gap-3 h-[160px] px-2">
      {data.map(d => {
        const total = d.attended + d.noshow;
        const barHeight = total === 0 ? 4 : (total / max) * 130;
        const attendedHeight = total === 0 ? 0 : (d.attended / total) * barHeight;
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
              {total > 0 ? `${d.rate}%` : '—'}
            </span>
            <div
              className="w-full max-w-[40px] rounded-t relative flex flex-col justify-end overflow-hidden"
              style={{ height: `${barHeight}px`, minHeight: '4px' }}
              title={`${d.label}: 출석 ${d.attended}회, 노쇼 ${d.noshow}회`}
            >
              {d.noshow > 0 && (
                <div
                  className="w-full"
                  style={{
                    height: `${((d.noshow / total) * barHeight)}px`,
                    backgroundColor: 'var(--color-danger)',
                    opacity: 0.7,
                  }}
                />
              )}
              <div
                className="w-full"
                style={{
                  height: `${attendedHeight}px`,
                  backgroundColor: 'var(--color-primary)',
                }}
              />
              {total === 0 && (
                <div
                  className="w-full"
                  style={{ height: '4px', backgroundColor: 'var(--color-border-subtle)' }}
                />
              )}
            </div>
            <span className="text-[11.5px] text-[var(--color-text-secondary)] tabular-nums">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Heatmap ───
function HeatmapView({
  heatmap,
  max,
}: {
  heatmap: { weekStart: string; days: { date: string; count: number; dayOfWeek: number }[] }[];
  max: number;
}) {
  const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
  const today = format(new Date(), 'yyyy-MM-dd');
  return (
    <div className="flex gap-1">
      <div className="flex flex-col gap-[3px] pr-1.5 pt-1">
        {dayLabels.map((l, i) => (
          <span
            key={l}
            className={cn(
              'text-[10px] leading-[14px] h-[14px] text-[var(--color-text-muted)]',
              i % 2 !== 0 ? 'opacity-0' : ''
            )}
          >
            {l}
          </span>
        ))}
      </div>
      <div className="flex gap-[3px] overflow-x-auto">
        {heatmap.map(week => (
          <div key={week.weekStart} className="flex flex-col gap-[3px]">
            {week.days.map(d => {
              const ratio = d.count / max;
              const isFuture = d.date > today;
              const isToday = d.date === today;
              const bg = isFuture
                ? 'transparent'
                : d.count === 0
                ? 'var(--color-bg-hover)'
                : `rgba(37, 99, 235, ${0.3 + ratio * 0.7})`;
              return (
                <div
                  key={d.date}
                  title={`${d.date} · 출석 ${d.count}회`}
                  className={cn(
                    'w-[14px] h-[14px] rounded-sm',
                    isToday && 'ring-1 ring-[var(--color-primary)] ring-offset-1',
                    isFuture && 'border border-dashed border-[var(--color-border-subtle)]'
                  )}
                  style={{ backgroundColor: bg }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── UI Primitives ───
function KpiCard({
  icon: Icon,
  label,
  value,
  suffix,
  hint,
  tone = 'default',
}: {
  icon: typeof Flame;
  label: string;
  value: number;
  suffix: string;
  hint?: string;
  tone?: 'default' | 'highlight';
}) {
  return (
    <div
      className={cn(
        'bg-white border rounded-md p-4',
        tone === 'highlight'
          ? 'border-[var(--color-primary-border)] bg-[var(--color-primary-bg)]'
          : 'border-[var(--color-border)]'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] text-[var(--color-text-secondary)] font-medium">{label}</span>
        <Icon
          size={16}
          className={
            tone === 'highlight'
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-text-muted)]'
          }
        />
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            'text-[30px] font-semibold leading-none tabular-nums tracking-tight',
            tone === 'highlight' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'
          )}
        >
          {value}
        </span>
        <span className="text-[13px] text-[var(--color-text-muted)]">{suffix}</span>
      </div>
      {hint && <p className="text-[12px] text-[var(--color-text-muted)] mt-2 truncate">{hint}</p>}
    </div>
  );
}

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'bg-white border border-[var(--color-border)] rounded-md overflow-hidden',
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">{title}</h2>
        {action && <span className="text-[12px] text-[var(--color-text-muted)]">{action}</span>}
      </div>
      {children}
    </section>
  );
}
