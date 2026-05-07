'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Plus, X, Search, Calendar, Clock, MapPin, Users, Trash2, CalendarRange,
  Pencil, Link as LinkIcon, Camera, MessageCircle, Image as ImageIcon, Sparkles, Info,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig, reservationStatusConfig } from '@/lib/config';
import { formatKoreanDate, cn, format, isSessionFull } from '@/lib/utils';
import { Modal, FormField } from '@/components/ui';
import type { Session, SessionType, SessionRibbon } from '@/types';

// ─── Ribbon presets shared between admin editor and member view ──────────
// Keeping these in one place ensures the badges members see are exactly the
// ones the admin can pick from. New ribbons should be added to the
// SessionRibbon union in types/index.ts as well as here.
export const RIBBON_PRESETS: { id: SessionRibbon; label: string; emoji: string }[] = [
  { id: 'none',       label: '표시 안 함',     emoji: '—' },
  { id: 'new',        label: '신규',           emoji: '🆕' },
  { id: 'hot',        label: '인기',           emoji: '🔥' },
  { id: 'few_seats',  label: '마감 임박',      emoji: '⏰' },
  { id: 'beginner',   label: '입문 환영',      emoji: '🌱' },
  { id: 'special',    label: '스페셜',         emoji: '⭐' },
  { id: 'event',      label: '이벤트',         emoji: '🎉' },
  { id: 'rain_check', label: '우천 시 안내',   emoji: '☔' },
];
const ribbonLabel = (id?: SessionRibbon | null) =>
  RIBBON_PRESETS.find(p => p.id === id)?.label ?? '표시 안 함';
const ribbonEmoji = (id?: SessionRibbon | null) =>
  RIBBON_PRESETS.find(p => p.id === id)?.emoji ?? '';

export default function SessionManagement() {
  const {
    sessions, reservations,
    createSession, updateSession, deleteSession,
    updateReservationStatus, cancelReservation, refreshSessions,
  } = useApp();

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | SessionType>('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('week');

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
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
                onClick={() => setShowEditForm(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] text-[var(--color-primary)] border border-[var(--color-primary)]/30 rounded hover:bg-[var(--color-primary)]/10 transition-colors"
              >
                <Pencil size={12} />
                수정
              </button>
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
                  <p className="text-[11px] text-[var(--color-text-muted)] mb-1">관리자 메모</p>
                  {liveSession.memo}
                </div>
              )}

              {/* PR-7: pre-registration info preview — shows admins exactly
                  what members will see on the session detail page before
                  they register. Empty fields render a subtle "미설정" hint
                  so the admin can spot what's still missing. */}
              <div className="mt-4 p-3 bg-white border border-dashed border-[var(--color-border)] rounded">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                    회원에게 보여지는 정보
                  </p>
                  <button
                    onClick={() => setShowEditForm(true)}
                    className="text-[11px] text-[var(--color-primary)] hover:underline inline-flex items-center gap-1"
                  >
                    <Pencil size={10} /> 편집
                  </button>
                </div>
                <ul className="space-y-1.5 text-[12px]">
                  <PreviewLine
                    icon={Sparkles}
                    label="리본"
                    value={liveSession.ribbon && liveSession.ribbon !== 'none'
                      ? `${ribbonEmoji(liveSession.ribbon)} ${ribbonLabel(liveSession.ribbon)}`
                      : null}
                  />
                  <PreviewLine icon={Info} label="설명" value={liveSession.description || null} clamp />
                  <PreviewLine icon={LinkIcon} label="이벤트 페이지" value={liveSession.eventUrl || null} link />
                  <PreviewLine icon={Camera} label="인스타 후기" value={liveSession.instagramUrl || null} link />
                  <PreviewLine icon={MessageCircle} label="오픈채팅" value={liveSession.kakaoOpenChatUrl || null} link />
                  <PreviewLine icon={MapPin} label="지도 링크" value={liveSession.locationMapUrl || null} link />
                  <PreviewLine icon={ImageIcon} label="커버 이미지" value={liveSession.coverImageUrl || null} link />
                </ul>
              </div>
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

      {/* Edit Modal — PR-7: full session edit incl. pre-registration info */}
      {showEditForm && liveSession && (
        <EditSessionModal
          key={liveSession.id /* re-mount on session swap so stale state never leaks */}
          session={liveSession}
          onClose={() => setShowEditForm(false)}
          onSave={async (patch) => {
            const ok = await updateSession(liveSession.id, patch);
            if (ok) {
              setShowEditForm(false);
            }
            return ok;
          }}
        />
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

// ─── Preview line for admin's "what members see" snapshot ────────────────
function PreviewLine({
  icon: Icon,
  label,
  value,
  link,
  clamp,
}: {
  icon: typeof Calendar;
  label: string;
  value: string | null;
  link?: boolean;
  clamp?: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <Icon size={12} className="text-[var(--color-text-muted)] mt-1 shrink-0" />
      <span className="text-[var(--color-text-muted)] w-[80px] shrink-0">{label}</span>
      <span className={cn('flex-1 min-w-0', clamp && 'line-clamp-2')}>
        {value ? (
          link ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)] hover:underline break-all"
            >
              {value.length > 60 ? value.slice(0, 60) + '…' : value}
            </a>
          ) : (
            <span className="text-[var(--color-text)] break-words">{value}</span>
          )
        ) : (
          <span className="text-[var(--color-text-muted)]">미설정</span>
        )}
      </span>
    </li>
  );
}

// ─── Edit Session Modal (PR-7) ───────────────────────────────────────────
//
// Edits both the "core schedule" fields (name/type/date/time/capacity/etc.)
// and the new "pre-registration info" fields (description, eventUrl,
// instagramUrl, kakaoOpenChatUrl, locationMapUrl, coverImageUrl, ribbon).
//
// Why a single modal instead of two tabs:
// - Coaches typically tweak multiple fields at once when prepping a
//   session (e.g. update memo + post the Instagram review at the same
//   time as flipping `memoPublic`).
// - The modal stays scrollable; we group fields into "기본 / 일정·정원 /
//   회원 안내" sections so users still find the right field quickly.
//
// We send a *partial* PATCH-like payload back to PUT /api/sessions: only
// fields that changed are forwarded so the server can audit-log a clean
// diff and the row's other columns stay untouched. The server already
// validates / sanitises every field, so the client only has to do the
// bare minimum (URL hint, length cap on description).
function EditSessionModal({
  session,
  onClose,
  onSave,
}: {
  session: Session;
  onClose: () => void;
  onSave: (patch: Partial<Session>) => Promise<boolean>;
}) {
  const [name, setName] = useState(session.name);
  const [type, setType] = useState<SessionType>(session.type);
  const [date, setDate] = useState(session.date);
  const [startTime, setStartTime] = useState(session.startTime);
  const [endTime, setEndTime] = useState(session.endTime ?? '');
  const [location, setLocation] = useState(session.location ?? '');
  const [locationAddress, setLocationAddress] = useState(session.locationAddress ?? '');
  const [locationMapUrl, setLocationMapUrl] = useState(session.locationMapUrl ?? '');
  const [maxCapacity, setMaxCapacity] = useState(session.maxCapacity);
  const [isIndoor, setIsIndoor] = useState(!!session.isIndoor);
  const [cancelDeadline, setCancelDeadline] = useState(session.cancelDeadlineMinutes);
  const [status, setStatus] = useState<Session['status']>(session.status);
  const [memo, setMemo] = useState(session.memo ?? '');
  const [memoPublic, setMemoPublic] = useState(!!session.memoPublic);

  // PR-7 info card fields
  const [description, setDescription] = useState(session.description ?? '');
  const [eventUrl, setEventUrl] = useState(session.eventUrl ?? '');
  const [instagramUrl, setInstagramUrl] = useState(session.instagramUrl ?? '');
  const [kakaoOpenChatUrl, setKakaoOpenChatUrl] = useState(session.kakaoOpenChatUrl ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(session.coverImageUrl ?? '');
  const [ribbon, setRibbon] = useState<SessionRibbon>(session.ribbon ?? 'none');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lightweight URL hint: not a hard block (the server is the source of
  // truth) — just helps the admin spot a typo before they hit save.
  const urlLooksOk = (v: string) => !v || /^https?:\/\//i.test(v.trim());
  const urlHint = (v: string) => (urlLooksOk(v) ? undefined : 'http(s):// 로 시작해야 합니다');

  // Build the partial diff at submit time. Only non-equal fields go into the
  // payload so the audit log shows exactly what the admin changed.
  const buildPatch = (): Partial<Session> => {
    const patch: Partial<Session> = {};
    const trim = (s: string) => s.trim();

    if (trim(name) !== session.name) patch.name = trim(name);
    if (type !== session.type) patch.type = type;
    if (date !== session.date) patch.date = date;
    if (startTime !== session.startTime) patch.startTime = startTime;
    if ((endTime || '') !== (session.endTime ?? '')) patch.endTime = endTime || undefined;
    if (location !== (session.location ?? '')) patch.location = location;
    if (locationAddress !== (session.locationAddress ?? '')) patch.locationAddress = locationAddress;
    if (trim(locationMapUrl) !== (session.locationMapUrl ?? '')) patch.locationMapUrl = trim(locationMapUrl) || undefined;
    if (Number(maxCapacity) !== session.maxCapacity) patch.maxCapacity = Number(maxCapacity);
    if (isIndoor !== !!session.isIndoor) patch.isIndoor = isIndoor;
    if (Number(cancelDeadline) !== session.cancelDeadlineMinutes) patch.cancelDeadlineMinutes = Number(cancelDeadline);
    if (status !== session.status) patch.status = status;
    if (memo !== (session.memo ?? '')) patch.memo = memo;
    if (memoPublic !== !!session.memoPublic) patch.memoPublic = memoPublic;

    if (description !== (session.description ?? '')) patch.description = description;
    if (trim(eventUrl) !== (session.eventUrl ?? '')) patch.eventUrl = trim(eventUrl) || undefined;
    if (trim(instagramUrl) !== (session.instagramUrl ?? '')) patch.instagramUrl = trim(instagramUrl) || undefined;
    if (trim(kakaoOpenChatUrl) !== (session.kakaoOpenChatUrl ?? '')) patch.kakaoOpenChatUrl = trim(kakaoOpenChatUrl) || undefined;
    if (trim(coverImageUrl) !== (session.coverImageUrl ?? '')) patch.coverImageUrl = trim(coverImageUrl) || undefined;
    if (ribbon !== (session.ribbon ?? 'none')) patch.ribbon = ribbon;

    return patch;
  };

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) { setError('세션명을 입력하세요'); return; }
    if (!date || !startTime) { setError('날짜와 시작 시간을 입력하세요'); return; }
    if (!Number.isFinite(Number(maxCapacity)) || Number(maxCapacity) < 1) {
      setError('정원은 1명 이상이어야 합니다');
      return;
    }
    const urls = [locationMapUrl, eventUrl, instagramUrl, kakaoOpenChatUrl, coverImageUrl];
    if (urls.some(u => !urlLooksOk(u))) {
      setError('URL은 http(s):// 로 시작해야 합니다');
      return;
    }

    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      setError('변경된 항목이 없습니다');
      return;
    }
    setSaving(true);
    try {
      await onSave(patch);
    } finally {
      setSaving(false);
    }
  };

  // Esc to close — minor nicety so admins can hammer through edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-start md:items-center justify-center px-4 py-6 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-md shadow-lg w-full max-w-[720px] animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] sticky top-0 bg-white rounded-t-md">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--color-text)]">세션 수정</h3>
            <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">
              {formatKoreanDate(session.date, 'yyyy.M.d (EEE)')} · {session.startTime} · {sessionTypeConfig[session.type].label}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* ── Section: 기본 ── */}
          <section className="space-y-3">
            <h4 className="text-[12px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">기본 정보</h4>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="세션명" required>
                <input className="form-input" value={name} onChange={e => setName(e.target.value)} maxLength={200} />
              </FormField>
              <FormField label="유형" required>
                <select className="form-input" value={type} onChange={e => setType(e.target.value as SessionType)}>
                  <option value="ebw">EBW 실내 러닝</option>
                  <option value="slowrun">슬로우 롱런</option>
                  <option value="marathon">마라톤 클래스</option>
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="날짜" required>
                <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
              </FormField>
              <FormField label="시작" required>
                <input type="time" className="form-input" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </FormField>
              <FormField label="종료">
                <input type="time" className="form-input" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="정원" required>
                <input
                  type="number" min={1} className="form-input"
                  value={maxCapacity}
                  onChange={e => setMaxCapacity(parseInt(e.target.value) || 1)}
                />
              </FormField>
              <FormField label="취소 마감(분)" hint="시작 전 N분">
                <input
                  type="number" min={0} className="form-input"
                  value={cancelDeadline}
                  onChange={e => setCancelDeadline(parseInt(e.target.value) || 0)}
                />
              </FormField>
              <FormField label="상태">
                <select className="form-input" value={status} onChange={e => setStatus(e.target.value as Session['status'])}>
                  <option value="open">모집중</option>
                  <option value="closed">종료</option>
                  <option value="cancelled">취소</option>
                </select>
              </FormField>
            </div>
            <label className="inline-flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={isIndoor} onChange={e => setIsIndoor(e.target.checked)} />
              실내 세션 (우천 무관)
            </label>
          </section>

          {/* ── Section: 장소 ── */}
          <section className="space-y-3">
            <h4 className="text-[12px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">장소</h4>
            <FormField label="장소명">
              <input
                className="form-input"
                placeholder="예: 뚝섬한강공원 M지점"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </FormField>
            <FormField label="주소">
              <input
                className="form-input"
                placeholder="예: 서울 광진구 자양동 노룬산로 18-1"
                value={locationAddress}
                onChange={e => setLocationAddress(e.target.value)}
              />
            </FormField>
            <FormField label="지도 링크 (네이버지도/카카오맵/Google Maps)" hint={urlHint(locationMapUrl)}>
              <input
                className="form-input"
                placeholder="https://map.naver.com/..."
                value={locationMapUrl}
                onChange={e => setLocationMapUrl(e.target.value)}
              />
            </FormField>
          </section>

          {/* ── Section: 회원 안내 (PR-7) ── */}
          <section className="space-y-3">
            <div>
              <h4 className="text-[12px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                회원 안내 (등록 전 노출)
              </h4>
              <p className="text-[11.5px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
                회원이 세션 상세 페이지에서 예약 전에 보는 정보입니다. 이벤트 페이지·인스타 후기·오픈채팅 링크는
                새 탭에서 열리며, 리본은 일정 옆에 작은 배지로 표시됩니다.
              </p>
            </div>

            <FormField label="리본/배지">
              <div className="flex flex-wrap gap-1.5">
                {RIBBON_PRESETS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setRibbon(p.id)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[12px] transition-colors',
                      ribbon === p.id
                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                        : 'bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/40'
                    )}
                  >
                    <span>{p.emoji}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="설명 (말풍선/타이틀 아래 노출)" hint={`${description.length} / 2000`}>
              <textarea
                className="form-input min-h-[80px] resize-y"
                rows={3}
                maxLength={2000}
                placeholder="예: 입문자도 환영! 페이스 6분/㎞ 그룹과 함께 5km를 천천히 달립니다."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </FormField>

            <div className="grid grid-cols-1 gap-3">
              <FormField label="이벤트 페이지 URL" hint={urlHint(eventUrl)}>
                <div className="relative">
                  <LinkIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    className="form-input pl-8"
                    placeholder="https://www.notion.so/event-page"
                    value={eventUrl}
                    onChange={e => setEventUrl(e.target.value)}
                  />
                </div>
              </FormField>
              <FormField label="인스타 후기 게시물 URL" hint={urlHint(instagramUrl)}>
                <div className="relative">
                  <Camera size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    className="form-input pl-8"
                    placeholder="https://www.instagram.com/p/..."
                    value={instagramUrl}
                    onChange={e => setInstagramUrl(e.target.value)}
                  />
                </div>
              </FormField>
              <FormField label="오픈카톡방 링크" hint={urlHint(kakaoOpenChatUrl)}>
                <div className="relative">
                  <MessageCircle size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    className="form-input pl-8"
                    placeholder="https://open.kakao.com/o/..."
                    value={kakaoOpenChatUrl}
                    onChange={e => setKakaoOpenChatUrl(e.target.value)}
                  />
                </div>
              </FormField>
              <FormField label="커버 이미지 URL (선택)" hint={urlHint(coverImageUrl)}>
                <div className="relative">
                  <ImageIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    className="form-input pl-8"
                    placeholder="https://..."
                    value={coverImageUrl}
                    onChange={e => setCoverImageUrl(e.target.value)}
                  />
                </div>
              </FormField>
            </div>
          </section>

          {/* ── Section: 관리자 메모 ── */}
          <section className="space-y-3">
            <h4 className="text-[12px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">관리자 메모</h4>
            <FormField label="메모">
              <textarea
                className="form-input min-h-[64px] resize-y"
                rows={2}
                value={memo}
                onChange={e => setMemo(e.target.value)}
                maxLength={2000}
              />
            </FormField>
            <label className="inline-flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={memoPublic} onChange={e => setMemoPublic(e.target.checked)} />
              메모를 회원에게도 공개 (안내사항으로 표시)
            </label>
          </section>

          {error && (
            <div className="text-[12.5px] text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)] bg-white rounded-b-md sticky bottom-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-[13px] text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-60"
          >
            {saving ? '저장 중…' : '변경사항 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}


