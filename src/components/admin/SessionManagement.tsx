'use client';

import { useState, useMemo } from 'react';
import { Plus, X, Search, Calendar, Clock, MapPin, Users, Trash2, CalendarRange } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig, reservationStatusConfig } from '@/lib/config';
import { formatKoreanDate, cn, format, isSessionFull } from '@/lib/utils';
import { Modal, FormField } from '@/components/ui';
import type { Session, SessionType } from '@/types';

export default function SessionManagement() {
  const { sessions, reservations, createSession, deleteSession, updateReservationStatus, cancelReservation, refreshSessions } = useApp();

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | SessionType>('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('week');

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkFrom, setBulkFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [bulkTo, setBulkTo] = useState(format(new Date(Date.now() + 60 * 86400000), 'yyyy-MM-dd'));
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; upcomingTotal: number } | null>(null);

  // Create form
  const [formType, setFormType] = useState<SessionType>('ebw');
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formTime, setFormTime] = useState('18:00');
  const [formLocation, setFormLocation] = useState('');
  const [formCapacity, setFormCapacity] = useState(8);

  const filteredSessions = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekLater = format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd');
    const monthLater = format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd');

    return sessions
      .filter(s => {
        if (typeFilter !== 'all' && s.type !== typeFilter) return false;
        if (dateRange === 'today' && s.date !== today) return false;
        if (dateRange === 'week' && (s.date < today || s.date > weekLater)) return false;
        if (dateRange === 'month' && (s.date < today || s.date > monthLater)) return false;
        if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.location.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return a.startTime.localeCompare(b.startTime);
      });
  }, [sessions, search, typeFilter, dateRange]);

  const liveSession = selectedSession ? sessions.find(s => s.id === selectedSession.id) : null;

  const sessionReservations = useMemo(() => {
    if (!liveSession) return [];
    return reservations
      .filter(r => r.sessionId === liveSession.id && r.status !== 'cancelled')
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
  }, [liveSession, reservations]);

  const handleCreate = async () => {
    const names: Record<SessionType, string> = {
      ebw: 'EBW 실내 러닝',
      slowrun: '슬로우 롱런',
      marathon: '마라톤 클래스',
    };
    const endHour = parseInt(formTime.split(':')[0]) + (formType === 'ebw' ? 1 : 2);

    await createSession({
      name: names[formType],
      type: formType,
      date: formDate,
      startTime: formTime,
      endTime: `${String(endHour).padStart(2, '0')}:00`,
      location: formLocation,
      locationAddress: '',
      maxCapacity: formCapacity,
      isIndoor: formType === 'ebw',
      cancelDeadlineMinutes: 120,
    });
    setShowCreateForm(false);
    setFormType('ebw');
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormTime('18:00');
    setFormLocation('');
    setFormCapacity(8);
  };

  const handleDelete = async () => {
    if (liveSession && confirm(`[${liveSession.name}] 세션을 삭제하시겠습니까?\n예약자가 있다면 함께 취소됩니다.`)) {
      await deleteSession(liveSession.id);
      setSelectedSession(null);
    }
  };

  const handleBulkGenerate = async () => {
    if (!bulkFrom || !bulkTo || bulkFrom > bulkTo) {
      alert('기간을 확인해주세요. 시작일이 종료일보다 이후일 수 없습니다.');
      return;
    }
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const res = await fetch('/api/sessions/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ from: bulkFrom, to: bulkTo }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '일괄 생성에 실패했습니다.');
      }
      const data = await res.json();
      setBulkResult({ created: data.created, upcomingTotal: data.upcomingTotal });
      await refreshSessions();
    } catch (e: any) {
      alert(e.message || '오류가 발생했습니다.');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="max-w-[1400px] space-y-5">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--color-text)]">세션 관리</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
            세션 생성과 예약자 현황을 확인·관리합니다. (총 {sessions.length}건)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setBulkResult(null);
              setShowBulkForm(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded hover:bg-[var(--color-primary)]/20 transition-colors"
          >
            <CalendarRange size={15} />
            정기 스케줄 일괄 생성
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] transition-colors"
          >
            <Plus size={15} />
            세션 추가
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-[var(--color-border)] rounded-md px-3 md:px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3 md:flex-wrap">
        <div className="relative w-full md:w-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="세션명, 장소 검색"
            className="pl-8 pr-3 h-10 md:h-9 text-[16px] md:text-[13px] border border-[var(--color-border)] rounded w-full md:w-[220px] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        <Divider />

        <div className="flex items-center gap-1 overflow-x-auto md:overflow-visible -mx-3 md:mx-0 px-3 md:px-0 scrollbar-none">
          <span className="text-[12px] text-[var(--color-text-muted)] mr-1 shrink-0">기간</span>
          {([
            { id: 'today', label: '오늘' },
            { id: 'week', label: '이번 주' },
            { id: 'month', label: '이번 달' },
            { id: 'all', label: '전체' },
          ] as const).map(r => (
            <button
              key={r.id}
              onClick={() => setDateRange(r.id)}
              className={cn(
                "shrink-0 h-9 md:h-7 px-3 md:px-2.5 text-[12.5px] md:text-[12px] rounded border transition-colors",
                dateRange === r.id
                  ? "bg-[var(--color-text)] text-white border-[var(--color-text)]"
                  : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <Divider />

        <div className="flex items-center gap-1 overflow-x-auto md:overflow-visible -mx-3 md:mx-0 px-3 md:px-0 scrollbar-none">
          <span className="text-[12px] text-[var(--color-text-muted)] mr-1 shrink-0">유형</span>
          <button
            onClick={() => setTypeFilter('all')}
            className={cn(
              "shrink-0 h-9 md:h-7 px-3 md:px-2.5 text-[12.5px] md:text-[12px] rounded border transition-colors",
              typeFilter === 'all'
                ? "bg-[var(--color-text)] text-white border-[var(--color-text)]"
                : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
            )}
          >전체</button>
          {(Object.entries(sessionTypeConfig) as [SessionType, typeof sessionTypeConfig.ebw][]).map(([k, cfg]) => (
            <button
              key={k}
              onClick={() => setTypeFilter(k)}
              className={cn(
                "shrink-0 h-9 md:h-7 px-3 md:px-2.5 text-[12.5px] md:text-[12px] rounded border transition-colors flex items-center gap-1.5",
                typeFilter === k
                  ? "bg-[var(--color-text)] text-white border-[var(--color-text)]"
                  : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
              {cfg.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <span className="text-[12px] text-[var(--color-text-muted)]">
          {filteredSessions.length}건 조회됨
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
              <th className="text-left font-medium px-4 py-2.5 w-[130px] whitespace-nowrap">날짜</th>
              <th className="text-left font-medium px-4 py-2.5 w-[70px] whitespace-nowrap">시간</th>
              <th className="text-left font-medium px-4 py-2.5 w-[120px] whitespace-nowrap">유형</th>
              <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">세션명</th>
              <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">장소</th>
              <th className="text-right font-medium px-4 py-2.5 w-[130px] whitespace-nowrap">예약/정원</th>
              <th className="text-center font-medium px-4 py-2.5 w-[80px] whitespace-nowrap">상태</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-14 text-center text-[13px] text-[var(--color-text-muted)]">
                  조회 조건에 해당하는 세션이 없습니다.
                </td>
              </tr>
            ) : (
              filteredSessions.map(s => {
                const config = sessionTypeConfig[s.type];
                const full = isSessionFull(s);
                const ratio = s.maxCapacity > 0 ? (s.currentReservations / s.maxCapacity) * 100 : 0;
                const isSelected = liveSession?.id === s.id;
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedSession(s)}
                    className={cn(
                      "border-b border-[var(--color-border-subtle)] last:border-0 cursor-pointer transition-colors",
                      isSelected ? "bg-[var(--color-primary-bg)]" : "hover:bg-[var(--color-bg-subtle)]"
                    )}
                  >
                    <td className="px-4 py-2.5 text-[var(--color-text)] tabular-nums">
                      {formatKoreanDate(s.date, 'yyyy.M.d (EEE)')}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text)] tabular-nums font-medium">{s.startTime}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium whitespace-nowrap"
                        style={{ backgroundColor: config.bgColor, color: config.textColor }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text)] whitespace-nowrap">{s.name}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{s.location || '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={cn("tabular-nums", full ? "text-[var(--color-danger)]" : "text-[var(--color-text)]")}>
                          {s.currentReservations} / {s.maxCapacity}
                        </span>
                        <div className="w-12 h-1.5 bg-[var(--color-bg-hover)] rounded overflow-hidden">
                          <div className="h-full rounded" style={{ width: `${ratio}%`, backgroundColor: full ? 'var(--color-danger)' : config.color }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <StatusBadge status={s.status} full={full} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Session detail panel */}
      {liveSession && (
        <section className="bg-white border border-[var(--color-border)] rounded-md animate-fade-in">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">세션 상세</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded hover:bg-[var(--color-danger-bg)] transition-colors"
              >
                <Trash2 size={12} />
                삭제
              </button>
              <button
                onClick={() => setSelectedSession(null)}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-[var(--color-border)]">
            {/* Left info */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium"
                  style={{ backgroundColor: sessionTypeConfig[liveSession.type].bgColor, color: sessionTypeConfig[liveSession.type].textColor }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sessionTypeConfig[liveSession.type].color }} />
                  {sessionTypeConfig[liveSession.type].label}
                </span>
              </div>
              <h3 className="text-[16px] font-semibold text-[var(--color-text)] mb-4">{liveSession.name}</h3>

              <dl className="space-y-2.5 text-[13px]">
                <InfoRow icon={Calendar} label="날짜" value={formatKoreanDate(liveSession.date, 'yyyy년 M월 d일 (EEE)')} />
                <InfoRow
                  icon={Clock}
                  label="시간"
                  value={`${liveSession.startTime}${liveSession.endTime ? ` — ${liveSession.endTime}` : ''}`}
                />
                <InfoRow icon={MapPin} label="장소" value={liveSession.location || '미정'} />
                <InfoRow icon={Users} label="정원" value={`${liveSession.currentReservations} / ${liveSession.maxCapacity}명`} />
              </dl>

              {liveSession.memo && (
                <div className="mt-4 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] rounded text-[12.5px] text-[var(--color-text-secondary)] leading-relaxed">
                  <p className="text-[11px] text-[var(--color-text-muted)] mb-1">메모</p>
                  {liveSession.memo}
                </div>
              )}
            </div>

            {/* Reservations */}
            <div className="col-span-2 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-[var(--color-text)]">
                  예약자 목록 <span className="text-[var(--color-text-muted)] font-normal ml-1">{sessionReservations.length}명</span>
                </h3>
              </div>

              {sessionReservations.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-[var(--color-border)] rounded">
                  <p className="text-[13px] text-[var(--color-text-muted)]">예약자가 없습니다.</p>
                </div>
              ) : (
                <div className="border border-[var(--color-border)] rounded overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                        <th className="text-left font-medium px-3 py-2 w-[40px]">#</th>
                        <th className="text-left font-medium px-3 py-2">이름</th>
                        <th className="text-left font-medium px-3 py-2 w-[140px]">예약일시</th>
                        <th className="text-left font-medium px-3 py-2 w-[90px]">상태</th>
                        <th className="text-right font-medium px-3 py-2 w-[180px]">처리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionReservations.map((r, i) => {
                        const statusConf = reservationStatusConfig[r.status];
                        return (
                          <tr key={r.id} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)]">
                            <td className="px-3 py-2 text-[var(--color-text-muted)] tabular-nums">{i + 1}</td>
                            <td className="px-3 py-2 text-[var(--color-text)] font-medium">{r.memberName}</td>
                            <td className="px-3 py-2 text-[var(--color-text-secondary)] tabular-nums">
                              {formatKoreanDate(r.reservedAt, 'M.d HH:mm')}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium"
                                style={{ backgroundColor: statusConf.bgColor, color: statusConf.color }}
                              >
                                {statusConf.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {r.status === 'reserved' && (
                                  <>
                                    <button
                                      onClick={() => updateReservationStatus(r.id, 'attended')}
                                      className="px-2 py-0.5 text-[11px] text-[var(--color-success)] border border-[var(--color-success-border)] rounded hover:bg-[var(--color-success-bg)] transition-colors"
                                    >출석</button>
                                    <button
                                      onClick={() => updateReservationStatus(r.id, 'noshow')}
                                      className="px-2 py-0.5 text-[11px] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded hover:bg-[var(--color-danger-bg)] transition-colors"
                                    >노쇼</button>
                                  </>
                                )}
                                <button
                                  onClick={() => { if (confirm('이 예약을 취소하시겠습니까?')) cancelReservation(r.id); }}
                                  className="px-2 py-0.5 text-[11px] text-[var(--color-text-muted)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition-colors"
                                >취소</button>
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
        </section>
      )}

      {/* Create Modal */}
      {showCreateForm && (
        <Modal title="세션 추가" onClose={() => setShowCreateForm(false)}>
          <div className="space-y-4">
            <FormField label="세션 유형" required>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value as SessionType)}
                className="form-input"
              >
                <option value="ebw">EBW 실내 러닝</option>
                <option value="slowrun">슬로우 롱런</option>
                <option value="marathon">마라톤 클래스</option>
              </select>
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="날짜" required>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="form-input" />
              </FormField>
              <FormField label="시작 시간" required>
                <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} className="form-input" />
              </FormField>
            </div>

            <FormField label="장소">
              <input
                type="text"
                value={formLocation}
                onChange={e => setFormLocation(e.target.value)}
                placeholder="예: 뚝섬한강공원 M지점"
                className="form-input"
              />
            </FormField>

            <FormField label="최대 인원" required>
              <input
                type="number"
                min={1}
                value={formCapacity}
                onChange={e => setFormCapacity(parseInt(e.target.value) || 8)}
                className="form-input"
              />
            </FormField>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowCreateForm(false)}
                className="flex-1 py-2 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] transition-colors"
              >취소</button>
              <button
                onClick={handleCreate}
                className="flex-1 py-2 text-[13px] text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] transition-colors"
              >세션 생성</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Generate Modal */}
      {showBulkForm && (
        <Modal
          title="정기 스케줄 일괄 생성"
          onClose={() => {
            setShowBulkForm(false);
            setBulkResult(null);
          }}
        >
          <div className="space-y-4">
            <div className="text-[12.5px] text-[var(--color-text-secondary)] leading-relaxed bg-[var(--color-bg-hover)] rounded px-3 py-2.5">
              아래 기간 동안의 정기 세션을 한 번에 만듭니다. <br />
              · <b>매주 월</b> — EBW 실내 러닝 19:00 / 20:00 / 21:00 (정원 8명, EBW 러닝센터)
              <br />
              · <b>매주 수</b> — 슬로우 롱런 클럽 19:30~21:00 (정원 50명, 올림픽공원 평화의문)
              <br />
              · <b>매주 토</b> — 아이오 마라톤 클래스 10:00~12:00 (정원 50명, 잠실 종합운동장)
              <br />
              <span className="text-[var(--color-text-muted)]">
                이미 같은 날짜·시작시간·유형의 세션이 있으면 건너뜁니다.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="시작일">
                <input
                  type="date"
                  value={bulkFrom}
                  onChange={e => setBulkFrom(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]"
                />
              </FormField>
              <FormField label="종료일">
                <input
                  type="date"
                  value={bulkTo}
                  onChange={e => setBulkTo(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]"
                />
              </FormField>
            </div>

            {bulkResult && (
              <div className="text-[12.5px] rounded px-3 py-2.5 bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                {bulkResult.created > 0
                  ? `${bulkResult.created}개의 세션이 새로 생성되었습니다. (현재 예정된 세션 총 ${bulkResult.upcomingTotal}건)`
                  : `새로 만들 세션이 없습니다. 해당 기간의 정기 스케줄은 이미 생성되어 있습니다. (총 ${bulkResult.upcomingTotal}건)`}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setShowBulkForm(false);
                  setBulkResult(null);
                }}
                disabled={bulkBusy}
                className="flex-1 py-2 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50"
              >
                닫기
              </button>
              <button
                onClick={handleBulkGenerate}
                disabled={bulkBusy}
                className="flex-1 py-2 text-[13px] text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-60"
              >
                {bulkBusy ? '생성 중…' : '일괄 생성'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Subcomponents ───

function Divider() {
  return <div className="h-4 w-px bg-[var(--color-border)]" />;
}

function StatusBadge({ status, full }: { status: Session['status']; full: boolean }) {
  if (status === 'cancelled') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]">취소됨</span>;
  }
  if (full) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)]">마감</span>;
  }
  if (status === 'closed') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)]">종료</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">모집중</span>;
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-[var(--color-text-muted)] mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11.5px] text-[var(--color-text-muted)] mb-0.5">{label}</p>
        <p className="text-[13px] text-[var(--color-text)]">{value}</p>
      </div>
    </div>
  );
}


