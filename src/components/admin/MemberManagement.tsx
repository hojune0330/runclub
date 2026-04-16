'use client';

import { useState, useMemo } from 'react';
import { Search, Plus, ChevronRight, Phone, Mail, Calendar, Users } from 'lucide-react';
import { members, memberPasses, reservations, sessions, sessionTypeConfig } from '@/data/mock';
import { formatKoreanDate, formatPrice, cn, getDaysUntilExpiry, isPassExpiringSoon, getSessionColor } from '@/lib/utils';
import type { Member } from '@/types';

export default function MemberManagement() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      if (filter === 'active' && !m.isActive) return false;
      if (filter === 'inactive' && m.isActive) return false;
      if (search && !m.name.includes(search) && !m.phone.includes(search)) return false;
      return true;
    }).sort((a, b) => b.joinDate.localeCompare(a.joinDate));
  }, [search, filter]);

  const memberDetail = useMemo(() => {
    if (!selectedMember) return null;
    const passes = memberPasses.filter(p => p.memberId === selectedMember.id);
    const memberReservations = reservations
      .filter(r => r.memberId === selectedMember.id)
      .map(r => ({ ...r, session: r.session || sessions.find(s => s.id === r.sessionId) }))
      .sort((a, b) => (b.session?.date || '').localeCompare(a.session?.date || ''));
    return { passes, reservations: memberReservations };
  }, [selectedMember]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-[26px] font-extrabold text-gray-900">회원 관리</h2>
          <p className="text-[13px] text-gray-400 font-medium mt-0.5">
            전체 {members.length}명 · 활성 {members.filter(m => m.isActive).length}명
          </p>
        </div>
        <button className="flex items-center gap-2 text-[13px] font-bold text-white bg-gray-900 px-5 py-2.5 rounded-xl hover:bg-gray-800 transition-colors shadow-sm">
          <Plus size={16} />
          회원 등록
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Member List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Search + Filter */}
          <div className="p-4 border-b border-gray-100">
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                type="text"
                placeholder="이름 또는 연락처 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-[13px] font-medium border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-400 transition-colors bg-gray-50"
              />
            </div>
            <div className="flex gap-1">
              {(['all', 'active', 'inactive'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "text-[12px] px-3 py-1.5 rounded-lg transition-all font-semibold",
                    filter === f ? "bg-gray-900 text-white" : "text-gray-400 hover:bg-gray-100"
                  )}
                >
                  {f === 'all' ? '전체' : f === 'active' ? '활성' : '비활성'}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[600px] overflow-y-auto">
            {filteredMembers.map(member => {
              const isSelected = selectedMember?.id === member.id;
              const passes = memberPasses.filter(p => p.memberId === member.id && p.status === 'active');
              return (
                <button
                  key={member.id}
                  onClick={() => setSelectedMember(member)}
                  className={cn(
                    "w-full text-left py-3.5 px-4 transition-all flex items-center justify-between border-b border-gray-50",
                    isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold",
                      member.isActive ? "bg-gray-100 text-gray-600" : "bg-gray-50 text-gray-300"
                    )}>
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <p className={cn("text-[13px] font-bold", member.isActive ? "text-gray-800" : "text-gray-400")}>
                        {member.name}
                        {!member.isActive && <span className="text-[10px] text-gray-300 ml-1 font-medium">비활성</span>}
                      </p>
                      <p className="text-[11px] text-gray-400 font-medium">
                        수강권 {passes.length}건
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={14} className={cn(isSelected ? "text-blue-400" : "text-gray-200")} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Member Detail */}
        <div className="lg:col-span-2">
          {!selectedMember ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
              <Users size={40} className="text-gray-200 mx-auto mb-3" />
              <p className="text-[15px] text-gray-400 font-medium">회원을 선택하세요</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in lg:sticky lg:top-36">
              {/* Member Info Header */}
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center shadow-sm">
                      <span className="text-[20px] font-bold text-white">{selectedMember.name.charAt(0)}</span>
                    </div>
                    <div>
                      <h3 className="text-[20px] font-extrabold text-gray-900">{selectedMember.name}</h3>
                      <div className="flex items-center gap-4 mt-1.5 text-[13px] text-gray-500 font-medium">
                        <span className="flex items-center gap-1.5"><Phone size={13} className="text-gray-400" />{selectedMember.phone}</span>
                        {selectedMember.email && <span className="flex items-center gap-1.5"><Mail size={13} className="text-gray-400" />{selectedMember.email}</span>}
                      </div>
                      <p className="text-[12px] text-gray-400 mt-1 font-medium flex items-center gap-1.5">
                        <Calendar size={12} />가입 {formatKoreanDate(selectedMember.joinDate, 'yyyy.M.d')}
                      </p>
                    </div>
                  </div>
                  <button className="text-[12px] font-bold text-blue-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">수정</button>
                </div>
                {selectedMember.memo && (
                  <p className="mt-3 text-[13px] text-gray-500 bg-white rounded-xl px-4 py-2.5 border border-gray-100">{selectedMember.memo}</p>
                )}
              </div>

              {/* Passes */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[15px] font-bold text-gray-900">수강권</h4>
                  <button className="text-[12px] font-bold text-blue-500 hover:text-blue-600">발급</button>
                </div>
                {memberDetail?.passes.length === 0 ? (
                  <p className="text-[13px] text-gray-300 font-medium">보유 수강권 없음</p>
                ) : (
                  <div className="space-y-2">
                    {memberDetail?.passes.map(pass => {
                      const daysLeft = getDaysUntilExpiry(pass);
                      const config = pass.applicableSessions !== 'all' ? sessionTypeConfig[pass.applicableSessions[0]] : null;
                      return (
                        <div key={pass.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            {config && <div className="w-2 h-8 rounded-full" style={{ backgroundColor: config.color }} />}
                            <div>
                              <p className="text-[13px] font-bold text-gray-700">{pass.productName}</p>
                              <p className="text-[11px] text-gray-400 font-medium">
                                {pass.category === 'count' ? `잔여 ${pass.remainingCount}/${pass.totalCount}회` : `${pass.category === 'season' ? '시즌권' : '월권'}`}
                                {' · '}{formatKoreanDate(pass.expiryDate, 'M.d')} 만료
                              </p>
                            </div>
                          </div>
                          <span className={cn(
                            "text-[11px] font-bold px-2.5 py-1 rounded-lg",
                            pass.status === 'active'
                              ? (daysLeft <= 7 ? "bg-red-100 text-red-500" : "bg-emerald-100 text-emerald-600")
                              : "bg-gray-100 text-gray-400"
                          )}>
                            {pass.status === 'active' ? `${daysLeft}일 남음` : pass.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent Reservations */}
              <div className="p-6">
                <h4 className="text-[15px] font-bold text-gray-900 mb-4">최근 예약/출석</h4>
                {memberDetail?.reservations.length === 0 ? (
                  <p className="text-[13px] text-gray-300 font-medium">예약 이력 없음</p>
                ) : (
                  <div className="space-y-2">
                    {memberDetail?.reservations.slice(0, 8).map(r => {
                      if (!r.session) return null;
                      const config = sessionTypeConfig[r.session.type];
                      return (
                        <div key={r.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: config.color }} />
                            <div>
                              <p className="text-[13px] font-semibold text-gray-700">{r.session.name}</p>
                              <p className="text-[11px] text-gray-400 font-medium">{formatKoreanDate(r.session.date, 'M.d (EEE)')} {r.session.startTime}</p>
                            </div>
                          </div>
                          <span className={cn(
                            "text-[11px] font-bold px-2.5 py-1 rounded-lg",
                            r.status === 'attended' ? "bg-emerald-100 text-emerald-600" :
                            r.status === 'noshow' ? "bg-red-100 text-red-500" :
                            r.status === 'cancelled' ? "bg-gray-100 text-gray-400" :
                            "bg-blue-100 text-blue-600"
                          )}>
                            {r.status === 'reserved' ? '예약' : r.status === 'attended' ? '출석' : r.status === 'noshow' ? '노쇼' : '취소'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
