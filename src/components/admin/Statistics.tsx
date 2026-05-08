'use client';

import { useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig } from '@/lib/config';
import { cn, format, formatPrice } from '@/lib/utils';
import { Panel } from '@/components/ui';
import type { SessionType } from '@/types';

export default function Statistics() {
  const { sessions, reservations, memberPasses, members } = useApp();

  const stats = useMemo(() => {
    const byType: Record<SessionType, { total: number; attended: number; noshow: number }> = {
      ebw: { total: 0, attended: 0, noshow: 0 },
      slowrun: { total: 0, attended: 0, noshow: 0 },
      marathon: { total: 0, attended: 0, noshow: 0 },
    };

    reservations.forEach(r => {
      const session = r.session || sessions.find(s => s.id === r.sessionId);
      if (!session) return;
      byType[session.type].total++;
      if (r.status === 'attended') byType[session.type].attended++;
      if (r.status === 'noshow') byType[session.type].noshow++;
    });

    const totalRevenue = memberPasses.reduce((sum, p) => sum + p.price, 0);
    const activePassCount = memberPasses.filter(p => p.status === 'active').length;

    return { byType, totalRevenue, activePassCount };
  }, [reservations, sessions, memberPasses]);

  const weeklyData = useMemo(() => {
    const weeks: { label: string; attended: number; reserved: number; noshow: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (w * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const label = format(weekStart, 'M.d');

      const weekReservations = reservations.filter(r => {
        const session = r.session || sessions.find(s => s.id === r.sessionId);
        return session && session.date >= format(weekStart, 'yyyy-MM-dd') && session.date <= format(weekEnd, 'yyyy-MM-dd');
      });

      weeks.push({
        label,
        attended: weekReservations.filter(r => r.status === 'attended').length,
        reserved: weekReservations.filter(r => r.status === 'reserved').length,
        noshow: weekReservations.filter(r => r.status === 'noshow').length,
      });
    }
    return weeks;
  }, [reservations, sessions]);

  const maxWeekly = Math.max(...weeklyData.map(w => w.attended + w.reserved + w.noshow), 1);

  return (
    <div className="max-w-[1400px] space-y-5">
      <div>
        <h1 className="page-title">통계</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">예약, 출석, 수강권 매출 현황입니다.</p>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-grid-4">
        <SummaryCard
          label="총 예약"
          value={reservations.length.toString()}
          suffix="건"
          hint={reservations.length === 0 ? '아직 예약이 없어요' : undefined}
        />
        <SummaryCard
          label="전체 출석률"
          value={(() => {
            const done = reservations.filter(r => r.status === 'attended' || r.status === 'noshow').length;
            const att = reservations.filter(r => r.status === 'attended').length;
            return done > 0 ? Math.round((att / done) * 100).toString() : '0';
          })()}
          suffix="%"
          hint={(() => {
            const done = reservations.filter(r => r.status === 'attended' || r.status === 'noshow').length;
            return done === 0 ? '출석/노쇼 처리 후 집계돼요' : undefined;
          })()}
        />
        <SummaryCard
          label="수강권 매출"
          value={formatPrice(stats.totalRevenue).replace('원', '')}
          suffix="원"
          hint={stats.totalRevenue === 0 ? '발급된 유료 수강권이 없어요' : undefined}
        />
        <SummaryCard
          label="가입 회원"
          value={members.length.toString()}
          suffix="명"
          hint={members.length === 0 ? '회원을 등록해주세요' : undefined}
        />
      </div>

      {/* Session type stats */}
      <Panel title="세션 유형별 출석률">
        <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-[var(--color-border)]">
          {(Object.entries(stats.byType) as [SessionType, typeof stats.byType.ebw][]).map(([type, data]) => {
            const config = sessionTypeConfig[type];
            const done = data.attended + data.noshow;
            const rate = done > 0 ? Math.round((data.attended / done) * 100) : 0;
            return (
              <div key={type} className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                  <span className="text-[13px] text-[var(--color-text-secondary)] font-medium">{config.label}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="kpi-num">{rate}</span>
                  <span className="text-[14px] text-[var(--color-text-muted)]">%</span>
                </div>
                <div className="w-full h-1.5 bg-[var(--color-bg-hover)] rounded overflow-hidden mb-3">
                  <div className="h-full rounded" style={{ width: `${rate}%`, backgroundColor: config.color }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">
                  <StatItem label="출석" value={data.attended} tone="success" />
                  <StatItem label="노쇼" value={data.noshow} tone={data.noshow > 0 ? 'danger' : 'muted'} />
                  <StatItem label="전체" value={data.total} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Weekly trend chart — SVG area + line */}
        <Panel title="주간 추이 (최근 8주)" action={<span>예약 / 출석 / 노쇼</span>}>
          <div className="p-5">
            <WeeklyTrendChart data={weeklyData} maxValue={maxWeekly} />
            <div className="flex items-center gap-4 text-[12px] text-[var(--color-text-secondary)] border-t border-[var(--color-border-subtle)] pt-3 mt-3">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-[3px] rounded bg-[var(--color-border-strong)]" />예약
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-[3px] rounded bg-[var(--color-primary)]" />출석
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-[3px] rounded bg-[var(--color-danger)]" />노쇼
              </span>
            </div>
          </div>
        </Panel>

        {/* Revenue — Donut */}
        <Panel title="수강권 매출 분석">
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
              <div>
                <p className="text-[12px] text-[var(--color-text-muted)] mb-1">총 매출</p>
                <p className="kpi-num">{formatPrice(stats.totalRevenue)}</p>
              </div>
              <div>
                <p className="text-[12px] text-[var(--color-text-muted)] mb-1">활성 수강권</p>
                <p className="kpi-num">{stats.activePassCount}건</p>
              </div>
            </div>

            <RevenueDonut memberPasses={memberPasses} totalRevenue={stats.totalRevenue} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, suffix, hint }: { label: string; value: string; suffix: string; hint?: string }) {
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-md p-4">
      <p className="text-[13px] text-[var(--color-text-secondary)] font-medium mb-2">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="kpi-num">{value}</span>
        <span className="text-[13px] text-[var(--color-text-muted)]">{suffix}</span>
      </div>
      {hint && <p className="text-[12px] text-[var(--color-text-muted)] mt-2 truncate">{hint}</p>}
    </div>
  );
}

function StatItem({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'success' | 'danger' | 'muted' }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--color-text-muted)]">{label}</p>
      <p className={cn(
        "text-[14px] font-medium tabular-nums",
        tone === 'success' && "text-[var(--color-success)]",
        tone === 'danger' && "text-[var(--color-danger)]",
        tone === 'muted' && "text-[var(--color-text-muted)]",
        tone === 'default' && "text-[var(--color-text)]"
      )}>
        {value}
      </p>
    </div>
  );
}

// ─── SVG Charts ───

type WeekPoint = { label: string; attended: number; reserved: number; noshow: number };

function WeeklyTrendChart({ data, maxValue }: { data: WeekPoint[]; maxValue: number }) {
  const W = 480, H = 180;
  const PAD_L = 28, PAD_R = 8, PAD_T = 12, PAD_B = 26;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = data.length;
  if (n === 0) {
    return (
      <div className="h-[180px] flex items-center justify-center text-[13px] text-[var(--color-text-muted)]">
        데이터가 없습니다.
      </div>
    );
  }

  const stepX = n > 1 ? plotW / (n - 1) : 0;
  const toX = (i: number) => PAD_L + i * stepX;
  const toY = (v: number) => PAD_T + plotH - (v / maxValue) * plotH;

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map(r => Math.round(maxValue * r));
  const uniqueGrid = Array.from(new Set(gridValues));

  const buildPath = (key: keyof Omit<WeekPoint, 'label'>) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(d[key]).toFixed(1)}`).join(' ');

  const buildArea = (key: keyof Omit<WeekPoint, 'label'>) => {
    const top = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(d[key]).toFixed(1)}`).join(' ');
    const base = `L ${toX(n - 1).toFixed(1)} ${(PAD_T + plotH).toFixed(1)} L ${toX(0).toFixed(1)} ${(PAD_T + plotH).toFixed(1)} Z`;
    return `${top} ${base}`;
  };

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="주간 추이 라인 차트">
        <defs>
          <linearGradient id="gradAttended" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {uniqueGrid.map((v, idx) => (
          <g key={idx}>
            <line
              x1={PAD_L} x2={W - PAD_R} y1={toY(v)} y2={toY(v)}
              stroke="var(--color-border-subtle)" strokeWidth="1"
              strokeDasharray={idx === 0 ? '0' : '3 3'}
            />
            <text
              x={PAD_L - 6} y={toY(v) + 3}
              textAnchor="end"
              fontSize="10"
              fill="var(--color-text-muted)"
            >
              {v}
            </text>
          </g>
        ))}

        {/* Attended area */}
        <path d={buildArea('attended')} fill="url(#gradAttended)" />

        {/* Lines */}
        <path d={buildPath('reserved')} fill="none" stroke="var(--color-border-strong)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d={buildPath('noshow')} fill="none" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d={buildPath('attended')} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots for attended */}
        {data.map((d, i) => (
          <circle
            key={`dot-${i}`}
            cx={toX(i)} cy={toY(d.attended)}
            r="2.5"
            fill="#fff"
            stroke="var(--color-primary)"
            strokeWidth="1.5"
          >
            <title>{`${d.label} · 출석 ${d.attended} · 예약 ${d.reserved} · 노쇼 ${d.noshow}`}</title>
          </circle>
        ))}

        {/* X labels */}
        {data.map((d, i) => (
          <text
            key={`x-${i}`}
            x={toX(i)} y={H - 8}
            textAnchor="middle"
            fontSize="10"
            fill="var(--color-text-muted)"
          >
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function RevenueDonut({
  memberPasses,
  totalRevenue,
}: {
  memberPasses: { category: 'count' | 'season' | 'monthly'; price: number }[];
  totalRevenue: number;
}) {
  const items = (['count', 'season', 'monthly'] as const).map(category => {
    const passes = memberPasses.filter(p => p.category === category);
    const revenue = passes.reduce((sum, p) => sum + p.price, 0);
    return {
      category,
      label: category === 'count' ? '횟수권' : category === 'season' ? '시즌권' : '월권',
      color:
        category === 'count'
          ? 'var(--color-primary)'
          : category === 'season'
            ? 'var(--color-ebw)'
            : 'var(--color-marathon)',
      revenue,
      count: passes.length,
    };
  });

  const total = totalRevenue || 0;
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 54;
  const strokeW = 18;
  const C = 2 * Math.PI * r;

  let offset = 0;
  const arcs = items.map(it => {
    const ratio = total > 0 ? it.revenue / total : 0;
    const len = C * ratio;
    const arc = {
      ...it,
      ratio,
      dasharray: `${len} ${C - len}`,
      dashoffset: -offset,
    };
    offset += len;
    return arc;
  });

  return (
    <div className="flex items-center gap-5">
      {/* Donut */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          {/* Track */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="var(--color-bg-hover)"
            strokeWidth={strokeW}
          />
          {total > 0 && arcs.map((a, i) => (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={strokeW}
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] text-[var(--color-text-muted)]">활성 수강권</span>
          <span className="text-[16px] font-semibold tabular-nums text-[var(--color-text)]">
            {items.reduce((s, it) => s + it.count, 0)}건
          </span>
        </div>
      </div>

      {/* Legend with values */}
      <div className="flex-1 space-y-2.5 min-w-0">
        {arcs.map(a => (
          <div key={a.category} className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: a.color }} />
            <span className="text-[13px] text-[var(--color-text)] flex-1 min-w-0 truncate">{a.label}</span>
            <span className="text-[12px] text-[var(--color-text-muted)] tabular-nums">{a.count}건</span>
            <span className="text-[13px] text-[var(--color-text)] tabular-nums min-w-[64px] text-right">
              {Math.round(a.ratio * 100)}%
            </span>
          </div>
        ))}
        {total === 0 && (
          <p className="text-[12px] text-[var(--color-text-muted)] pt-1">
            아직 매출 데이터가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
