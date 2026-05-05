import Link from 'next/link';
import { Calendar, Clock, MapPin, Users, Lock, ArrowRight, Info } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import { sessionTypeConfig } from '@/lib/config';
import { parseISO, format } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface PublicSession {
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

async function fetchSessions(): Promise<PublicSession[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${base}/api/public/sessions?limit=100&days=60`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.sessions || [];
  } catch {
    return [];
  }
}

export default async function PublicSessionsPage() {
  const sessions = await fetchSessions();

  // Group by date
  const byDate: Record<string, PublicSession[]> = {};
  sessions.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  });
  const dates = Object.keys(byDate).sort();

  // Session type counts
  const typeCounts: Record<string, number> = {};
  sessions.forEach(s => {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  });

  return (
    <PublicLayout>
      {/* Header */}
      <section className="border-b border-[var(--color-border)] bg-white">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10">
          <h1 className="text-[22px] md:text-[30px] font-bold text-[var(--color-text)] tracking-tight">
            세션 일정
          </h1>
          <p className="mt-1 text-[12.5px] md:text-[13.5px] text-[var(--color-text-muted)] max-w-[580px]">
            앞으로 약 두 달간의 세션을 확인할 수 있어요. 예약은 가입 후 가능합니다.
          </p>

          {/* Filter chips — scroll on mobile */}
          <div className="mt-3.5 md:mt-4 flex gap-1.5 overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 pb-1 scrollbar-hide">
            <FilterChip label={`전체 ${sessions.length}`} active />
            {Object.entries(typeCounts).map(([type, c]) => {
              const config = sessionTypeConfig[type as keyof typeof sessionTypeConfig];
              return (
                <FilterChip
                  key={type}
                  label={`${config.label} ${c}`}
                  color={config.color}
                  bgColor={config.bgColor}
                  textColor={config.textColor}
                />
              );
            })}
          </div>
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
        {dates.length === 0 ? (
          <div className="border border-dashed border-[var(--color-border)] rounded-md p-10 md:p-14 text-center">
            <Calendar size={28} className="mx-auto mb-2.5 text-[var(--color-text-muted)]" />
            <p className="text-[14px] md:text-[15px] text-[var(--color-text)] font-medium">
              예정된 세션이 없습니다
            </p>
            <p className="text-[12.5px] md:text-[13px] text-[var(--color-text-muted)] mt-1">
              새로운 일정이 곧 업데이트될 예정이에요.
            </p>
          </div>
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
                      <span className="text-[12px] md:text-[13px] font-medium text-[var(--color-text-muted)] ml-1.5">
                        ({format(d, 'EEE')})
                      </span>
                    </h2>
                    {isWeekend && (
                      <span className="text-[10.5px] md:text-[11px] text-[var(--color-warning)] bg-[var(--color-warning-bg)] px-1.5 py-0.5 rounded font-medium">
                        주말
                      </span>
                    )}
                    <span className="ml-auto text-[11.5px] md:text-[12px] text-[var(--color-text-muted)] tabular-nums">
                      {items.length}개
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-3">
                    {items.map(s => (
                      <SessionCard key={s.id} session={s} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-10 md:mt-12 pt-8 md:pt-10 border-t border-[var(--color-border)] text-center">
          <p className="text-[14px] md:text-[15px] text-[var(--color-text)] font-medium">
            마음에 드는 세션을 찾으셨나요?
          </p>
          <p className="text-[12.5px] md:text-[13.5px] text-[var(--color-text-muted)] mt-1">
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
    </PublicLayout>
  );
}

function FilterChip({
  label,
  active,
  color,
  bgColor,
  textColor,
}: {
  label: string;
  active?: boolean;
  color?: string;
  bgColor?: string;
  textColor?: string;
}) {
  if (active) {
    return (
      <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[var(--color-text)] text-white">
        {label}
      </span>
    );
  }
  return (
    <span
      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium"
      style={{
        backgroundColor: bgColor || 'var(--color-bg-subtle)',
        color: textColor || 'var(--color-text-secondary)',
      }}
    >
      {color && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </span>
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
          <Clock size={12} className="text-[var(--color-text-muted)] shrink-0" />
          <span className="tabular-nums">
            {session.startTime}
            {session.endTime ? ` - ${session.endTime}` : ''}
          </span>
        </div>
        {session.location && (
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="text-[var(--color-text-muted)] shrink-0" />
            <span className="truncate flex-1">{session.location}</span>
            {session.isIndoor && (
              <span className="text-[10px] md:text-[10.5px] text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] px-1 py-px rounded shrink-0">
                실내
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Users size={12} className="text-[var(--color-text-muted)] shrink-0" />
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
