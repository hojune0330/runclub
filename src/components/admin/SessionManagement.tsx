'use client';

import { useState, useMemo } from 'react';
import { Plus, ChevronLeft, ChevronRight, Clock, Users, Edit3, Trash2, MapPin, Calendar } from 'lucide-react';
import { sessions, reservations, sessionTypeConfig, reservationStatusConfig } from '@/data/mock';
import { getWeekDays, getSessionsForDate, formatKoreanDate, cn, format, navigateDate, isSessionFull } from '@/lib/utils';
import type { Session, CalendarView } from '@/types';

export default function SessionManagement() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('week');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  const navigate = (dir: 'prev' | 'next') => {
    setCurrentDate(navigateDate(currentDate, view, dir));
  };

  const sessionReservations = useMemo(() => {
    if (!selectedSession) return [];
    return reservations
      .filter(r => r.sessionId === selectedSession.id && r.status !== 'cancelled')
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
  }, [selectedSession]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-[26px] font-extrabold text-gray-900">세션 관리</h2>
          <p className="text-[13px] text-gray-400 font-medium mt-0.5">세션 생성, 수정, 예약자 관리</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 text-[13px] font-bold text-white bg-gray-900 px-5 py-2.5 rounded-xl hover:bg-gray-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          세션 생성
        </button>
      </div>

      {/* Week Navigation */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-100 shadow-sm mb-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('prev')} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <span className="text-[15px] font-bold text-gray-900 min-w-[160px] text-center">
              {format(weekDays[0], 'M.d')} — {format(weekDays[6], 'M.d')}
            </span>
            <button onClick={() => navigate('next')} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors">
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="text-[12px] font-bold text-blue-500 hover:text-blue-600 ml-2 px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors"
            >
              오늘
            </button>
          </div>
          <div className="flex items-center gap-3">
            {Object.entries(sessionTypeConfig).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                <span className="text-[11px] font-medium text-gray-400">{config.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Week Grid */}
        <div className="grid grid-cols-7 gap-3">
          {weekDays.map(day => {
            const daySessions = getSessionsForDate(sessions, day);
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
            return (
              <div key={day.toISOString()}>
                <div className={cn(
                  'text-center mb-3 pb-2 border-b-2',
                  isToday ? 'border-blue-500' : 'border-gray-100'
                )}>
                  <p className={cn('text-[11px] font-semibold', isToday ? 'text-blue-500' : 'text-gray-400')}>
                    {['일', '월', '화', '수', '목', '금', '토'][day.getDay()]}
                  </p>
                  <p className={cn(
                    'text-[16px] font-bold',
                    isToday ? 'text-blue-600' : 'text-gray-700'
                  )}>
                    {format(day, 'd')}
                  </p>
                </div>
                <div className="space-y-2">
                  {daySessions.map(session => {
                    const isSelected = selectedSession?.id === session.id;
                    const full = isSessionFull(session);
                    const config = sessionTypeConfig[session.type];
                    return (
                      <button
                        key={session.id}
                        onClick={() => setSelectedSession(session)}
                        className={cn(
                          'w-full text-left p-2.5 rounded-xl transition-all border-l-3',
                          isSelected ? 'bg-gray-100 ring-2 ring-gray-300' : 'bg-gray-50 hover:bg-gray-100',
                          full && 'opacity-60'
                        )}
                        style={{ borderLeftColor: config.color }}
                      >
                        <p className="text-[12px] font-bold text-gray-800 truncate">{session.name}</p>
                        <p className="text-[11px] text-gray-400 font-medium mt-0.5">{session.startTime}</p>
                        <p className={cn(
                          'text-[11px] font-bold mt-0.5',
                          full ? 'text-red-500' : 'text-emerald-500'
                        )}>
                          {session.currentReservations}/{session.maxCapacity}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Session Detail / Reservation List */}
      {selectedSession && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm animate-fade-in overflow-hidden">
          <div className="grid grid-cols-1 xl:grid-cols-3">
            {/* Session Info */}
            <div className="p-6 border-r border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: sessionTypeConfig[selectedSession.type].color }} />
                <span className="text-[11px] font-bold text-gray-400 uppercase">{sessionTypeConfig[selectedSession.type].label}</span>
              </div>
              <h3 className="text-[18px] font-extrabold text-gray-900 mb-5">{selectedSession.name}</h3>

              <dl className="space-y-4">
                {[
                  { icon: Calendar, label: '날짜', value: formatKoreanDate(selectedSession.date, 'yyyy.M.d (EEE)') },
                  { icon: Clock, label: '시간', value: `${selectedSession.startTime}${selectedSession.endTime ? ` — ${selectedSession.endTime}` : ''}` },
                  { icon: MapPin, label: '장소', value: selectedSession.location },
                  { icon: Users, label: '인원', value: `${selectedSession.currentReservations} / ${selectedSession.maxCapacity}명` },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
                      <item.icon size={14} className="text-gray-400" />
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-400 font-semibold">{item.label}</dt>
                      <dd className="text-[13px] text-gray-800 font-medium mt-0.5">{item.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>

              <div className="mt-6 flex gap-2">
                <button className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 hover:text-blue-500 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors">
                  <Edit3 size={13} /> 수정
                </button>
                <button className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-400 hover:text-red-500 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 size={13} /> 삭제
                </button>
              </div>
            </div>

            {/* Reservation List */}
            <div className="xl:col-span-2 p-6">
              <div className="flex items-center justify-between mb-5">
                <h4 className="text-[15px] font-bold text-gray-900">
                  예약자 명단
                  <span className="text-[13px] text-gray-400 font-medium ml-2">{sessionReservations.length}명</span>
                </h4>
                <button className="flex items-center gap-1.5 text-[12px] font-bold text-blue-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                  <Plus size={13} /> 회원 추가
                </button>
              </div>

              {sessionReservations.length === 0 ? (
                <div className="py-12 text-center">
                  <Users size={32} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-[14px] text-gray-400">예약자가 없습니다</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-100">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-4 py-3 text-[11px] text-gray-400 font-bold uppercase tracking-wider">이름</th>
                        <th className="text-left px-4 py-3 text-[11px] text-gray-400 font-bold uppercase tracking-wider">예약 시간</th>
                        <th className="text-left px-4 py-3 text-[11px] text-gray-400 font-bold uppercase tracking-wider">상태</th>
                        <th className="text-right px-4 py-3 text-[11px] text-gray-400 font-bold uppercase tracking-wider">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionReservations.map(r => {
                        const statusConf = reservationStatusConfig[r.status];
                        return (
                          <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <span className="text-[13px] font-semibold text-gray-800">{r.memberName}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[12px] text-gray-400 font-medium">{formatKoreanDate(r.reservedAt, 'M.d HH:mm')}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                                style={{ color: statusConf.color, backgroundColor: statusConf.bgColor }}
                              >
                                {statusConf.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {r.status === 'reserved' && (
                                  <>
                                    <button className="text-[11px] font-bold text-emerald-500 hover:bg-emerald-50 px-2.5 py-1 rounded-lg transition-colors">출석</button>
                                    <button className="text-[11px] font-bold text-red-400 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors">노쇼</button>
                                  </>
                                )}
                                <button className="text-[11px] font-bold text-gray-400 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors">취소</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowCreateForm(false)}>
          <div className="bg-white rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-[18px] font-extrabold text-gray-900 mb-6">세션 생성</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] text-gray-500 font-bold mb-1.5 block">세션 유형</label>
                <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-700 font-medium focus:outline-none focus:border-blue-500 transition-colors">
                  <option value="ebw">EBW 실내 러닝</option>
                  <option value="slowrun">슬로우 롱런 클럽</option>
                  <option value="marathon">마라톤 클래스</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-gray-500 font-bold mb-1.5 block">날짜</label>
                  <input type="date" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-700 font-medium focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div>
                  <label className="text-[12px] text-gray-500 font-bold mb-1.5 block">시작 시간</label>
                  <input type="time" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-700 font-medium focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
              </div>
              <div>
                <label className="text-[12px] text-gray-500 font-bold mb-1.5 block">장소</label>
                <input type="text" placeholder="장소명" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-700 font-medium focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div>
                <label className="text-[12px] text-gray-500 font-bold mb-1.5 block">최대 인원</label>
                <input type="number" defaultValue={8} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-700 font-medium focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div>
                <label className="flex items-center gap-2.5 text-[13px] text-gray-600 font-medium cursor-pointer">
                  <input type="checkbox" className="w-5 h-5 rounded-lg border-2 border-gray-300 text-blue-500" />
                  반복 세션 (매주)
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-3 rounded-xl text-[14px] font-bold border-2 border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-3 rounded-xl text-[14px] font-bold bg-gray-900 text-white hover:bg-gray-800 transition-colors"
                >
                  생성
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
