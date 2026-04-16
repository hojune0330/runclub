'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Clock, Users, Bell, Calendar } from 'lucide-react';
import { sessions, sessionTypeConfig, reservations, currentMember, notices } from '@/data/mock';
import { getWeekDays, getMonthDays, getSessionsForDate, getSessionStatusLabel, isSessionFull, formatKoreanDate, navigateDate, cn, isToday, isSameDay, format, getSessionColor } from '@/lib/utils';
import type { CalendarView as CalendarViewType, Session } from '@/types';
import SessionDetail from './SessionDetail';

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType>('week');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const monthDays = useMemo(() => getMonthDays(currentDate), [currentDate]);

  const navigate = (dir: 'prev' | 'next') => {
    setCurrentDate(navigateDate(currentDate, view, dir));
  };

  const sessionsForDate = useMemo(() => getSessionsForDate(sessions, selectedDate), [selectedDate]);
  const latestNotice = notices.find(n => !n.isRead);

  // Count of my reservations for today
  const myTodayReservations = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return reservations.filter(
      r => r.memberId === currentMember.id && r.status === 'reserved' && r.session?.date === todayStr
    ).length;
  }, []);

  if (selectedSession) {
    return <SessionDetail session={selectedSession} onBack={() => setSelectedSession(null)} />;
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[24px] font-extrabold tracking-tight text-gray-900">런클럽</h1>
          <div className="flex items-center gap-3">
            {latestNotice && (
              <div className="relative">
                <Bell size={20} className="text-gray-400" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
              </div>
            )}
          </div>
        </div>
        <p className="text-[14px] text-gray-500 font-medium">
          {formatKoreanDate(new Date(), 'yyyy년 M월 d일 EEEE')}
        </p>
      </div>

      {/* Notice Banner */}
      {latestNotice && (
        <div className="mx-5 mt-3 px-4 py-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100/50">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <Bell size={14} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-blue-600 mb-0.5 uppercase tracking-wide">새 공지</p>
              <p className="text-[14px] text-gray-800 font-medium leading-snug line-clamp-2">{latestNotice.title}</p>
            </div>
          </div>
        </div>
      )}

      {/* View Toggle + Navigation */}
      <div className="px-5 pt-5 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-[3px]">
            {(['week', 'month'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "text-[13px] px-4 py-2 rounded-lg font-semibold transition-all",
                  view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                {v === 'week' ? '주간' : '월간'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate('prev')} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
              className="text-[13px] font-bold text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-50 min-w-[120px] text-center"
            >
              {view === 'week'
                ? `${format(weekDays[0], 'M.d')} — ${format(weekDays[6], 'M.d')}`
                : format(currentDate, 'yyyy년 M월')
              }
            </button>
            <button onClick={() => navigate('next')} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Week Calendar */}
      {view === 'week' && (
        <div className="px-5 mb-3">
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map(day => {
              const daySessions = getSessionsForDate(sessions, day);
              const selected = isSameDay(day, selectedDate);
              const tod = isToday(day);
              const dayNum = day.getDay();
              const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "flex flex-col items-center py-3 rounded-2xl transition-all relative",
                    selected ? "bg-gray-900 shadow-lg shadow-gray-900/20" : tod ? "bg-orange-50" : "hover:bg-gray-50"
                  )}
                >
                  <span className={cn(
                    "text-[11px] font-semibold mb-1.5",
                    selected ? "text-gray-500" : dayNum === 0 ? "text-red-400" : dayNum === 6 ? "text-blue-400" : "text-gray-400"
                  )}>
                    {dayLabels[dayNum]}
                  </span>
                  <span className={cn(
                    "text-[17px] font-bold mb-2",
                    selected ? "text-white" : tod ? "text-orange-600" : "text-gray-800"
                  )}>
                    {format(day, 'd')}
                  </span>
                  <div className="flex gap-[3px] h-[6px] items-center">
                    {daySessions.length > 0 ? (
                      daySessions.slice(0, 3).map((s, i) => (
                        <div
                          key={i}
                          className="w-[5px] h-[5px] rounded-full transition-all"
                          style={{ backgroundColor: selected ? 'rgba(255,255,255,0.6)' : sessionTypeConfig[s.type].color }}
                        />
                      ))
                    ) : (
                      <div className="w-[5px] h-[5px]" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Month Calendar */}
      {view === 'month' && (
        <div className="px-5 mb-3">
          <div className="grid grid-cols-7 mb-2">
            {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => (
              <div key={d} className={cn(
                "text-center text-[12px] font-semibold py-2",
                i === 5 ? "text-blue-400" : i === 6 ? "text-red-400" : "text-gray-400"
              )}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: (monthDays[0].getDay() + 6) % 7 }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {monthDays.map(day => {
              const daySessions = getSessionsForDate(sessions, day);
              const selected = isSameDay(day, selectedDate);
              const tod = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "flex flex-col items-center py-2.5 rounded-xl transition-all",
                    selected && "bg-gray-900"
                  )}
                >
                  <span className={cn(
                    "text-[14px] font-semibold mb-1",
                    selected ? "text-white" : tod ? "text-orange-600 font-bold" : "text-gray-700"
                  )}>
                    {format(day, 'd')}
                  </span>
                  <div className="flex gap-[2px] h-[5px]">
                    {daySessions.slice(0, 3).map((s, i) => (
                      <div
                        key={i}
                        className="w-[4px] h-[4px] rounded-full"
                        style={{ backgroundColor: selected ? 'rgba(255,255,255,0.5)' : sessionTypeConfig[s.type].color }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Session Type Legend */}
      <div className="px-5 py-2 flex items-center gap-4 mb-1">
        {Object.entries(sessionTypeConfig).map(([key, config]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
            <span className="text-[11px] font-medium text-gray-400">{config.label}</span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="h-[6px] bg-gray-50" />

      {/* Selected Date Session List */}
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[17px] font-bold text-gray-900">
              {formatKoreanDate(selectedDate, 'M월 d일 EEEE')}
            </p>
            <p className="text-[13px] text-gray-500 mt-0.5">
              {sessionsForDate.length > 0 ? `${sessionsForDate.length}개 세션` : '세션 없음'}
            </p>
          </div>
        </div>

        {sessionsForDate.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
              <Calendar size={28} className="text-gray-200" />
            </div>
            <p className="text-[15px] text-gray-500 font-medium mb-1">예정된 세션이 없습니다</p>
            <p className="text-[13px] text-gray-400">다른 날짜를 선택하거나 오늘로 이동해보세요</p>
            <button
              onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
              className="mt-4 px-4 py-2 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 transition-colors"
            >
              오늘 세션 보기
            </button>
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {sessionsForDate.map(session => {
              const full = isSessionFull(session);
              const statusLabel = getSessionStatusLabel(session);
              const config = sessionTypeConfig[session.type];
              const isReserved = reservations.some(
                r => r.sessionId === session.id && r.memberId === currentMember.id && r.status === 'reserved'
              );
              const ratio = Math.round((session.currentReservations / session.maxCapacity) * 100);

              return (
                <button
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className={cn(
                    "w-full text-left rounded-2xl p-4 transition-all active:scale-[0.98]",
                    "bg-white border-2 hover:shadow-md",
                    isReserved ? "border-blue-200 bg-blue-50/30" : "border-gray-100 hover:border-gray-200"
                  )}
                >
                  {/* Top row: type tag + status */}
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg text-white"
                        style={{ backgroundColor: config.color }}
                      >
                        {config.label}
                      </span>
                      {session.isIndoor && (
                        <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                          실내
                        </span>
                      )}
                      {isReserved && (
                        <span className="text-[11px] font-bold text-blue-600 bg-blue-100 px-2.5 py-0.5 rounded-lg">
                          예약됨
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "text-[12px] font-bold",
                      full ? "text-red-500" : ratio >= 80 ? "text-amber-500" : "text-emerald-500"
                    )}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Session name */}
                  <h3 className="text-[16px] font-bold text-gray-900 mb-2.5">{session.name}</h3>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3">
                    <span className="flex items-center gap-1.5 text-[13px] text-gray-500 font-medium">
                      <Clock size={14} className="text-gray-400" />
                      {session.startTime}
                      {session.endTime && <span className="text-gray-300">— {session.endTime}</span>}
                    </span>
                    <span className="flex items-center gap-1.5 text-[13px] text-gray-500 font-medium">
                      <Users size={14} className="text-gray-400" />
                      <span className="font-bold text-gray-700">{session.currentReservations}</span>
                      <span className="text-gray-300">/ {session.maxCapacity}명</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[13px] text-gray-500 font-medium">
                      <MapPin size={14} className="text-gray-400" />
                      {session.location}
                    </span>
                  </div>

                  {/* Memo */}
                  {session.memo && session.memoPublic && (
                    <p className="text-[12px] text-gray-500 bg-gray-50 rounded-xl px-3.5 py-2.5 leading-relaxed mb-3 border border-gray-100">
                      💡 {session.memo}
                    </p>
                  )}

                  {/* Capacity bar */}
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${ratio}%`,
                        backgroundColor: full ? '#ef4444' : ratio >= 80 ? '#f59e0b' : config.color,
                      }}
                    />
                  </div>
                  {session.waitlistCount > 0 && (
                    <p className="text-[11px] text-amber-600 font-medium mt-1.5">
                      대기 {session.waitlistCount}명
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
