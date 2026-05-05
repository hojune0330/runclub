'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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

export default function CalendarView() {
  const { sessions, reservations, currentMember, notices } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType>('week');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const monthDays = useMemo(() => getMonthDays(currentDate), [currentDate]);

  const sessionsForDate = useMemo(
    () => getSessionsForDate(sessions, selectedDate),
    [sessions, selectedDate]
  );
  const latestNotice = notices.find(n => !n.isRead);

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

  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Page heading */}
      <div>
        <h1 className="text-[20px] font-semibold text-[var(--color-text)]">세션 일정</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          {formatKoreanDate(new Date(), 'yyyy년 M월 d일 EEEE')} · 세션을 선택해 예약하세요.
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
            <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5 line-clamp-1">
              {latestNotice.content}
            </p>
          </div>
          <span className="text-[12px] text-[var(--color-text-muted)] shrink-0 tabular-nums">
            {formatKoreanDate(latestNotice.createdAt, 'M.d')}
          </span>
        </div>
      )}

      {/* Calendar Panel */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        {/* Calendar toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="inline-flex border border-[var(--color-border)] rounded overflow-hidden">
              {(['week', 'month'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'h-9 md:h-7 px-3 text-[12.5px] md:text-[12px] transition-colors',
                    view === v
                      ? 'bg-[var(--color-text)] text-white'
                      : 'bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                  )}
                >
                  {v === 'week' ? '주간' : '월간'}
                </button>
              ))}
            </div>
            <button
              onClick={goToday}
              className="h-9 md:h-7 text-[12.5px] md:text-[12px] px-3 border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            >
              오늘
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('prev')}
              aria-label="이전"
              className="w-10 h-10 inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-hover)] rounded"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-[13px] font-medium text-[var(--color-text)] min-w-[160px] text-center tabular-nums">
              {view === 'week'
                ? `${format(weekDays[0], 'yyyy.M.d')} — ${format(weekDays[6], 'M.d')}`
                : format(currentDate, 'yyyy년 M월')}
            </span>
            <button
              onClick={() => navigate('next')}
              aria-label="다음"
              className="w-10 h-10 inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-hover)] rounded"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
          {dayLabels.map((d, i) => (
            <div
              key={d}
              className={cn(
                'text-center text-[12px] py-2 font-medium',
                i === 0
                  ? 'text-[var(--color-danger)]'
                  : i === 6
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--color-text-secondary)]'
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Week grid */}
        {view === 'week' && (
          <div className="grid grid-cols-7">
            {weekDays.map(day => {
              const daySessions = getSessionsForDate(sessions, day);
              const selected = isSameDay(day, selectedDate);
              const tod = isToday(day);
              const dayNum = day.getDay();
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'min-h-[140px] border-r border-b border-[var(--color-border-subtle)] last:border-r-0 p-2 text-left transition-colors flex flex-col',
                    selected
                      ? 'bg-[var(--color-primary-bg)]'
                      : 'bg-white hover:bg-[var(--color-bg-subtle)]'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center justify-center text-[13px] font-medium tabular-nums',
                        tod
                          ? 'w-6 h-6 rounded-full bg-[var(--color-primary)] text-white'
                          : dayNum === 0
                          ? 'text-[var(--color-danger)]'
                          : dayNum === 6
                          ? 'text-[var(--color-primary)]'
                          : 'text-[var(--color-text)]'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {daySessions.length > 0 && (
                      <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                        {daySessions.length}개
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 flex-1">
                    {daySessions.slice(0, 3).map(s => {
                      const config = sessionTypeConfig[s.type];
                      return (
                        <div
                          key={s.id}
                          className="text-[11px] px-1.5 py-0.5 rounded truncate border"
                          style={{
                            backgroundColor: config.bgColor,
                            color: config.textColor,
                            borderColor: config.bgColor,
                          }}
                        >
                          <span className="tabular-nums">{s.startTime}</span> {s.name}
                        </div>
                      );
                    })}
                    {daySessions.length > 3 && (
                      <div className="text-[11px] text-[var(--color-text-muted)] px-1">
                        + {daySessions.length - 3}개 더
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Month grid */}
        {view === 'month' && (
          <div className="grid grid-cols-7">
            {Array.from({ length: monthDays[0].getDay() }).map((_, i) => (
              <div
                key={`pad-${i}`}
                className="min-h-[90px] border-r border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]"
              />
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
                    'min-h-[90px] border-r border-b border-[var(--color-border-subtle)] p-1.5 text-left transition-colors flex flex-col',
                    selected
                      ? 'bg-[var(--color-primary-bg)]'
                      : 'bg-white hover:bg-[var(--color-bg-subtle)]'
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex items-center justify-center text-[12px] font-medium tabular-nums mb-1 self-start',
                      tod
                        ? 'w-5 h-5 rounded-full bg-[var(--color-primary)] text-white'
                        : dayNum === 0
                        ? 'text-[var(--color-danger)]'
                        : dayNum === 6
                        ? 'text-[var(--color-primary)]'
                        : 'text-[var(--color-text)]'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  <div className="space-y-0.5 flex-1">
                    {daySessions.slice(0, 2).map(s => {
                      const config = sessionTypeConfig[s.type];
                      return (
                        <div
                          key={s.id}
                          className="text-[10px] leading-tight px-1 py-[1px] rounded truncate"
                          style={{ backgroundColor: config.bgColor, color: config.textColor }}
                        >
                          {s.name}
                        </div>
                      );
                    })}
                    {daySessions.length > 2 && (
                      <div className="text-[10px] text-[var(--color-text-muted)] px-1">
                        + {daySessions.length - 2}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="px-4 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)] flex items-center gap-4">
          {Object.entries(sessionTypeConfig).map(([key, config]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
              <span className="text-[12px] text-[var(--color-text-secondary)]">{config.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Session list for selected date */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">
            {formatKoreanDate(selectedDate, 'yyyy년 M월 d일 EEEE')} 세션
          </h2>
          <span className="text-[12px] text-[var(--color-text-muted)]">
            {sessionsForDate.length > 0 ? `${sessionsForDate.length}개 세션` : '세션 없음'}
          </span>
        </div>

        {sessionsForDate.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[13px] text-[var(--color-text-muted)]">선택한 날짜에 예정된 세션이 없습니다.</p>
            <button
              onClick={goToday}
              className="mt-2 text-[13px] text-[var(--color-primary)] hover:underline"
            >
              오늘로 이동
            </button>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                <th className="text-left font-medium px-4 py-2.5 w-[80px]">시간</th>
                <th className="text-left font-medium px-4 py-2.5 w-[120px]">유형</th>
                <th className="text-left font-medium px-4 py-2.5">세션명</th>
                <th className="text-left font-medium px-4 py-2.5 w-[180px]">장소</th>
                <th className="text-left font-medium px-4 py-2.5 w-[160px]">예약</th>
                <th className="text-right font-medium px-4 py-2.5 w-[100px]">상태</th>
              </tr>
            </thead>
            <tbody>
              {sessionsForDate.map(session => {
                const config = sessionTypeConfig[session.type];
                const full = isSessionFull(session);
                const ratio = session.maxCapacity > 0
                  ? Math.round((session.currentReservations / session.maxCapacity) * 100)
                  : 0;
                const statusLabel = getSessionStatusLabel(session);
                const isReserved = reservations.some(
                  r =>
                    r.sessionId === session.id &&
                    r.memberId === currentMember.id &&
                    r.status === 'reserved'
                );
                return (
                  <tr
                    key={session.id}
                    onClick={() => setSelectedSession(session)}
                    className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-[var(--color-text)] font-medium tabular-nums">
                      {session.startTime}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium"
                        style={{ backgroundColor: config.bgColor, color: config.textColor }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      <div className="flex items-center gap-2">
                        <span>{session.name}</span>
                        {session.isIndoor && (
                          <span className="text-[11px] text-[var(--color-text-muted)] border border-[var(--color-border)] rounded px-1.5 py-0">
                            실내
                          </span>
                        )}
                        {isReserved && (
                          <span className="text-[11px] font-medium px-1.5 py-0 rounded bg-[var(--color-primary-bg)] text-[var(--color-primary)] border border-[var(--color-primary-border)]">
                            예약됨
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {session.location || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] tabular-nums text-[var(--color-text)]">
                          {session.currentReservations} / {session.maxCapacity}
                        </span>
                        <div className="flex-1 h-1.5 bg-[var(--color-bg-hover)] rounded overflow-hidden max-w-[80px]">
                          <div
                            className="h-full rounded"
                            style={{
                              width: `${ratio}%`,
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
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          'text-[12px]',
                          full
                            ? 'text-[var(--color-danger)]'
                            : ratio >= 80
                            ? 'text-[var(--color-warning)]'
                            : 'text-[var(--color-success)]'
                        )}
                      >
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
