'use client';

import { useMemo, useEffect, useState } from 'react';
import {
  Users,
  Calendar as CalIcon,
  TrendingUp,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  Activity,
  Bell,
  UserPlus,
  PlusCircle,
  QrCode,
  Megaphone,
  Clock,
  AlertCircle,
  CheckCircle2,
  TimerReset,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig } from '@/lib/config';
import {
  formatKoreanDate,
  isPassExpiringSoon,
  cn,
  format,
  getDaysUntilExpiry,
  parseISO,
} from '@/lib/utils';

export default function Dashboard() {
  const { sessions, members, memberPasses, reservations } = useApp();
  const [now, setNow] = useState(() => new Date());

  // Live clock (updates every 30s for the live banner)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const today = format(now, 'yyyy-MM-dd');
  const nowHM = format(now, 'HH:mm');

  // ── Sessions ──
  const todaySessions = useMemo(
    () =>
      sessions
        .filter(s => s.date === today)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [sessions, today]
  );

  const runningSessions = todaySessions.filter(
    s => s.startTime <= nowHM && (s.endTime || '23:59') >= nowHM
  );
  const upcomingTodaySessions = todaySessions.filter(s => s.startTime > nowHM);
  const finishedTodaySessions = todaySessions.filter(
    s => (s.endTime || '23:59') < nowHM
  );

  // Next session banner
  const nextSession = upcomingTodaySessions[0];
  const nowSession = runningSessions[0];

  // ── Members & passes ──
  const activeMembers = members.filter(m => m.isActive).length;
  const expiringPasses = memberPasses.filter(
    p => p.status === 'active' && isPassExpiringSoon(p, 7)
  );
  const lowCountPasses = memberPasses.filter(
    p => p.status === 'active' && p.category === 'count' && (p.remainingCount ?? 0) <= 2
  );
  const recentMembers = members
    .filter(m => m.isActive)
    .sort((a, b) => b.joinDate.localeCompare(a.joinDate))
    .slice(0, 5);

  // Recent joins count (last 7 days)
  const sevenDaysAgo = format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd');
  const recentJoinCount = members.filter(m => m.joinDate >= sevenDaysAgo).length;

  // ── Weekly stats ──
  const weekStartDate = new Date(now);
  weekStartDate.setDate(now.getDate() - 7);
  const weekStart = format(weekStartDate, 'yyyy-MM-dd');
  const prevWeekStartDate = new Date(now);
  prevWeekStartDate.setDate(now.getDate() - 14);
  const prevWeekStart = format(prevWeekStartDate, 'yyyy-MM-dd');

  const thisWeekReservations = reservations.filter(r => {
    const session = r.session || sessions.find(s => s.id === r.sessionId);
    return session && session.date >= weekStart && session.date <= today;
  });
  const prevWeekReservations = reservations.filter(r => {
    const session = r.session || sessions.find(s => s.id === r.sessionId);
    return session && session.date >= prevWeekStart && session.date < weekStart;
  });
  const attendedCount = thisWeekReservations.filter(r => r.status === 'attended').length;
  const noshowCount = thisWeekReservations.filter(r => r.status === 'noshow').length;
  const totalEligible = attendedCount + noshowCount;
  const weeklyAttendanceRate = totalEligible > 0 ? Math.round((attendedCount / totalEligible) * 100) : 0;

  const prevAttended = prevWeekReservations.filter(r => r.status === 'attended').length;
  const prevEligible = prevWeekReservations.filter(
    r => r.status === 'attended' || r.status === 'noshow'
  ).length;
  const prevWeeklyRate = prevEligible > 0 ? Math.round((prevAttended / prevEligible) * 100) : 0;
  const rateDelta = weeklyAttendanceRate - prevWeeklyRate;

  // Daily reservation sparkline (last 14 days)
  const sparkline = useMemo(() => {
    const days: { date: string; count: number; label: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = format(d, 'yyyy-MM-dd');
      const count = reservations.filter(r => {
        const s = r.session || sessions.find(x => x.id === r.sessionId);
        return s && s.date === key;
      }).length;
      days.push({ date: key, count, label: format(d, 'M/d') });
    }
    return days;
  }, [reservations, sessions, now]);

  // Capacity alerts (sessions nearly full today / tomorrow)
  const tomorrow = format(new Date(now.getTime() + 86400000), 'yyyy-MM-dd');
  const capacityAlerts = sessions.filter(
    s =>
      (s.date === today || s.date === tomorrow) &&
      s.maxCapacity > 0 &&
      s.currentReservations / s.maxCapacity >= 0.8 &&
      s.currentReservations < s.maxCapacity
  );

  // Pending no-shows (today, still 'reserved' but session already ended)
  const pendingNoshows = reservations.filter(r => {
    const s = r.session || sessions.find(x => x.id === r.sessionId);
    return (
      r.status === 'reserved' &&
      s &&
      s.date === today &&
      (s.endTime || '23:59') < nowHM
    );
  }).length;

  // ── Notifications / Alerts ──
  type AlertItem = {
    id: string;
    type: 'danger' | 'warning' | 'info';
    icon: typeof AlertTriangle;
    title: string;
    desc: string;
    action?: { label: string; tab: string };
  };
  const alerts: AlertItem[] = [];
  if (expiringPasses.length > 0) {
    alerts.push({
      id: 'expiring',
      type: 'warning',
      icon: TimerReset,
      title: `수강권 만료 임박 ${expiringPasses.length}건`,
      desc: '7일 이내 만료되는 수강권이 있습니다.',
      action: { label: '수강권 관리', tab: 'passes' },
    });
  }
  if (lowCountPasses.length > 0) {
    alerts.push({
      id: 'low-count',
      type: 'warning',
      icon: AlertCircle,
      title: `잔여 회수 부족 ${lowCountPasses.length}건`,
      desc: '2회 이하 남은 회수권 회원에게 안내하세요.',
      action: { label: '수강권 관리', tab: 'passes' },
    });
  }
  if (capacityAlerts.length > 0) {
    alerts.push({
      id: 'capacity',
      type: 'info',
      icon: Users,
      title: `정원 임박 세션 ${capacityAlerts.length}건`,
      desc: '오늘·내일 정원의 80% 이상 찬 세션입니다.',
      action: { label: '세션 관리', tab: 'sessions' },
    });
  }
  if (pendingNoshows > 0) {
    alerts.push({
      id: 'noshow',
      type: 'danger',
      icon: AlertTriangle,
      title: `출석 미처리 예약 ${pendingNoshows}건`,
      desc: '종료된 세션 중 출석·노쇼 처리가 남아있습니다.',
      action: { label: '출석 QR', tab: 'qr' },
    });
  }

  const navigate = (tab: string) => {
    // Emits an event that AdminApp can listen for programmatic navigation
    window.dispatchEvent(new CustomEvent('admin:navigate', { detail: tab }));
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 max-w-[1500px]">
      {/* ── MAIN COLUMN ── */}
      <div className="space-y-6 min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-[var(--color-text)]">대시보드</h1>
            <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
              {formatKoreanDate(now, 'yyyy년 M월 d일 EEEE')} · 현재 {nowHM}
            </p>
          </div>
          <QuickActions onNavigate={navigate} />
        </div>

        {/* Live banner */}
        <LiveBanner
          running={runningSessions}
          next={nextSession}
          finished={finishedTodaySessions.length}
          total={todaySessions.length}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            icon={Users}
            label="활성 회원"
            value={activeMembers}
            suffix="명"
            hint={`전체 ${members.length}명${
              recentJoinCount > 0 ? ` · 최근 7일 +${recentJoinCount}` : ''
            }`}
          />
          <KpiCard
            icon={CalIcon}
            label="오늘 세션"
            value={todaySessions.length}
            suffix="개"
            hint={
              todaySessions.length === 0
                ? '예정 없음'
                : nowSession
                ? `진행중 · ${nowSession.startTime}`
                : nextSession
                ? `다음 ${nextSession.startTime}`
                : `종료 ${finishedTodaySessions.length}개`
            }
          />
          <KpiCard
            icon={TrendingUp}
            label="주간 출석률"
            value={weeklyAttendanceRate}
            suffix="%"
            hint={`최근 7일 · ${attendedCount}/${totalEligible}건${
              noshowCount > 0 ? ` · 노쇼 ${noshowCount}` : ''
            }`}
            delta={totalEligible > 0 || prevEligible > 0 ? rateDelta : undefined}
            deltaSuffix="%p"
          />
          <KpiCard
            icon={AlertTriangle}
            label="만료 임박 수강권"
            value={expiringPasses.length}
            suffix="건"
            hint="7일 이내 만료"
            tone={expiringPasses.length > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* Sparkline panel */}
        <Panel
          title="최근 14일 예약 추이"
          action={`총 ${sparkline.reduce((a, d) => a + d.count, 0)}건`}
        >
          <div className="p-4">
            <Sparkline data={sparkline} />
          </div>
        </Panel>

        {/* Today sessions */}
        <Panel
          title="오늘의 세션"
          action={todaySessions.length > 0 ? `${todaySessions.length}개 세션` : undefined}
        >
          {todaySessions.length === 0 ? (
            <EmptyState message="오늘 예정된 세션이 없습니다." />
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                  <th className="text-left font-medium px-4 py-2.5 w-[68px]">상태</th>
                  <th className="text-left font-medium px-4 py-2.5 w-[80px]">시간</th>
                  <th className="text-left font-medium px-4 py-2.5 w-[110px]">유형</th>
                  <th className="text-left font-medium px-4 py-2.5">세션명</th>
                  <th className="text-left font-medium px-4 py-2.5">장소</th>
                  <th className="text-right font-medium px-4 py-2.5 w-[140px]">예약/정원</th>
                </tr>
              </thead>
              <tbody>
                {todaySessions.map(s => {
                  const config = sessionTypeConfig[s.type];
                  const ratio = s.maxCapacity > 0 ? (s.currentReservations / s.maxCapacity) * 100 : 0;
                  const full = s.currentReservations >= s.maxCapacity;
                  const running = s.startTime <= nowHM && (s.endTime || '23:59') >= nowHM;
                  const finished = (s.endTime || '23:59') < nowHM;
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        'border-b border-[var(--color-border-subtle)] last:border-0 transition-colors',
                        running
                          ? 'bg-[var(--color-primary-bg)]/50 hover:bg-[var(--color-primary-bg)]'
                          : 'hover:bg-[var(--color-bg-subtle)]'
                      )}
                    >
                      <td className="px-4 py-3">
                        {running ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--color-success-bg)] text-[var(--color-success)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                            진행중
                          </span>
                        ) : finished ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]">
                            종료
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
                            예정
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text)] font-medium tabular-nums">
                        {s.startTime}
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
                      <td className="px-4 py-3 text-[var(--color-text)]">{s.name}</td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {s.location || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span
                            className={cn(
                              'text-[12px] tabular-nums',
                              full
                                ? 'text-[var(--color-danger)]'
                                : ratio >= 80
                                ? 'text-[var(--color-warning)]'
                                : 'text-[var(--color-text)]'
                            )}
                          >
                            {s.currentReservations} / {s.maxCapacity}
                          </span>
                          <div className="w-12 h-1.5 bg-[var(--color-bg-hover)] rounded overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${Math.min(100, ratio)}%`,
                                backgroundColor: full
                                  ? 'var(--color-danger)'
                                  : ratio >= 80
                                  ? 'var(--color-warning)'
                                  : config.color,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        {/* Recent + Expiring */}
        <div className="grid grid-cols-2 gap-4">
          <Panel title="최근 가입 회원" action={`${recentMembers.length}명`}>
            {recentMembers.length === 0 ? (
              <EmptyState message="최근 가입한 회원이 없습니다." />
            ) : (
              <ul className="divide-y divide-[var(--color-border-subtle)]">
                {recentMembers.map(m => (
                  <li key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center shrink-0">
                      <span className="text-[12px] text-[var(--color-text-secondary)] font-medium">
                        {m.name.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[var(--color-text)] truncate">{m.name}</p>
                      <p className="text-[12px] text-[var(--color-text-muted)]">{m.phone}</p>
                    </div>
                    <span className="text-[12px] text-[var(--color-text-muted)] tabular-nums">
                      {formatKoreanDate(m.joinDate, 'M.d')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="만료 임박 수강권" action="7일 이내">
            {expiringPasses.length === 0 ? (
              <EmptyState message="만료가 임박한 수강권이 없습니다." />
            ) : (
              <ul className="divide-y divide-[var(--color-border-subtle)]">
                {expiringPasses.slice(0, 6).map(p => {
                  const daysLeft = getDaysUntilExpiry(p);
                  return (
                    <li key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[var(--color-text)] truncate">
                          {p.memberName}
                        </p>
                        <p className="text-[11.5px] text-[var(--color-text-muted)] truncate">
                          {p.productName}
                          {p.category === 'count' && ` · ${p.remainingCount}/${p.totalCount}회`}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium tabular-nums shrink-0',
                          daysLeft <= 3
                            ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)]'
                            : 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]'
                        )}
                      >
                        D-{daysLeft}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* ── RIGHT COLUMN: Notifications ── */}
      <aside className="space-y-4 min-w-0">
        <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden xl:sticky xl:top-[76px]">
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Bell size={14} className="text-[var(--color-text-muted)]" />
              <h2 className="text-[14px] font-semibold text-[var(--color-text)]">알림 센터</h2>
            </div>
            <span
              className={cn(
                'text-[11px] tabular-nums px-1.5 py-0.5 rounded-full',
                alerts.length > 0
                  ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                  : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'
              )}
            >
              {alerts.length}건
            </span>
          </div>
          {alerts.length === 0 ? (
            <div className="py-8 text-center px-4">
              <CheckCircle2 size={24} className="text-[var(--color-success)] mx-auto mb-2" />
              <p className="text-[13px] text-[var(--color-text)] font-medium mb-0.5">
                모든 것이 정상입니다
              </p>
              <p className="text-[12px] text-[var(--color-text-muted)]">
                처리할 알림이 없어요.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {alerts.map(a => {
                const Icon = a.icon;
                const toneBg =
                  a.type === 'danger'
                    ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                    : a.type === 'warning'
                    ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
                    : 'bg-[var(--color-primary-bg)] text-[var(--color-primary)]';
                return (
                  <li key={a.id} className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <div
                        className={cn(
                          'w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5',
                          toneBg
                        )}
                      >
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[var(--color-text)]">
                          {a.title}
                        </p>
                        <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
                          {a.desc}
                        </p>
                        {a.action && (
                          <button
                            onClick={() => navigate(a.action!.tab)}
                            className="mt-1.5 inline-flex items-center min-h-[36px] md:min-h-0 px-2 md:px-0 -mx-2 md:mx-0 text-[12.5px] font-medium text-[var(--color-primary)] hover:underline"
                          >
                            {a.action.label} →
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Today's quick stat */}
        <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center gap-1.5">
            <Activity size={14} className="text-[var(--color-text-muted)]" />
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">오늘 현황</h2>
          </div>
          <div className="p-4 space-y-3">
            <StatRow label="진행중" value={runningSessions.length} suffix="개" dotColor="var(--color-success)" />
            <StatRow label="예정" value={upcomingTodaySessions.length} suffix="개" dotColor="var(--color-primary)" />
            <StatRow label="종료" value={finishedTodaySessions.length} suffix="개" dotColor="var(--color-text-muted)" />
            <div className="border-t border-[var(--color-border-subtle)] pt-3">
              <StatRow
                label="금주 누적 출석"
                value={attendedCount}
                suffix="회"
                emphasis
              />
              <StatRow
                label="금주 노쇼"
                value={noshowCount}
                suffix="회"
                dotColor="var(--color-danger)"
              />
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

// ───────── Sub-components ─────────

function LiveBanner({
  running,
  next,
  finished,
  total,
}: {
  running: { id: string; name: string; startTime: string; endTime?: string; type: 'ebw' | 'slowrun' | 'marathon'; location: string; currentReservations: number; maxCapacity: number }[];
  next?: { id: string; name: string; startTime: string; type: 'ebw' | 'slowrun' | 'marathon'; location: string; currentReservations: number; maxCapacity: number };
  finished: number;
  total: number;
}) {
  if (total === 0) {
    return (
      <section className="bg-white border border-dashed border-[var(--color-border)] rounded-md p-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--color-bg-subtle)] flex items-center justify-center">
          <CalIcon size={16} className="text-[var(--color-text-muted)]" />
        </div>
        <div>
          <p className="text-[13.5px] font-medium text-[var(--color-text)]">
            오늘 예정된 세션이 없습니다
          </p>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
            세션 관리 탭에서 일정을 추가해보세요.
          </p>
        </div>
      </section>
    );
  }

  if (running.length > 0) {
    const s = running[0];
    const config = sessionTypeConfig[s.type];
    return (
      <section
        className="border rounded-md p-4 flex items-center gap-4"
        style={{
          backgroundColor: config.bgColor,
          borderColor: config.color + '40',
        }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ backgroundColor: 'var(--color-success)' }}
            />
            <span
              className="relative inline-flex rounded-full h-2.5 w-2.5"
              style={{ backgroundColor: 'var(--color-success)' }}
            />
          </span>
          <span className="text-[12px] font-semibold text-[var(--color-success)] uppercase tracking-wider">
            LIVE
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
              style={{
                backgroundColor: config.color + '20',
                color: config.textColor,
              }}
            >
              {config.label}
            </span>
            <span className="text-[12px] text-[var(--color-text-secondary)] tabular-nums">
              {s.startTime}{s.endTime ? ` - ${s.endTime}` : ''}
            </span>
          </div>
          <p className="text-[14.5px] font-semibold text-[var(--color-text)]">
            {s.name} 진행 중
          </p>
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
            {s.location} · 예약 {s.currentReservations}/{s.maxCapacity}명
          </p>
        </div>
        {running.length > 1 && (
          <div className="text-[11.5px] text-[var(--color-text-muted)]">
            +{running.length - 1}개 동시 진행
          </div>
        )}
      </section>
    );
  }

  if (next) {
    const config = sessionTypeConfig[next.type];
    return (
      <section className="bg-white border border-[var(--color-border)] rounded-md p-4 flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: config.bgColor }}
        >
          <Clock size={16} style={{ color: config.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11.5px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold mb-0.5">
            다음 세션
          </p>
          <p className="text-[14px] font-semibold text-[var(--color-text)]">
            {next.startTime} · {next.name}
          </p>
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
            {next.location} · 예약 {next.currentReservations}/{next.maxCapacity}명
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-[var(--color-text-muted)]">진행 {finished}/{total}</p>
        </div>
      </section>
    );
  }

  // All finished today
  return (
    <section className="bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] rounded-md p-4 flex items-center gap-3">
      <CheckCircle2 size={16} className="text-[var(--color-success)]" />
      <p className="text-[13.5px] text-[var(--color-text)]">
        오늘의 세션 {total}개가 모두 종료되었습니다. 수고하셨어요 👏
      </p>
    </section>
  );
}

function QuickActions({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <ActionButton icon={PlusCircle} label="세션 추가" onClick={() => onNavigate('sessions')} />
      <ActionButton icon={UserPlus} label="회원 추가" onClick={() => onNavigate('members')} />
      <ActionButton icon={QrCode} label="출석 QR" onClick={() => onNavigate('qr')} />
      <ActionButton icon={Megaphone} label="공지" onClick={() => onNavigate('notices')} />
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof PlusCircle;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12.5px] font-medium border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-bg)] transition-colors"
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function Sparkline({ data }: { data: { date: string; count: number; label: string }[] }) {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <div className="flex items-end gap-1.5 h-[80px]">
      {data.map(d => {
        const h = d.count === 0 ? 2 : (d.count / max) * 70;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span
              className={cn(
                'text-[10px] tabular-nums',
                d.count === 0 ? 'text-transparent' : 'text-[var(--color-text-muted)]'
              )}
            >
              {d.count}
            </span>
            <div
              className="w-full max-w-[20px] rounded-t transition-all hover:opacity-80"
              style={{
                height: `${h}px`,
                backgroundColor:
                  d.count === 0 ? 'var(--color-border-subtle)' : 'var(--color-primary)',
              }}
              title={`${d.label}: ${d.count}건`}
            />
            <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatRow({
  label,
  value,
  suffix,
  dotColor,
  emphasis,
}: {
  label: string;
  value: number;
  suffix: string;
  dotColor?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-text-secondary)]">
        {dotColor && (
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
        )}
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          emphasis
            ? 'text-[15px] font-semibold text-[var(--color-text)]'
            : 'text-[13px] text-[var(--color-text)]'
        )}
      >
        {value}
        <span className="text-[11.5px] text-[var(--color-text-muted)] ml-0.5">{suffix}</span>
      </span>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, suffix, hint, tone = 'default', delta, deltaSuffix = '',
}: {
  icon: typeof Users; label: string; value: number; suffix: string; hint?: string;
  tone?: 'default' | 'warning';
  delta?: number; deltaSuffix?: string;
}) {
  const hasDelta = typeof delta === 'number';
  const DeltaIcon = !hasDelta ? null : delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const deltaColor = !hasDelta || delta === 0
    ? 'text-[var(--color-text-muted)]'
    : delta > 0
      ? 'text-[var(--color-success)]'
      : 'text-[var(--color-danger)]';
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] text-[var(--color-text-secondary)] font-medium">{label}</span>
        <Icon size={16} className={tone === 'warning' ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]'} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn(
          "text-[30px] font-semibold leading-none tabular-nums tracking-tight",
          tone === 'warning' && value > 0 ? "text-[var(--color-warning)]" : "text-[var(--color-text)]"
        )}>
          {value}
        </span>
        <span className="text-[13px] text-[var(--color-text-muted)]">{suffix}</span>
        {hasDelta && DeltaIcon && (
          <span className={cn("ml-auto inline-flex items-center gap-0.5 text-[11.5px] font-medium tabular-nums", deltaColor)}>
            <DeltaIcon size={11} strokeWidth={2.4} />
            {delta === 0 ? '0' : Math.abs(delta)}{deltaSuffix}
          </span>
        )}
      </div>
      {hint && <p className="text-[12px] text-[var(--color-text-muted)] mt-2 truncate">{hint}</p>}
    </div>
  );
}

function Panel({ title, action, children, className }: { title: string; action?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("bg-white border border-[var(--color-border)] rounded-md overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] bg-white">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">{title}</h2>
        {action && <span className="text-[12px] text-[var(--color-text-muted)]">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-[13px] text-[var(--color-text-muted)]">{message}</p>
    </div>
  );
}
