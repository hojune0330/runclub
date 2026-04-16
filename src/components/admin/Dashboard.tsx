'use client';

import { useMemo } from 'react';
import { sessions, members, memberPasses, reservations } from '@/data/mock';
import { formatKoreanDate, isPassExpiringSoon, cn, getSessionColor, format, getDaysUntilExpiry } from '@/lib/utils';
import { Users, Calendar, Ticket, TrendingUp, AlertTriangle, ChevronRight, Activity } from 'lucide-react';
import { sessionTypeConfig } from '@/data/mock';

export default function Dashboard() {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  const todaySessions = useMemo(() => sessions.filter(s => s.date === today), [today]);
  const activeMembers = members.filter(m => m.isActive).length;
  const expiringPasses = memberPasses.filter(p => p.status === 'active' && isPassExpiringSoon(p, 7));
  const recentMembers = members
    .filter(m => m.isActive)
    .sort((a, b) => b.joinDate.localeCompare(a.joinDate))
    .slice(0, 5);

  // Weekly attendance rate
  const weekStartDate = new Date();
  weekStartDate.setDate(weekStartDate.getDate() - 7);
  const weekStart = format(weekStartDate, 'yyyy-MM-dd');

  const thisWeekReservations = reservations.filter(r => {
    const session = r.session || sessions.find(s => s.id === r.sessionId);
    return session && session.date >= weekStart && session.date <= today;
  });
  const attendedCount = thisWeekReservations.filter(r => r.status === 'attended').length;
  const totalEligible = thisWeekReservations.filter(r => r.status === 'attended' || r.status === 'noshow').length;
  const weeklyAttendanceRate = totalEligible > 0 ? Math.round((attendedCount / totalEligible) * 100) : 0;

  // Total reservations for today
  const todayTotalReservations = todaySessions.reduce((sum, s) => sum + s.currentReservations, 0);
  const todayTotalCapacity = todaySessions.reduce((sum, s) => sum + s.maxCapacity, 0);

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <h2 className="text-[24px] sm:text-[26px] font-extrabold text-gray-900 mb-1">대시보드</h2>
        <p className="text-[14px] text-gray-500 font-medium">{formatKoreanDate(new Date(), 'yyyy년 M월 d일 EEEE')}</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {[
          { label: '활성 회원', value: activeMembers, suffix: '명', icon: Users, color: 'blue', bg: 'from-blue-500 to-blue-600' },
          { label: '오늘 세션', value: todaySessions.length, suffix: '건', icon: Calendar, color: 'emerald', bg: 'from-emerald-500 to-emerald-600' },
          { label: '주간 출석률', value: weeklyAttendanceRate, suffix: '%', icon: TrendingUp, color: 'violet', bg: 'from-violet-500 to-violet-600' },
          { label: '만료 임박', value: expiringPasses.length, suffix: '건', icon: AlertTriangle, color: expiringPasses.length > 0 ? 'red' : 'gray', bg: expiringPasses.length > 0 ? 'from-red-500 to-red-600' : 'from-gray-400 to-gray-500' },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">{metric.label}</span>
                <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm", metric.bg)}>
                  <Icon size={18} className="text-white" />
                </div>
              </div>
              <p className="text-[32px] font-extrabold text-gray-900 leading-none mb-1">
                {metric.value}
                <span className="text-[14px] text-gray-400 font-medium ml-1">{metric.suffix}</span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Two Columns */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 sm:gap-6">
        {/* Today's Sessions - wider */}
        <div className="xl:col-span-3 bg-white rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-[16px] font-bold text-gray-900">오늘의 세션</h3>
              <p className="text-[12px] text-gray-400 font-medium mt-0.5">
                총 {todayTotalReservations} / {todayTotalCapacity}명 예약
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-emerald-500" />
              <span className="text-[12px] font-bold text-emerald-500">
                {todayTotalCapacity > 0 ? Math.round((todayTotalReservations / todayTotalCapacity) * 100) : 0}% 예약률
              </span>
            </div>
          </div>

          {todaySessions.length === 0 ? (
            <div className="py-12 text-center">
              <Calendar size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-[14px] text-gray-400 font-medium">오늘 예정된 세션이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todaySessions.map(session => {
                const config = sessionTypeConfig[session.type];
                const ratio = session.maxCapacity > 0
                  ? Math.round((session.currentReservations / session.maxCapacity) * 100) : 0;
                const full = session.currentReservations >= session.maxCapacity;
                return (
                  <div key={session.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100/80 transition-colors">
                    <div className="w-1.5 h-12 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md text-white"
                          style={{ backgroundColor: config.color }}>{config.label}</span>
                        <p className="text-[14px] font-bold text-gray-800 truncate">{session.name}</p>
                      </div>
                      <p className="text-[12px] text-gray-400 font-medium">{session.startTime} · {session.location}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[16px] font-extrabold text-gray-900 mb-1">
                        {session.currentReservations}<span className="text-[12px] text-gray-400 font-medium">/{session.maxCapacity}</span>
                      </p>
                      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${ratio}%`,
                          backgroundColor: full ? '#ef4444' : config.color,
                        }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="xl:col-span-2 space-y-4 sm:space-y-6">
          {/* Recent Members */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h3 className="text-[15px] font-bold text-gray-900 mb-4">최근 가입 회원</h3>
            <div className="space-y-3">
              {recentMembers.map((member, i) => (
                <div key={member.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <span className="text-[12px] font-bold text-gray-500">{member.name.charAt(0)}</span>
                    </div>
                    <div>
                      <span className="text-[13px] font-semibold text-gray-700 block">{member.name}</span>
                      <span className="text-[11px] text-gray-400">{member.phone}</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-400 font-medium">{formatKoreanDate(member.joinDate, 'M.d')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Expiring Passes Alert */}
          {expiringPasses.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-red-100 shadow-sm">
              <h3 className="text-[15px] font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertTriangle size={14} className="text-red-500" />
                </div>
                만료 임박 수강권
              </h3>
              <div className="space-y-3">
                {expiringPasses.slice(0, 5).map(pass => {
                  const daysLeft = getDaysUntilExpiry(pass);
                  return (
                    <div key={pass.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-[13px] font-semibold text-gray-700">{pass.memberName}</p>
                        <p className="text-[11px] text-gray-400">{pass.productName}</p>
                      </div>
                      <span className="text-[11px] font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded-lg">
                        {daysLeft}일 남음
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
