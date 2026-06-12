'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Calendar, Clock, MapPin, Users, Lock, ArrowRight, Info } from 'lucide-react';
import PublicProductCard from '@/components/public/PublicProductCard';
import { sessionTypeConfig } from '@/lib/config';
import { parseISO, format, cn } from '@/lib/utils';

export interface PublicSession {
  id: string;
  name: string;
  type: 'ebw' | 'slowrun' | 'marathon';
  date: string;
  startTime: string;
  endTime?: string;
  location: string;
  isIndoor: boolean;
  capacity: number;
  reserved: number;
  remaining: number;
  isFull: boolean;
}

type SessionFilter = 'all' | PublicSession['type'];

const SESSION_GUIDES: Record<SessionFilter, string> = {
  all: '목적이 정해지지 않았다면 전체 일정을 먼저 보고, 시간·장소·잔여 인원이 맞는 세션을 고르세요.',
  ebw: 'EBW는 러닝 전후 움직임과 컨디셔닝을 함께 챙기는 보조 세션이에요.',
  slowrun: '런클럽은 함께 달리는 정기 러닝 세션입니다. 처음이라면 부담 없는 페이스부터 확인해보세요.',
  marathon: '러닝클래스는 자세, 훈련 루틴, 거리 적응처럼 목적이 분명한 훈련에 좋아요.',
};

const TYPE_GUIDE_ITEMS: Array<{ type: PublicSession['type']; title: string; desc: string }> = [
  { type: 'slowrun', title: '처음 달린다면', desc: '런클럽에서 함께 달리는 일정부터 확인해보세요.' },
  { type: 'marathon', title: '목표 훈련이라면', desc: '러닝클래스로 자세와 훈련 루틴을 잡을 수 있어요.' },
  { type: 'ebw', title: '컨디션 관리라면', desc: 'EBW로 러닝 전후 움직임과 회복을 챙겨요.' },
];

export default function PublicSessionsExplorer({ sessions }: { sessions: PublicSession[] }) {
  const [filter, setFilter] = useState<SessionFilter>('all');

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<PublicSession['type'], number>> = {};
    for (const session of sessions) {
      counts[session.type] = (counts[session.type] ?? 0) + 1;
    }
    return counts;
  }, [sessions]);

  const filteredSessions = useMemo(
    () => filter === 'all' ? sessions : sessions.filter(session => session.type === filter),
    [filter, sessions]
  );

  const byDate = useMemo(() => {
    const grouped: Record<string, PublicSession[]> = {};
    for (const session of filteredSessions) {
      if (!grouped[session.date]) grouped[session.date] = [];
      grouped[session.date].push(session);
    }
    return grouped;
  }, [filteredSessions]);

  const dates = useMemo(() => Object.keys(byDate).sort(), [byDate]);
  const activeLabel = filter === 'all' ? '전체' : sessionTypeConfig[filter].label;
  const activeGuide = SESSION_GUIDES[filter];

  return (
    <>
      {/* Header */}
      <section className="border-b border-[var(--color-border)] bg-white">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10">
          <h1 className="text-[22px] md:text-[30px] font-bold text-[var(--color-text)] tracking-tight">
            세션 일정
          </h1>
          <p className="mt-1 text-[12.5px] md:text-[13.5px] text-[var(--color-text-secondary)] max-w-[580px]">
            앞으로 약 두 달간의 세션을 확인할 수 있어요. 예약은 가입 후 가능합니다.
          </p>

          {/* 실제 필터: 모바일에서는 가로 스크롤, 데스크톱에서는 같은 컴포넌트 유지 */}
          <div
            className="mt-3.5 md:mt-4 flex gap-1.5 overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 pb-1 scrollbar-hide"
            role="group"
            aria-label="세션 유형 필터"
          >
            <FilterChip
              label={`전체 ${sessions.length}`}
              active={filter === 'all'}
              onClick={() => setFilter('all')}
            />
            {(Object.entries(typeCounts) as Array<[PublicSession['type'], number]>).map(([type, count]) => {
              const config = sessionTypeConfig[type];
              return (
                <FilterChip
                  key={type}
                  label={`${config.label} ${count}`}
                  active={filter === type}
                  color={config.color}
                  bgColor={config.bgColor}
                  textColor={config.textColor}
                  onClick={() => setFilter(type)}
                />
              );
            })}
          </div>
          {sessions.length > 0 && (
            <div className="mt-2 space-y-1" aria-live="polite">
              <p className="text-[11.5px] md:text-[12px] text-[var(--color-text-secondary)]">
                현재 <span className="font-semibold text-[var(--color-text)]">{activeLabel}</span> 세션 {filteredSessions.length}개를 보고 있어요.
              </p>
              <p className="max-w-[680px] text-[12px] md:text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
                {activeGuide}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Hint banner */}
      <section className="bg-[var(--color-primary-bg)] border-b border-[var(--color-primary-border)]">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-2.5 md:py-3 flex items-start md:items-center gap-2 text-[12px] md:text-[13px] text-[var(--color-primary)] leading-snug">
          <Info size={13} className="shrink-0 mt-0.5 md:mt-0" />
          <p className="flex-1">
            둘러보기 모드입니다. 예약하려면{' '}
            <Link href="/login" className="underline font-semibold">
              로그인
            </Link>{' '}
            또는{' '}
            <Link href="/login?mode=register" className="underline font-semibold">
              회원가입
            </Link>
            이 필요해요.
          </p>
        </div>
      </section>

      {/* Sessions by date */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10">
        {sessions.length === 0 ? (
          <EmptySchedule
            title="예정된 세션이 없습니다"
            description="새로운 일정이 곧 업데이트될 예정이에요. 세션 유형을 먼저 살펴보고 나에게 맞는 시작점을 골라보세요."
            action={<TypeGuideGrid />}
          />
        ) : dates.length === 0 ? (
          <EmptySchedule
            title="조건에 맞는 세션이 없습니다"
            description="다른 유형을 선택하거나 전체 일정을 다시 확인해보세요."
            action={(
              <button
                onClick={() => setFilter('all')}
                className="mt-3 h-9 px-3 rounded-md text-[12.5px] font-semibold border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]"
              >
                전체 일정 보기
              </button>
            )}
          />
        ) : (
          <div className="space-y-6 md:space-y-8">
            {dates.map(date => {
              const items = byDate[date];
              const d = parseISO(date);
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-2.5 md:mb-3 pb-2 border-b border-[var(--color-border)]">
                    <h2 className="text-[14px] md:text-[15px] font-bold text-[var(--color-text)] tabular-nums">
                      {format(d, 'M월 d일')}
                      <span className="text-[12px] md:text-[13px] font-medium text-[var(--color-text-secondary)] ml-1.5">
                        ({format(d, 'EEE')})
                      </span>
                    </h2>
                    {isWeekend && (
                      <span className="text-[10.5px] md:text-[11px] text-[var(--color-warning)] bg-[var(--color-warning-bg)] px-1.5 py-0.5 rounded font-medium">
                        주말
                      </span>
                    )}
                    <span className="ml-auto text-[11.5px] md:text-[12px] text-[var(--color-text-secondary)] tabular-nums">
                      {items.length}개
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-3">
                    {items.map(session => (
                      <SessionCard key={session.id} session={session} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Product catalog strip ── */}
        <div id="products" className="mt-10 md:mt-12 pt-8 md:pt-10 border-t border-[var(--color-border)]">
          <h2 className="text-[18px] md:text-[22px] font-bold text-[var(--color-text)] mb-4 md:mb-5">
            수강권 안내
          </h2>
          <p className="text-[12.5px] md:text-[13.5px] text-[var(--color-text-secondary)] mb-5 md:mb-6 max-w-[580px]">
            세션에 참여하려면 수강권이 필요해요. 아래 상품 중 원하는 것을 선택하고 가입 후 구매할 수 있습니다.
          </p>
          <PublicProductCard variant="strip" max={6} />
        </div>

        {/* Bottom CTA */}
        <div className="mt-10 md:mt-12 pt-8 md:pt-10 border-t border-[var(--color-border)] text-center">
          <p className="text-[14px] md:text-[15px] text-[var(--color-text)] font-medium">
            마음에 드는 세션을 찾으셨나요?
          </p>
          <p className="text-[12.5px] md:text-[13.5px] text-[var(--color-text-secondary)] mt-1">
            가입하고 수강권을 등록하면 원하는 세션을 예약할 수 있어요.
          </p>
          <div className="mt-4 md:mt-5 flex flex-col sm:flex-row gap-2 justify-center max-w-[320px] sm:max-w-none mx-auto">
            <Link
              href="/login?mode=register"
              className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-md text-[13.5px] font-semibold bg-[var(--color-primary)] text-white active:opacity-90 sm:hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              회원가입 <ArrowRight size={13} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-md text-[13.5px] font-semibold border border-[var(--color-border)] text-[var(--color-text)] active:bg-[var(--color-bg-hover)] sm:hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              로그인
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function FilterChip({
  label,
  active,
  color,
  bgColor,
  textColor,
  onClick,
}: {
  label: string;
  active?: boolean;
  color?: string;
  bgColor?: string;
  textColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] transition-colors focus-visible:outline-offset-2',
        active
          ? 'font-semibold bg-[var(--color-text)] text-white'
          : 'font-medium hover:ring-1 hover:ring-[var(--color-border-strong)]'
      )}
      style={active ? undefined : {
        backgroundColor: bgColor || 'var(--color-bg-subtle)',
        color: textColor || 'var(--color-text-secondary)',
      }}
    >
      {color && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </button>
  );
}

function EmptySchedule({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-[var(--color-border)] rounded-md p-6 md:p-10 text-center">
      <Calendar size={28} className="mx-auto mb-2.5 text-[var(--color-text-secondary)]" />
      <p className="text-[14px] md:text-[15px] text-[var(--color-text)] font-medium">
        {title}
      </p>
      <p className="mx-auto max-w-[560px] text-[12.5px] md:text-[13px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
        {description}
      </p>
      {action}
    </div>
  );
}

function TypeGuideGrid() {
  return (
    <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-left">
      {TYPE_GUIDE_ITEMS.map(item => {
        const config = sessionTypeConfig[item.type];
        return (
          <div key={item.type} className="rounded-md border border-[var(--color-border)] bg-white p-3">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold"
              style={{ backgroundColor: config.bgColor, color: config.textColor }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
              {config.label}
            </span>
            <p className="mt-2 text-[13px] font-semibold text-[var(--color-text)]">{item.title}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
              {item.desc}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function SessionCard({ session }: { session: PublicSession }) {
  const config = sessionTypeConfig[session.type];
  const ratio = session.capacity > 0 ? (session.reserved / session.capacity) * 100 : 0;
  const almostFull = ratio >= 80 && !session.isFull;

  return (
    <div
      className="border border-[var(--color-border)] bg-white rounded-md p-3 md:p-4 transition-all sm:hover:border-[var(--color-primary-border)] sm:hover:shadow-sm"
      style={{ borderLeftWidth: 3, borderLeftColor: config.color }}
    >
      <div className="flex items-center justify-between mb-2 md:mb-2.5">
        <span
          className="inline-flex items-center gap-1 px-1.5 md:px-2 py-0.5 rounded text-[10.5px] md:text-[11px] font-semibold"
          style={{ backgroundColor: config.bgColor, color: config.textColor }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
          {config.label}
        </span>
        {session.isFull ? (
          <span className="text-[10.5px] md:text-[11px] font-semibold text-[var(--color-danger)] bg-[var(--color-danger-bg)] px-1.5 py-0.5 rounded">
            마감
          </span>
        ) : almostFull ? (
          <span className="text-[10.5px] md:text-[11px] font-semibold text-[var(--color-warning)] bg-[var(--color-warning-bg)] px-1.5 py-0.5 rounded">
            잔여 {session.remaining}
          </span>
        ) : (
          <span className="text-[10.5px] md:text-[11px] font-medium text-[var(--color-success)] bg-[var(--color-success-bg)] px-1.5 py-0.5 rounded">
            예약 가능
          </span>
        )}
      </div>

      <h3 className="text-[14px] md:text-[14.5px] font-semibold text-[var(--color-text)] leading-tight mb-2 md:mb-2.5 line-clamp-1">
        {session.name}
      </h3>

      <div className="space-y-1 md:space-y-1.5 text-[12px] md:text-[12.5px] text-[var(--color-text-secondary)]">
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-[var(--color-text-secondary)] shrink-0" />
          <span className="tabular-nums">
            {session.startTime}
            {session.endTime ? ` - ${session.endTime}` : ''}
          </span>
        </div>
        {session.location && (
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="text-[var(--color-text-secondary)] shrink-0" />
            <span className="truncate flex-1">{session.location}</span>
            {session.isIndoor && (
              <span className="text-[10px] md:text-[10.5px] text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] px-1 py-px rounded shrink-0">
                실내
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Users size={12} className="text-[var(--color-text-secondary)] shrink-0" />
          <div className="flex-1 flex items-center gap-2">
            <span className="tabular-nums">
              {session.reserved}/{session.capacity}명
            </span>
            <div className="flex-1 h-1 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, ratio)}%`,
                  backgroundColor: session.isFull
                    ? 'var(--color-danger)'
                    : almostFull
                    ? 'var(--color-warning)'
                    : config.color,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <Link
        href="/login"
        className="mt-3 flex items-center justify-center gap-1 h-9 rounded text-[12px] font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] active:bg-[var(--color-bg-hover)] sm:hover:bg-[var(--color-bg-hover)] sm:hover:text-[var(--color-primary)] sm:hover:border-[var(--color-primary-border)] transition-colors"
      >
        <Lock size={11} />
        로그인하고 예약하기
      </Link>
    </div>
  );
}
