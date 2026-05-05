'use client';

import { useState, useMemo } from 'react';
import { Search, Plus, X, Phone, Mail, Calendar as CalIcon } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig, reservationStatusConfig, passStatusConfig } from '@/lib/config';
import { formatKoreanDate, cn, getDaysUntilExpiry } from '@/lib/utils';
import { Modal, FormField, Badge } from '@/components/ui';
import type { Member } from '@/types';

export default function MemberManagement() {
  const { members, memberPasses, reservations, sessions, addMember } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Add form
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');

  const filteredMembers = useMemo(() => {
    return members
      .filter(m => {
        if (filter === 'active' && !m.isActive) return false;
        if (filter === 'inactive' && m.isActive) return false;
        if (search && !m.name.includes(search) && !m.phone.includes(search)) return false;
        return true;
      })
      .sort((a, b) => b.joinDate.localeCompare(a.joinDate));
  }, [members, search, filter]);

  const memberDetail = useMemo(() => {
    if (!selectedMember) return null;
    const passes = memberPasses.filter(p => p.memberId === selectedMember.id);
    const memberReservations = reservations
      .filter(r => r.memberId === selectedMember.id)
      .map(r => ({ ...r, session: r.session || sessions.find(s => s.id === r.sessionId) }))
      .sort((a, b) => (b.session?.date || '').localeCompare(a.session?.date || ''));
    return { passes, reservations: memberReservations };
  }, [selectedMember, memberPasses, reservations, sessions]);

  const handleAddMember = async () => {
    if (!formName.trim() || !formPhone.trim()) return;
    const result = await addMember({
      name: formName.trim(),
      phone: formPhone.trim(),
      email: formEmail.trim() || undefined,
      joinDate: new Date().toISOString().split('T')[0],
      isActive: true,
    });
    if (result) {
      setShowAdd(false);
      setFormName('');
      setFormPhone('');
      setFormEmail('');
      if (result.defaultPassword) {
        alert(`회원이 등록되었습니다.\n초기 비밀번호: ${result.defaultPassword}\n\n첫 로그인 시 비밀번호를 변경해야 합니다. 회원에게 안전하게 전달해 주세요.`);
      }
    }
  };

  // Count per member
  const activePassCountByMember = useMemo(() => {
    const m: Record<string, number> = {};
    memberPasses.forEach(p => {
      if (p.status === 'active') {
        m[p.memberId] = (m[p.memberId] || 0) + 1;
      }
    });
    return m;
  }, [memberPasses]);

  const lastAttendanceByMember = useMemo(() => {
    const m: Record<string, string> = {};
    reservations.forEach(r => {
      if (r.status === 'attended') {
        const s = r.session || sessions.find(x => x.id === r.sessionId);
        if (s && (!m[r.memberId] || s.date > m[r.memberId])) {
          m[r.memberId] = s.date;
        }
      }
    });
    return m;
  }, [reservations, sessions]);

  return (
    <div className="max-w-[1400px] space-y-5">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--color-text)]">회원 관리</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
            전체 {members.length}명 · 활성 {members.filter(m => m.isActive).length}명
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="h-11 md:h-9 flex items-center gap-1.5 px-3.5 text-[13px] font-medium text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <Plus size={15} />
          회원 등록
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-[var(--color-border)] rounded-md px-3 md:px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3 md:flex-wrap">
        <div className="relative w-full md:w-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="이름 또는 연락처로 검색"
            className="pl-8 pr-3 h-10 md:h-9 text-[16px] md:text-[13px] border border-[var(--color-border)] rounded w-full md:w-[240px] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        <div className="hidden md:block h-4 w-px bg-[var(--color-border)]" />

        <div className="flex items-center gap-1 overflow-x-auto md:overflow-visible -mx-3 md:mx-0 px-3 md:px-0 scrollbar-none">
          <span className="text-[12px] text-[var(--color-text-muted)] mr-1 shrink-0">상태</span>
          {([
            { id: 'all', label: '전체' },
            { id: 'active', label: '활성' },
            { id: 'inactive', label: '비활성' },
          ] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 h-9 md:h-7 px-3 md:px-2.5 text-[12.5px] md:text-[12px] rounded border transition-colors",
                filter === f.id
                  ? "bg-[var(--color-text)] text-white border-[var(--color-text)]"
                  : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <span className="text-[12px] text-[var(--color-text-muted)]">
          {filteredMembers.length}명
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
              <th className="text-left font-medium px-4 py-2.5">이름</th>
              <th className="text-left font-medium px-4 py-2.5">연락처</th>
              <th className="text-left font-medium px-4 py-2.5">이메일</th>
              <th className="text-left font-medium px-4 py-2.5 w-[110px]">가입일</th>
              <th className="text-center font-medium px-4 py-2.5 w-[100px]">활성 수강권</th>
              <th className="text-left font-medium px-4 py-2.5 w-[110px]">최근 출석</th>
              <th className="text-center font-medium px-4 py-2.5 w-[80px]">상태</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-14 text-center text-[13px] text-[var(--color-text-muted)]">
                  조회된 회원이 없습니다.
                </td>
              </tr>
            ) : (
              filteredMembers.map(m => {
                const isSelected = selectedMember?.id === m.id;
                const activePasses = activePassCountByMember[m.id] || 0;
                const lastAttend = lastAttendanceByMember[m.id];
                return (
                  <tr
                    key={m.id}
                    onClick={() => setSelectedMember(m)}
                    className={cn(
                      "border-b border-[var(--color-border-subtle)] last:border-0 cursor-pointer transition-colors",
                      isSelected ? "bg-[var(--color-primary-bg)]" : "hover:bg-[var(--color-bg-subtle)]"
                    )}
                  >
                    <td className="px-4 py-2.5 text-[var(--color-text)] font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center shrink-0">
                          <span className="text-[12px] text-[var(--color-text-secondary)] font-medium">{m.name.charAt(0)}</span>
                        </div>
                        {m.name}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-secondary)] tabular-nums">{m.phone}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{m.email || '—'}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-secondary)] tabular-nums">
                      {formatKoreanDate(m.joinDate, 'yyyy.M.d')}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums">
                      {activePasses > 0 ? (
                        <span className="text-[var(--color-text)]">{activePasses}건</span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-secondary)] tabular-nums">
                      {lastAttend ? formatKoreanDate(lastAttend, 'yyyy.M.d') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {m.isActive ? (
                        <Badge tone="success">활성</Badge>
                      ) : (
                        <Badge tone="muted">비활성</Badge>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detail */}
      {selectedMember && memberDetail && (
        <section className="bg-white border border-[var(--color-border)] rounded-md animate-fade-in">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">회원 상세</h2>
            <button onClick={() => setSelectedMember(null)} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-3 divide-x divide-[var(--color-border)]">
            {/* Profile */}
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <span className="text-[16px] text-white font-medium">{selectedMember.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[16px] font-semibold text-[var(--color-text)]">{selectedMember.name}</h3>
                    {selectedMember.isActive ? <Badge tone="success">활성</Badge> : <Badge tone="muted">비활성</Badge>}
                  </div>
                </div>
              </div>

              <dl className="space-y-2 text-[13px]">
                <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <Phone size={13} className="text-[var(--color-text-muted)]" />
                  <span className="tabular-nums">{selectedMember.phone}</span>
                </div>
                {selectedMember.email && (
                  <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                    <Mail size={13} className="text-[var(--color-text-muted)]" />
                    {selectedMember.email}
                  </div>
                )}
                <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <CalIcon size={13} className="text-[var(--color-text-muted)]" />
                  가입 {formatKoreanDate(selectedMember.joinDate, 'yyyy.M.d')}
                </div>
              </dl>

              {selectedMember.memo && (
                <div className="mt-4 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] rounded text-[12.5px] text-[var(--color-text-secondary)] leading-relaxed">
                  <p className="text-[11px] text-[var(--color-text-muted)] mb-1">메모</p>
                  {selectedMember.memo}
                </div>
              )}
            </div>

            {/* Passes */}
            <div className="p-5">
              <h3 className="text-[13.5px] font-semibold text-[var(--color-text)] mb-3">
                수강권 <span className="text-[var(--color-text-muted)] font-normal">{memberDetail.passes.length}건</span>
              </h3>
              {memberDetail.passes.length === 0 ? (
                <p className="text-[13px] text-[var(--color-text-muted)] py-6 text-center border border-dashed border-[var(--color-border)] rounded">
                  보유 수강권 없음
                </p>
              ) : (
                <ul className="space-y-2">
                  {memberDetail.passes.map(p => {
                    const daysLeft = getDaysUntilExpiry(p);
                    return (
                      <li key={p.id} className="border border-[var(--color-border)] rounded p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[13px] font-medium text-[var(--color-text)]">{p.productName}</p>
                          <Badge tone={p.status === 'active' ? 'success' : 'muted'}>
                            {passStatusConfig[p.status].label}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[12px] text-[var(--color-text-muted)] tabular-nums">
                          <span>
                            {p.category === 'count'
                              ? `잔여 ${p.remainingCount}/${p.totalCount}회`
                              : p.category === 'season' ? '시즌권' : '월권'}
                          </span>
                          <span className={p.status === 'active' && daysLeft <= 7 ? 'text-[var(--color-danger)]' : ''}>
                            {formatKoreanDate(p.expiryDate, 'M.d')} 만료
                            {p.status === 'active' && ` · D-${daysLeft}`}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Reservation history */}
            <div className="p-5">
              <h3 className="text-[13.5px] font-semibold text-[var(--color-text)] mb-3">
                최근 예약/출석 <span className="text-[var(--color-text-muted)] font-normal">최근 8건</span>
              </h3>
              {memberDetail.reservations.length === 0 ? (
                <p className="text-[13px] text-[var(--color-text-muted)] py-6 text-center border border-dashed border-[var(--color-border)] rounded">
                  이력 없음
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border)] rounded overflow-hidden">
                  {memberDetail.reservations.slice(0, 8).map(r => {
                    if (!r.session) return null;
                    const config = sessionTypeConfig[r.session.type];
                    const statusConf = reservationStatusConfig[r.status];
                    return (
                      <li key={r.id} className="px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                          <div className="min-w-0">
                            <p className="text-[12.5px] text-[var(--color-text)] truncate">{r.session.name}</p>
                            <p className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums">
                              {formatKoreanDate(r.session.date, 'M.d (EEE)')} {r.session.startTime}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11.5px] shrink-0 ml-2" style={{ color: statusConf.color }}>
                          {statusConf.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Add modal */}
      {showAdd && (
        <Modal title="회원 등록" onClose={() => setShowAdd(false)} size="sm">
          <div className="space-y-4">
            <FormField label="이름" required>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="홍길동" className="form-input" />
            </FormField>
            <FormField label="연락처" required>
              <input type="tel" value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="010-0000-0000" className="form-input" />
            </FormField>
            <FormField label="이메일" hint="선택">
              <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@example.com" className="form-input" />
            </FormField>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)]">
                취소
              </button>
              <button
                onClick={handleAddMember}
                disabled={!formName.trim() || !formPhone.trim()}
                className={cn(
                  "flex-1 py-2 text-[13px] rounded transition-colors",
                  formName.trim() && formPhone.trim()
                    ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                    : "bg-[var(--color-bg-hover)] text-[var(--color-text-disabled)] cursor-not-allowed"
                )}
              >
                등록
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
