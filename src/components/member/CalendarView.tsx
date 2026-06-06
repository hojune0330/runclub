'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Clock, Check } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig } from '@/lib/config';
import {
  getWeekDays,
  getMonthDays,
  getSessionsForDate,
  getSessionStatusLabel,
  isSessionFull,
  formatKoreanDate,
  navigateDate,
  cn,
  isToday,
  isSameDay,
  format,
} from '@/lib/utils';
import type { CalendarView as CalendarViewType, Session } from '@/types';
import SessionDetail from './SessionDetail';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export default function CalendarView() {
  const { sessions, reservations, currentMember, notices } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType>('week');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const monthDays = useMemo(() => getMonthDays(currentDate), [currentDate]);

  const sessionsForDate = useMemo(
    () => getSessionsForDate(sessions, selectedDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [sessions, selectedDate]
  );
  const latestNotice = notices.find(n => !n.isRead);

  const reservedIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of reservations) {
      if (r.memberId === currentMember.id && r.status === 'reserved') set.add(r.sessionId);
    }
    return set;
  }, [reservations, currentMember.id]);

  const navigate = (dir: 'prev' | 'next') => {
    setCurrentDate(navigateDate(currentDate, view, dir));
  };

  const goToday = () => {
    const d = new Date();
    setCurrentDate(d);
    setSelectedDate(d);
  };

  if (selectedSession) {
    const liveSession = sessions.find(s => s.id === selectedSession.id) || selectedSession;
    return <SessionDetail session={liveSession} onBack={() => setSelectedSession(null)} />;
  }

  return (
    <div className="space-y-5 max-w-[1100px]">
      {/* Heading */}
      <div>
        <h1 className="page-title">세션 일정·예약</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          날짜를 고르고 세션을 눌러 예약하세요.
        </p>
      </div>

      {/* Notice banner */}
      {latestNotice && (
        <div className="bg-[var(--color-primary-bg)] border border-[var(--color-primary-border)] rounded-md px-4 py-2.5 flex items-start gap-3">
          <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium rounded bg-white border border-[var(--color-primary-border)] text-[var(--color-primary)] shrink-0 mt-0.5">
            공지
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-[var(--color-text)] font-medium truncate">{latestNotice.title}</p>
            <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5 line-clamp-1">{latestNotice.content}</p>
          </div>
          <span className="text-[12px] text-[var(--color-text-muted)] shrink-0 tabular-nums">
            {formatKoreanDate(latestNotice.createdAt, 'M.d')}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="inline-flex border border-[var(--color-border)] rounded-md overflow-hidden">
          {(['week', 'month'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'h-9 px-3.5 text-[13px] font-medium transition-colors',
                view === v ? 'bg-[var(--color-text)] text-white' : 'bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
              )}
            >
              {v === 'week' ? '주간' : '월간'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={goToday} className="h-9 px-3 text-[13px] border border-[var(--color-border)] rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
            오늘
          </button>
          <button onClick={() => navigate('prev')} aria-label="이전" className="w-9 h-9 inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] rounded-md border border-[var(--color-border)]">
            <ChevronLeft size={17} />
          </button>
          <span className="text-[13px] font-medium text-[var(--color-text)] min-w-[120px] text-center tabular-nums">
            {view === 'week' ? `${format(weekDays[0], 'M.d')} – ${format(weekDays[6], 'M.d')}` : format(currentDate, 'yyyy년 M월')}
          </span>
          <button onClick={() => navigate('next')} aria-label="다음" className="w-9 h-9 inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] rounded-md border border-[var(--color-border)]">
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {/* ─── WEEK VIEW: date strip + card list ─── */}
      {view === 'week' && (
        <>
          {/* Date strip */}
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((day, i) => {
              const daySessions = getSessionsForDate(sessions, day);
              const selected = isSameDay(day, selectedDate);
              const tod = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl py-2.5 border transition-colors',
                    selected
                      ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                      : 'bg-white border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)]'
                  )}
                >
                  <span className={cn(
                    'text-[11px] font-medium',
                    selected ? 'text-white/80' : i === 5 ? 'text-[var(--color-primary)]' : i === 6 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'
                  )}>
                    {DAY_LABELS[i]}
                  </span>
                  <span className={cn(
                    'text-[16px] font-bold tabular-nums leading-none',
                    selected ? 'text-white' : tod ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'
                  )}>
                    {format(day, 'd')}
                  </span>
                  {/* session dots */}
                  <span className="h-1.5 flex items-center gap-0.5">
                    {daySessions.slice(0, 3).map(s => (
                      <span
                        key={s.id}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: selected ? 'rgba(255,255,255,0.9)' : sessionTypeConfig[s.type].color }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected day card list */}
          <SessionCardList
            dateLabel={formatKoreanDate(selectedDate, 'M월 d일 EEEE')}
            sessions={sessionsForDate}
            reservedIds={reservedIds}
            onSelect={setSelectedSession}
            onGoToday={goToday}
          />
        </>
      )}

      {/* ─── MONTH VIEW: clean dot grid + selected day list ─── */}
      {view === 'month' && (
        <>
          <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
            <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
              {DAY_LABELS.map((d, i) => (
                <div key={d} className={cn('text-center text-[12px] py-2 font-medium', i === 5 ? 'text-[var(--color-primary)]' : i === 6 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-secondary)]')}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: (monthDays[0].getDay() + 6) % 7 }).map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[64px] border-r border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]" />
              ))}
              {monthDays.map(day => {
                const daySessions = getSessionsForDate(sessions, day);
                const selected = isSameDay(day, selectedDate);
                const tod = isToday(day);
                const dayNum = day.getDay();
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      'min-h-[64px] border-r border-b border-[var(--color-border-subtle)] p-1.5 flex flex-col items-center gap-1 transition-colors',
                      selected ? 'bg-[var(--color-primary-bg)]' : 'bg-white hover:bg-[var(--color-bg-subtle)]'
                    )}
                  >
                    <span className={cn(
                      'inline-flex items-center justify-center text-[12.5px] font-medium tabular-nums w-6 h-6 rounded-full',
                      tod ? 'bg-[var(--color-primary)] text-white' : dayNum === 0 ? 'text-[var(--color-danger)]' : dayNum === 6 ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'
                    )}>
                      {format(day, 'd')}
                    </span>
                    {daySessions.length > 0 && (
                      <span className="flex items-center gap-0.5 flex-wrap justify-center">
                        {daySessions.slice(0, 4).map(s => (
                          <span key={s.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sessionTypeConfig[s.type].color }} />
                        ))}
                        {daySessions.length > 4 && <span className="text-[9px] text-[var(--color-text-muted)] leading-none">+</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Legend */}
            <div className="px-4 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)] flex items-center gap-4 flex-wrap">
              {Object.entries(sessionTypeConfig).map(([key, config]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                  <span className="text-[12px] text-[var(--color-text-secondary)]">{config.label}</span>
                </div>
              ))}
            </div>
          </section>

          <SessionCardList
            dateLabel={formatKoreanDate(selectedDate, 'M월 d일 EEEE')}
            sessions={sessionsForDate}
            reservedIds={reservedIds}
            onSelect={setSelectedSession}
            onGoToday={goToday}
          />
        </>
      )}
    </div>
  );
}

// ─── 선택 날짜의 세션 카드 리스트 (주간/월간 공용) ───
function SessionCardList({ dateLabel, sessions, reservedIds, onSelect, onGoToday }: {
  dateLabel: string;
  sessions: Session[];
  reservedIds: Set<string>;
  onSelect: (s: Session) => void;
  onGoToday: () => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">{dateLabel}</h2>
        <span className="text-[12px] text-[var(--color-text-muted)]">
          {sessions.length > 0 ? `${sessions.length}개 세션` : '세션 없음'}
        </span>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white border border-dashed border-[var(--color-border)] rounded-md py-12 text-center">
          <p className="text-[13px] text-[var(--color-text-muted)]">선택한 날짜에 예정된 세션이 없습니다.</p>
          <button onClick={onGoToday} className="mt-2 text-[13px] text-[var(--color-primary)] hover:underline">오늘로 이동</button>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {sessions.map(s => (
            <SessionCard key={s.id} session={s} reserved={reservedIds.has(s.id)} onClick={() => onSelect(s)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionCard({ session, reserved, onClick }: { session: Session; reserved: boolean; onClick: () => void }) {
  const config = sessionTypeConfig[session.type];
  const full = isSessionFull(session);
  const ratio = session.maxCapacity > 0 ? Math.min(100, Math.round((session.currentReservations / session.maxCapacity) * 100)) : 0;
  const statusLabel = getSessionStatusLabel(session);
  const barColor = full ? 'var(--color-danger)' : ratio >= 80 ? 'var(--color-warning)' : config.color;

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left bg-white border border-[var(--color-border)] rounded-xl p-3.5 flex items-stretch gap-3.5 hover:border-[var(--color-primary)] hover:shadow-sm transition-all"
      >
        {/* time + color bar */}
        <div className="flex flex-col items-center justify-center shrink-0 w-[52px]">
          <span className="text-[16px] font-bold text-[var(--color-text)] tabular-nums leading-none">{session.startTime}</span>
          {session.endTime && <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums mt-1">{session.endTime}</span>}
        </div>
        <span className="w-1 rounded-full shrink-0" style={{ backgroundColor: config.color }} />

        {/* main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: config.bgColor, color: config.textColor }}>
              {config.label}
            </span>
            {reserved && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--color-primary-bg)] text-[var(--color-primary)] border border-[var(--color-primary-border)]">
                <Check size={10} />예약됨
              </span>
            )}
            {session.isIndoor && (
              <span className="text-[11px] text-[var(--color-text-muted)] border border-[var(--color-border)] rounded px-1.5 py-0">실내</span>
            )}
          </div>
          <p className="text-[14px] font-semibold text-[var(--color-text)] mt-1 truncate">{session.name}</p>
          {session.location && (
            <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5 flex items-center gap-1 truncate">
              <MapPin size={11} className="shrink-0" />{session.location}
            </p>
          )}
          {/* capacity */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-[var(--color-bg-hover)] rounded-full overflow-hidden max-w-[160px]">
              <div className="h-full rounded-full transition-all" style={{ width: `${ratio}%`, backgroundColor: barColor }} />
            </div>
            <span className="text-[11.5px] tabular-nums text-[var(--color-text-secondary)]">{session.currentReservations}/{session.maxCapacity}</span>
          </div>
        </div>

        {/* status + chevron */}
        <div className="shrink-0 flex flex-col items-end justify-between">
          <span className={cn(
            'text-[11.5px] font-medium px-2 py-0.5 rounded-full',
            full ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]' : ratio >= 80 ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]' : 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
          )}>
            {statusLabel}
          </span>
          <ChevronRight size={16} className="text-[var(--color-text-muted)] mt-2" />
        </div>
      </button>
    </li>
  );
}
