'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Plus, X, Search, Calendar, Clock, MapPin, Users, Trash2, CalendarRange,
  Pencil, Link as LinkIcon, Camera, MessageCircle, Image as ImageIcon, Sparkles, Info,
  UserPlus, AlertTriangle, Inbox, ChevronRight, Check, Ban,
} from 'lucide-react';
import { useApp, type CorrectionRequestDto } from '@/store/AppContext';
import { sessionTypeConfig, reservationStatusConfig } from '@/lib/config';
import { formatKoreanDate, cn, format, isSessionFull } from '@/lib/utils';
import { Modal, FormField, useToast } from '@/components/ui';
import type { Session, SessionType, SessionRibbon, ReservationStatus } from '@/types';

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
    sessions, reservations, members,
    correctionRequests,
    createSession, updateSession, deleteSession,
    updateReservationStatus, refreshSessions,
    forceAddReservation, bulkMarkNoshow,
    approveCorrectionRequest, rejectCorrectionRequest,
  } = useApp();
  const toast = useToast();

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | SessionType>('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('week');

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  // 정정 요청 인박스 / 예약자 강제 추가 / 노쇼 일괄 처리 — Phase A 관리자 도구
  const [showCorrectionInbox, setShowCorrectionInbox] = useState(false);
  const [showForceAdd, setShowForceAdd] = useState(false);
  const [bulkNoshowBusy, setBulkNoshowBusy] = useState(false);
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

  // PR-SM1: 'cancelled' 도 노출한다 — 관리자가 취소된 예약을 다시 살릴 수
  // 있어야 하므로(수강생 정정 요청을 받아 reserved → cancelled 로 잘못 처리한
  // 경우 등) 4-state 토글의 대상이 되어야 한다. 단 정렬에서 활성 상태를
  // 위로 올려, 취소된 줄이 시야 맨 위를 차지하지 않도록 한다.
  const sessionReservations = useMemo(() => {
    if (!liveSession) return [];
    const order: Record<ReservationStatus, number> = {
      reserved: 0, attended: 1, noshow: 2, cancelled: 3,
    };
    return reservations
      .filter(r => r.sessionId === liveSession.id)
      .sort((a, b) => {
        const o = (order[a.status] ?? 9) - (order[b.status] ?? 9);
        if (o !== 0) return o;
        return a.memberName.localeCompare(b.memberName);
      });
  }, [liveSession, reservations]);

  // 정정 요청 카운트 — 인박스 진입점 배지에서 사용.
  const pendingCorrectionsTotal = useMemo(
    () => correctionRequests.filter(c => c.status === 'pending').length,
    [correctionRequests],
  );
  const pendingCorrectionsForSession = useMemo(() => {
    if (!liveSession) return 0;
    return correctionRequests.filter(
      c => c.status === 'pending' && c.sessionId === liveSession.id,
    ).length;
  }, [correctionRequests, liveSession]);

  const handleCreate = async () => {
    const names: Record<SessionType, string> = {
      ebw: 'EBW 러닝',
      slowrun: '슬로우롱런클럽',
      marathon: '러닝 클래스',
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

  // PR-SM1: 4-state 토글 핸들러 — 동일 상태 클릭은 무시, 위험 전환(출석→취소)
  // 은 confirm 다이얼로그. 자동 환원/차감은 서버(PUT /api/reservations)가
  // 책임지며, 토스트에 passDelta 를 노출해 관리자가 바로 인지하게 한다.
  const handleReservationStatusChange = async (
    reservationId: string,
    next: ReservationStatus,
    current: ReservationStatus,
    memberName: string,
  ) => {
    if (next === current) return;

    // 위험도가 높은 전환은 명시적 확인
    const dangerous =
      (current === 'attended' && next === 'cancelled') ||
      (current === 'attended' && next === 'noshow') ||
      (next === 'cancelled' && current !== 'cancelled');

    if (dangerous) {
      const labels: Record<ReservationStatus, string> = {
        reserved: '예약완료', attended: '출석', noshow: '노쇼', cancelled: '취소',
      };
      if (!confirm(`${memberName} — ${labels[current]} → ${labels[next]} 로 변경하시겠습니까?`)) return;
    }

    try {
      const res = await updateReservationStatus(reservationId, next);
      const passDelta = (res as any)?.passDelta as number | undefined;
      const noop = (res as any)?.noop as boolean | undefined;
      if (noop) return;
      let extra = '';
      if (passDelta === 1) extra = ' (수강권 +1 환원)';
      else if (passDelta === -1) extra = ' (수강권 -1 차감)';
      toast.success('예약 상태가 변경되었습니다', `${memberName}${extra}`);
    } catch (e: any) {
      toast.error('상태 변경 실패', e?.message || '잠시 후 다시 시도해주세요.');
    }
  };

  const handleBulkNoshow = async () => {
    if (!liveSession) return;
    const reservedCount = reservations.filter(
      r => r.sessionId === liveSession.id && r.status === 'reserved',
    ).length;
    if (reservedCount === 0) {
      toast.info('대상이 없습니다', '예약 상태인 회원이 없습니다.');
      return;
    }
    if (!confirm(
      `현재 [예약완료] 상태인 ${reservedCount}명을 모두 [노쇼] 처리합니다.\n` +
      `※ 노쇼는 패널티이므로 수강권은 환원되지 않습니다.\n계속하시겠습니까?`,
    )) return;
    setBulkNoshowBusy(true);
    try {
      const n = await bulkMarkNoshow(liveSession.id);
      toast.success('노쇼 일괄 처리 완료', `${n}명을 노쇼 처리했습니다.`);
    } catch (e: any) {
      toast.error('일괄 처리 실패', e?.message || '오류가 발생했습니다.');
    } finally {
      setBulkNoshowBusy(false);
    }
  };

  const handleBulkGenerate = async () => {
    if (!bulkFrom || !bulkTo || bulkFrom > bulkTo) {
      toast.warning('기간을 확인해주세요', '시작일이 종료일보다 이후일 수 없습니다.');
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
      toast.error('일괄 생성 실패', e.message || '오류가 발생했습니다.');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="max-w-[1400px] space-y-5">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="page-title">세션 관리</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
            세션 생성과 예약자 현황을 확인·관리합니다. (총 {sessions.length}건)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* PR-SM1: 정정 요청 인박스 — 전체 pending 카운트 배지로 즉시 인지 */}
          <button
            onClick={() => setShowCorrectionInbox(true)}
            className="relative flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] bg-white border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-strong)] transition-colors"
            title="회원이 보낸 출석/예약 정정 요청"
          >
            <Inbox size={15} />
            정정 요청
            {pendingCorrectionsTotal > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-semibold text-white bg-[var(--color-danger)] rounded-full tabular-nums">
                {pendingCorrectionsTotal}
              </span>
            )}
          </button>
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

      {/* List — 모바일은 카드, sm 이상은 테이블 */}
      <div className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        {filteredSessions.length === 0 ? (
          <div className="py-14 px-6 text-center text-[13px] text-[var(--color-text-muted)]">
            조회 조건에 해당하는 세션이 없습니다.
          </div>
        ) : (
          <>
            {/* ── Mobile: 카드 리스트 ── */}
            <ul className="sm:hidden divide-y divide-[var(--color-border-subtle)]">
              {filteredSessions.map(s => {
                const config = sessionTypeConfig[s.type];
                const full = isSessionFull(s);
                const ratio = s.maxCapacity > 0 ? (s.currentReservations / s.maxCapacity) * 100 : 0;
                const isSelected = liveSession?.id === s.id;
                return (
                  <li
                    key={s.id}
                    onClick={() => setSelectedSession(s)}
                    className={cn(
                      "px-3 py-3 cursor-pointer transition-colors",
                      isSelected ? "bg-[var(--color-primary-bg)]" : "hover:bg-[var(--color-bg-subtle)]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0"
                            style={{ backgroundColor: config.bgColor, color: config.textColor }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                            {config.label}
                          </span>
                          <span className="text-[14px] font-semibold text-[var(--color-text)] truncate">{s.name}</span>
                        </div>
                        <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5 tabular-nums truncate">
                          {formatKoreanDate(s.date, 'M.d (EEE)')} · {s.startTime}
                          {s.location && ` · ${s.location}`}
                        </p>
                      </div>
                      <StatusBadge status={s.status} full={full} />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={cn("text-[12px] tabular-nums shrink-0", full ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]")}>
                        {s.currentReservations} / {s.maxCapacity}
                      </span>
                      <div className="flex-1 h-1.5 bg-[var(--color-bg-hover)] rounded overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${ratio}%`, backgroundColor: full ? 'var(--color-danger)' : config.color }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* ── Desktop (sm+): 테이블 ── */}
            <div className="hidden sm:block scroll-x">
              <table className="responsive-table" style={{ minWidth: 720 }}>
                <thead>
                  <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                    <th className="text-left font-medium px-4 py-2.5 w-[120px] whitespace-nowrap">날짜</th>
                    <th className="text-left font-medium px-4 py-2.5 w-[60px] whitespace-nowrap">시간</th>
                    <th className="text-left font-medium px-4 py-2.5 w-[100px] whitespace-nowrap">유형</th>
                    <th className="text-left font-medium px-4 py-2.5 w-[200px]">세션명</th>
                    <th className="text-left font-medium px-4 py-2.5 w-[130px]">장소</th>
                    <th className="text-right font-medium px-4 py-2.5 w-[120px] whitespace-nowrap">예약/정원</th>
                    <th className="text-center font-medium px-4 py-2.5 w-[70px] whitespace-nowrap">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map(s => {
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
                        <td className="px-4 py-2.5 text-[var(--color-text)] max-w-[200px] truncate" title={s.name}>{s.name}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-secondary)] max-w-[130px] truncate" title={s.location || undefined}>{s.location || '—'}</td>
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
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
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

          <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-[var(--color-border)]">
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <h3 className="text-[14px] font-semibold text-[var(--color-text)]">
                  예약자 목록 <span className="text-[var(--color-text-muted)] font-normal ml-1">{sessionReservations.length}명</span>
                  {pendingCorrectionsForSession > 0 && (
                    <button
                      onClick={() => setShowCorrectionInbox(true)}
                      className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] hover:opacity-80"
                      title="이 세션의 정정 요청 보기"
                    >
                      <AlertTriangle size={11} />
                      정정 요청 {pendingCorrectionsForSession}건
                    </button>
                  )}
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowForceAdd(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] text-[var(--color-primary)] border border-[var(--color-primary)]/30 rounded hover:bg-[var(--color-primary)]/10 transition-colors"
                    title="관리자가 회원을 직접 예약자로 추가"
                  >
                    <UserPlus size={12} />
                    예약자 추가
                  </button>
                  <button
                    onClick={handleBulkNoshow}
                    disabled={bulkNoshowBusy}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded hover:bg-[var(--color-danger-bg)] transition-colors disabled:opacity-50"
                    title="예약완료 → 노쇼로 일괄 변경 (수강권 환원 없음)"
                  >
                    <Ban size={12} />
                    {bulkNoshowBusy ? '처리 중…' : '노쇼 일괄'}
                  </button>
                </div>
              </div>

              {sessionReservations.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-[var(--color-border)] rounded">
                  <p className="text-[13px] text-[var(--color-text-muted)]">예약자가 없습니다.</p>
                </div>
              ) : (
                <div className="border border-[var(--color-border)] rounded overflow-hidden">
                  {/* ── Mobile: 카드 ── */}
                  <ul className="sm:hidden divide-y divide-[var(--color-border-subtle)]">
                    {sessionReservations.map((r, i) => {
                      const statusConf = reservationStatusConfig[r.status];
                      return (
                        <li key={r.id} className="px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums shrink-0">{i + 1}</span>
                              <span className="text-[13.5px] font-semibold text-[var(--color-text)] truncate">{r.memberName}</span>
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium shrink-0"
                                style={{ backgroundColor: statusConf.bgColor, color: statusConf.color }}
                              >
                                {statusConf.label}
                              </span>
                            </div>
                            <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums shrink-0">
                              {formatKoreanDate(r.reservedAt, 'M.d HH:mm')}
                            </span>
                          </div>
                          {/* PR-SM1: 4-state 토글. 모든 상태에서 어느 방향으로든 전환 가능 */}
                          <div className="mt-1.5">
                            <StatusToggle
                              current={r.status}
                              size="sm"
                              onChange={(next) => handleReservationStatusChange(r.id, next, r.status, r.memberName)}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/* ── Desktop (sm+): 테이블 ── */}
                  <div className="hidden sm:block scroll-x">
                    <table className="responsive-table" style={{ minWidth: 720 }}>
                      <thead>
                        <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                          <th className="text-left font-medium px-3 py-2 w-[40px]">#</th>
                          <th className="text-left font-medium px-3 py-2">이름</th>
                          <th className="text-left font-medium px-3 py-2 w-[140px]">예약일시</th>
                          <th className="text-left font-medium px-3 py-2">출석 상태 (클릭으로 변경)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionReservations.map((r, i) => {
                          const isCancelled = r.status === 'cancelled';
                          return (
                            <tr
                              key={r.id}
                              className={cn(
                                "border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)]",
                                isCancelled && "opacity-60",
                              )}
                            >
                              <td className="px-3 py-2 text-[var(--color-text-muted)] tabular-nums">{i + 1}</td>
                              <td className="px-3 py-2 text-[var(--color-text)] font-medium">{r.memberName}</td>
                              <td className="px-3 py-2 text-[var(--color-text-secondary)] tabular-nums">
                                {formatKoreanDate(r.reservedAt, 'M.d HH:mm')}
                              </td>
                              <td className="px-3 py-2">
                                {/* PR-SM1: 4-state 토글. 현재 상태는 채움(filled),
                                    나머지는 윤곽선만 — 한 줄에 모든 전환을 제공한다. */}
                                <StatusToggle
                                  current={r.status}
                                  size="md"
                                  onChange={(next) => handleReservationStatusChange(r.id, next, r.status, r.memberName)}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* PR-SM1: 예약자 강제 추가 모달 — 관리자 권한으로 결제/수강권 검증 우회 */}
      {showForceAdd && liveSession && (
        <ForceAddReservationModal
          session={liveSession}
          members={members}
          existingMemberIds={
            reservations
              .filter(r => r.sessionId === liveSession.id && (r.status === 'reserved' || r.status === 'attended'))
              .map(r => r.memberId)
          }
          onClose={() => setShowForceAdd(false)}
          onSubmit={async (params) => {
            try {
              await forceAddReservation({
                sessionId: liveSession.id,
                memberId: params.memberId,
                skipPass: params.skipPass,
                initialStatus: params.initialStatus,
              });
              toast.success('예약자가 추가되었습니다', params.skipPass ? '수강권 차감 없이 추가됨' : '수강권 -1 차감');
              setShowForceAdd(false);
              return true;
            } catch (e: any) {
              toast.error('추가 실패', e?.message || '잠시 후 다시 시도해주세요.');
              return false;
            }
          }}
        />
      )}

      {/* PR-SM1: 정정 요청 인박스 — 회원의 요청을 1-클릭 승인/반려 */}
      {showCorrectionInbox && (
        <CorrectionInbox
          requests={correctionRequests}
          sessions={sessions}
          focusSessionId={liveSession?.id ?? null}
          onClose={() => setShowCorrectionInbox(false)}
          onApprove={async (id, params) => {
            try {
              await approveCorrectionRequest(id, params);
              toast.success('정정 요청을 승인했습니다');
              return true;
            } catch (e: any) {
              toast.error('승인 실패', e?.message || '잠시 후 다시 시도해주세요.');
              return false;
            }
          }}
          onReject={async (id, note) => {
            try {
              await rejectCorrectionRequest(id, note);
              toast.success('정정 요청을 반려했습니다');
              return true;
            } catch (e: any) {
              toast.error('반려 실패', e?.message || '잠시 후 다시 시도해주세요.');
              return false;
            }
          }}
        />
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
                <option value="slowrun">슬로우롱런클럽 (런클럽)</option>
                <option value="marathon">러닝 클래스</option>
              </select>
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              · <b>매주 수 · 금</b> — 슬로우롱런클럽 19:30~21:00 (정원 50명, 여의도공원 문화의마당)
              <br />
              · <b>매주 화 · 토</b> — 러닝 클래스 19:30~21:00 (정원 50명, 여의도공원 문화의마당)
              <br />
              <span className="text-[var(--color-text-muted)]">
                이미 같은 날짜·시작시간·유형의 세션이 있으면 건너뜁니다.
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

// ─── 4-state 토글 pill (PR-SM1) ───────────────────────────────────────────
//
// 모든 예약 상태(reserved/attended/noshow/cancelled)간 자유로운 전환을
// 한 줄에 노출. 현재 상태는 채움(filled), 나머지는 윤곽선만. 동일 상태
// 클릭은 부모(onChange)에서 무시한다.
const STATUS_PILL_ORDER: ReservationStatus[] = ['reserved', 'attended', 'noshow', 'cancelled'];

function StatusToggle({
  current,
  size = 'md',
  onChange,
}: {
  current: ReservationStatus;
  size?: 'sm' | 'md';
  onChange: (next: ReservationStatus) => void;
}) {
  const padX = size === 'sm' ? 'px-2' : 'px-2.5';
  const padY = size === 'sm' ? 'py-0.5' : 'py-1';
  const fontSize = size === 'sm' ? 'text-[11px]' : 'text-[12px]';
  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      {STATUS_PILL_ORDER.map(s => {
        const conf = reservationStatusConfig[s];
        const isActive = s === current;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-pressed={isActive}
            className={cn(
              'inline-flex items-center rounded border transition-colors font-medium whitespace-nowrap',
              padX, padY, fontSize,
              isActive
                ? 'shadow-sm'
                : 'bg-white hover:opacity-80',
            )}
            style={
              isActive
                ? { backgroundColor: conf.color, color: '#fff', borderColor: conf.color }
                : { backgroundColor: conf.bgColor, color: conf.color, borderColor: conf.color + '55' }
            }
            title={`${conf.label} 로 변경`}
          >
            {conf.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── 예약자 강제 추가 모달 (PR-SM1) ───────────────────────────────────────
//
// 관리자 권한 전용. 결제/수강권 검증을 건너뛰고 즉시 예약자로 등록한다.
// 옵션:
//  - skipPass: 수강권 차감 없이 추가(예: 무료 초대, 강사 본인)
//  - initialStatus: 처음부터 '출석'으로 기록(소급 처리)
function ForceAddReservationModal({
  session,
  members,
  existingMemberIds,
  onClose,
  onSubmit,
}: {
  session: Session;
  members: { id: string; name: string; phone?: string; isActive?: boolean }[];
  existingMemberIds: string[];
  onClose: () => void;
  onSubmit: (params: {
    memberId: string;
    skipPass: boolean;
    initialStatus: 'reserved' | 'attended';
  }) => Promise<boolean>;
}) {
  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState<string>('');
  const [skipPass, setSkipPass] = useState(false);
  const [initialStatus, setInitialStatus] = useState<'reserved' | 'attended'>('reserved');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter(m => m.isActive !== false)
      .filter(m => !existingMemberIds.includes(m.id))
      .filter(m =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        (m.phone || '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 50);
  }, [members, existingMemberIds, query]);

  const selectedName = members.find(m => m.id === memberId)?.name ?? '';

  const handleSubmit = async () => {
    if (!memberId) return;
    setBusy(true);
    try {
      await onSubmit({ memberId, skipPass, initialStatus });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="예약자 추가 (관리자)" onClose={onClose}>
      <div className="space-y-4">
        <div className="text-[12px] text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] rounded px-3 py-2 leading-relaxed">
          <b>{session.name}</b> · {formatKoreanDate(session.date, 'M.d (EEE)')} {session.startTime}
          <br />
          현재 예약 {session.currentReservations} / {session.maxCapacity}명
          <br />
          <span className="text-[var(--color-text-muted)]">
            ※ 결제/수강권 검증을 건너뛰고 즉시 등록합니다. 감사 로그에 기록됩니다.
          </span>
        </div>

        <FormField label="회원 검색" required>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="이름 또는 전화번호 일부"
              className="form-input pl-8"
            />
          </div>
        </FormField>

        <div className="border border-[var(--color-border)] rounded max-h-[260px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-[var(--color-text-muted)]">
              해당 회원이 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {filtered.map(m => {
                const selected = memberId === m.id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setMemberId(m.id)}
                      className={cn(
                        'w-full px-3 py-2 flex items-center justify-between text-left transition-colors',
                        selected
                          ? 'bg-[var(--color-primary-bg)]'
                          : 'hover:bg-[var(--color-bg-hover)]',
                      )}
                    >
                      <span className="text-[13px] text-[var(--color-text)] font-medium">
                        {m.name}
                      </span>
                      <span className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums">
                        {m.phone || ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <FormField label="초기 상태">
            <div className="flex items-center gap-1.5">
              {(['reserved', 'attended'] as const).map(s => {
                const conf = reservationStatusConfig[s];
                const active = initialStatus === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInitialStatus(s)}
                    className={cn(
                      'px-2.5 py-1 text-[12px] rounded border transition-colors font-medium',
                      active ? 'shadow-sm' : 'bg-white',
                    )}
                    style={
                      active
                        ? { backgroundColor: conf.color, color: '#fff', borderColor: conf.color }
                        : { color: conf.color, borderColor: conf.color + '55' }
                    }
                  >
                    {conf.label}
                  </button>
                );
              })}
            </div>
          </FormField>

          <label className="inline-flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={skipPass}
              onChange={e => setSkipPass(e.target.checked)}
            />
            수강권 차감 없이 추가 (무료 초대 / 강사·게스트 등)
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-2 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !memberId}
            className="flex-1 py-2 text-[13px] text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50"
          >
            {busy ? '추가 중…' : selectedName ? `${selectedName} 추가` : '회원 선택'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── 정정 요청 인박스 (PR-SM1) ─────────────────────────────────────────────
//
// 회원의 정정 요청을 1-클릭으로 승인/반려한다. 사유 코드별로 권장 대상
// 상태가 자동 매핑되어 있으나(예: attended_marked_noshow → 'attended'),
// '기타'/'다른 사람과 바뀜'은 관리자가 명시적으로 대상 상태를 골라야 한다.
const REASON_LABEL: Record<string, string> = {
  attended_marked_noshow: '출석했는데 노쇼 처리됨',
  noshow_marked_attended: '안 갔는데 출석 처리됨',
  want_cancel: '취소하고 싶었음',
  swapped_with_other: '다른 사람과 바뀜',
  other: '기타',
};
const REASON_AUTO_STATUS: Record<string, ReservationStatus | null> = {
  attended_marked_noshow: 'attended',
  noshow_marked_attended: 'noshow',
  want_cancel: 'cancelled',
  swapped_with_other: null,
  other: null,
};

function CorrectionInbox({
  requests,
  sessions,
  focusSessionId,
  onClose,
  onApprove,
  onReject,
}: {
  requests: CorrectionRequestDto[];
  sessions: Session[];
  focusSessionId: string | null;
  onClose: () => void;
  onApprove: (id: string, params?: { targetStatus?: ReservationStatus; note?: string }) => Promise<boolean>;
  onReject: (id: string, note: string) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [scope, setScope] = useState<'session' | 'all'>(focusSessionId ? 'session' : 'all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useMemo(() => {
    return requests
      .filter(r => filter === 'all' || r.status === 'pending')
      .filter(r => scope === 'all' || !focusSessionId || r.sessionId === focusSessionId)
      .sort((a, b) => {
        // pending 우선, 그 안에서 최신 요청이 위로
        const sa = a.status === 'pending' ? 0 : 1;
        const sb = b.status === 'pending' ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return (b.requestedAt || '').localeCompare(a.requestedAt || '');
      });
  }, [requests, filter, scope, focusSessionId]);

  return (
    <Modal title={`정정 요청 인박스 (${list.length})`} onClose={onClose}>
      <div className="space-y-3">
        {/* 필터 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded border border-[var(--color-border)] overflow-hidden">
            <button
              onClick={() => setFilter('pending')}
              className={cn(
                'px-2.5 py-1 text-[12px]',
                filter === 'pending'
                  ? 'bg-[var(--color-text)] text-white'
                  : 'bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
              )}
            >
              대기 중
            </button>
            <button
              onClick={() => setFilter('all')}
              className={cn(
                'px-2.5 py-1 text-[12px] border-l border-[var(--color-border)]',
                filter === 'all'
                  ? 'bg-[var(--color-text)] text-white'
                  : 'bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
              )}
            >
              전체
            </button>
          </div>
          {focusSessionId && (
            <div className="inline-flex rounded border border-[var(--color-border)] overflow-hidden">
              <button
                onClick={() => setScope('session')}
                className={cn(
                  'px-2.5 py-1 text-[12px]',
                  scope === 'session'
                    ? 'bg-[var(--color-text)] text-white'
                    : 'bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
                )}
              >
                이 세션
              </button>
              <button
                onClick={() => setScope('all')}
                className={cn(
                  'px-2.5 py-1 text-[12px] border-l border-[var(--color-border)]',
                  scope === 'all'
                    ? 'bg-[var(--color-text)] text-white'
                    : 'bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
                )}
              >
                전체 세션
              </button>
            </div>
          )}
        </div>

        {/* 목록 */}
        {list.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-[var(--color-border)] rounded text-[13px] text-[var(--color-text-muted)]">
            처리할 정정 요청이 없습니다.
          </div>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {list.map(r => {
              const sess = sessions.find(s => s.id === r.sessionId);
              const expanded = expandedId === r.id;
              const isPending = r.status === 'pending';
              const autoTarget = REASON_AUTO_STATUS[r.reasonCode] ?? null;
              return (
                <li
                  key={r.id}
                  className={cn(
                    'border border-[var(--color-border)] rounded transition-colors',
                    isPending ? 'bg-white' : 'bg-[var(--color-bg-subtle)] opacity-80',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : r.id)}
                    className="w-full flex items-start justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-bg-hover)]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-semibold text-[var(--color-text)]">
                          {r.memberName}
                        </span>
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          {sess
                            ? `${formatKoreanDate(sess.date, 'M.d (EEE)')} ${sess.startTime} · ${sess.name}`
                            : '세션 정보 없음'}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium',
                            isPending
                              ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)]'
                              : r.status === 'approved'
                                ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                                : r.status === 'rejected'
                                  ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'
                                  : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]',
                          )}
                        >
                          {isPending ? '대기 중'
                            : r.status === 'approved' ? '승인됨'
                              : r.status === 'rejected' ? '반려됨'
                                : '철회됨'}
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5 truncate">
                        사유: <b>{REASON_LABEL[r.reasonCode] ?? r.reasonCode}</b>
                        {r.detail ? ` — ${r.detail}` : ''}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-muted)] tabular-nums mt-0.5">
                        {formatKoreanDate(r.requestedAt, 'M.d HH:mm')} 요청
                      </p>
                    </div>
                    <ChevronRight
                      size={14}
                      className={cn(
                        'mt-1 text-[var(--color-text-muted)] shrink-0 transition-transform',
                        expanded && 'rotate-90',
                      )}
                    />
                  </button>

                  {expanded && (
                    <div className="px-3 pb-3 border-t border-[var(--color-border-subtle)] pt-2">
                      {r.detail && (
                        <div className="text-[12.5px] text-[var(--color-text)] bg-[var(--color-bg-subtle)] rounded px-2.5 py-2 leading-relaxed whitespace-pre-wrap mb-2">
                          {r.detail}
                        </div>
                      )}
                      {!isPending ? (
                        <div className="text-[12px] text-[var(--color-text-muted)]">
                          {r.resolutionNote ? `메모: ${r.resolutionNote}` : '처리 완료'}
                          {r.resolvedAt && ` · ${formatKoreanDate(r.resolvedAt, 'M.d HH:mm')}`}
                        </div>
                      ) : (
                        <CorrectionDecideRow
                          autoTarget={autoTarget}
                          busy={busyId === r.id}
                          onApprove={async (targetStatus, note) => {
                            setBusyId(r.id);
                            const ok = await onApprove(r.id, { targetStatus, note });
                            setBusyId(null);
                            if (ok) setExpandedId(null);
                          }}
                          onReject={async (note) => {
                            if (!note.trim()) return;
                            setBusyId(r.id);
                            const ok = await onReject(r.id, note.trim());
                            setBusyId(null);
                            if (ok) setExpandedId(null);
                          }}
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// 정정 요청 1건의 승인/반려 입력 — 자동 매핑이 있는 사유는 그대로 승인,
// 없으면(other / swapped_with_other) 관리자가 대상 상태를 선택해야 한다.
function CorrectionDecideRow({
  autoTarget,
  busy,
  onApprove,
  onReject,
}: {
  autoTarget: ReservationStatus | null;
  busy: boolean;
  onApprove: (targetStatus: ReservationStatus | undefined, note: string) => Promise<void>;
  onReject: (note: string) => Promise<void>;
}) {
  const [manualTarget, setManualTarget] = useState<ReservationStatus | null>(autoTarget);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[var(--color-text-muted)]">대상 상태:</span>
        {autoTarget ? (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[11.5px] font-medium border"
            style={{
              backgroundColor: reservationStatusConfig[autoTarget].color,
              color: '#fff',
              borderColor: reservationStatusConfig[autoTarget].color,
            }}
          >
            {reservationStatusConfig[autoTarget].label} (자동)
          </span>
        ) : (
          <div className="inline-flex items-center gap-1">
            {STATUS_PILL_ORDER.map(s => {
              const conf = reservationStatusConfig[s];
              const active = manualTarget === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setManualTarget(s)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] border transition-colors',
                    active ? 'shadow-sm' : 'bg-white hover:opacity-80',
                  )}
                  style={
                    active
                      ? { backgroundColor: conf.color, color: '#fff', borderColor: conf.color }
                      : { color: conf.color, borderColor: conf.color + '55' }
                  }
                >
                  {conf.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <FormField label="관리자 메모 (선택, 반려 시 필수)">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="예: 출석 명단 재확인하여 정정 처리"
          className="form-input"
          maxLength={500}
        />
      </FormField>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={busy || (!autoTarget && !manualTarget)}
          onClick={() => {
            setMode('approve');
            onApprove(autoTarget ?? manualTarget ?? undefined, note);
          }}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[12px] text-white bg-[var(--color-success)] rounded hover:opacity-90 transition disabled:opacity-50"
        >
          <Check size={13} /> {busy && mode === 'approve' ? '승인 중…' : '승인'}
        </button>
        <button
          type="button"
          disabled={busy || !note.trim()}
          onClick={() => {
            setMode('reject');
            onReject(note);
          }}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[12px] text-[var(--color-danger)] border border-[var(--color-danger-border)] bg-white rounded hover:bg-[var(--color-danger-bg)] transition disabled:opacity-50"
          title={!note.trim() ? '반려 사유 메모를 입력하세요' : ''}
        >
          <X size={13} /> {busy && mode === 'reject' ? '반려 중…' : '반려'}
        </button>
      </div>
    </div>
  );
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
  // PR-A: 태그 마스터를 컨텍스트에서 가져와 멀티셀렉트로 노출.
  // sessionTags 가 비어 있으면 (admin 이 처음 들어와 아직 fetch 가 끝나지
  // 않은 경우) 빈 배열을 그대로 두어 fallback 으로 type 만 사용하도록 한다.
  const { sessionTags } = useApp();
  const [name, setName] = useState(session.name);
  const [type, setType] = useState<SessionType>(session.type);
  // 초기 태그 — Session.tags 가 우선이고, 없으면 legacy type 으로 single-tag 처리.
  const [tags, setTags] = useState<string[]>(
    Array.isArray(session.tags) && session.tags.length > 0 ? [...session.tags] : []
  );
  const [date, setDate] = useState(session.date);
  const [startTime, setStartTime] = useState(session.startTime);
  const [endTime, setEndTime] = useState(session.endTime ?? '');
  const [location, setLocation] = useState(session.location ?? '');
  const [locationAddress, setLocationAddress] = useState(session.locationAddress ?? '');
  const [locationMapUrl, setLocationMapUrl] = useState(session.locationMapUrl ?? '');
  const [maxCapacity, setMaxCapacity] = useState(session.maxCapacity);
  // PR-C2: 오버부킹 비율(%). UI 는 사용자 친화적으로 백분율(0~50)을 표시,
  // 서버에는 소수(0.0 ~ 0.5)로 변환해 보낸다. session.overbookRatio 가
  // 없으면 기본 10%.
  const initialOverbookPct = Math.round(((session.overbookRatio ?? 0.10) * 100));
  const [overbookPct, setOverbookPct] = useState(initialOverbookPct);
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

    // PR-C2: 오버부킹 비율 diff. UI 는 백분율(0..50), 저장은 소수(0..0.5).
    const newRatio = Number((Math.max(0, Math.min(50, Number(overbookPct))) / 100).toFixed(3));
    const prevRatio = Number(((session.overbookRatio ?? 0.10)).toFixed(3));
    if (newRatio !== prevRatio) patch.overbookRatio = newRatio;

    // PR-A: 태그 diff. 정렬 후 비교해 순서가 달라지는 noise 를 막는다.
    const prevTags = [...(session.tags ?? [])].sort();
    const nextTags = [...tags].sort();
    if (prevTags.length !== nextTags.length || prevTags.some((t, i) => t !== nextTags[i])) {
      patch.tags = [...tags];
    }

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="세션명" required>
                <input className="form-input" value={name} onChange={e => setName(e.target.value)} maxLength={200} />
              </FormField>
              <FormField label="유형" required>
                <select className="form-input" value={type} onChange={e => setType(e.target.value as SessionType)}>
                  <option value="ebw">EBW 실내 러닝</option>
                  <option value="slowrun">슬로우롱런클럽 (런클럽)</option>
                  <option value="marathon">러닝 클래스</option>
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

            {/* ── PR-C2: 오버부킹(중복 예약 허용) ── */}
            {/* 정원의 N% 만큼은 노쇼 대비로 추가 수용. 기본 10%. 정원 8명 × 10% */}
            {/* = ceil(0.8) = 1슬롯 → 9명까지 즉시 예약 가능, 10번째부터 자동 대기. */}
            <FormField
              label="오버부킹 비율 (%)"
              hint={`정원 ${maxCapacity}명 + 추가 ${Math.ceil(maxCapacity * (Math.max(0, Math.min(50, Number(overbookPct))) / 100))}명까지 즉시 예약 (그 이후는 자동 대기)`}
            >
              <input
                type="number"
                min={0}
                max={50}
                step={1}
                className="form-input"
                value={overbookPct}
                onChange={e => {
                  const n = parseInt(e.target.value);
                  if (Number.isFinite(n)) setOverbookPct(Math.max(0, Math.min(50, n)));
                  else setOverbookPct(0);
                }}
              />
            </FormField>
            <label className="inline-flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={isIndoor} onChange={e => setIsIndoor(e.target.checked)} />
              실내 세션 (우천 무관)
            </label>

            {/* ── PR-A: 태그 멀티셀렉트 ── */}
            {/* 태그가 단일 진실 공급원이며, 매칭 시 수강권의 태그 교집합으로 */}
            {/* 사용 가능 여부를 판정한다. 비활성 태그는 노출하지 않는다. */}
            <FormField
              label="태그"
              hint="수강권 매칭에 사용. 비워 두면 위의 '유형' fallback 으로 동작"
            >
              <div className="flex flex-wrap gap-1.5">
                {sessionTags.filter(t => t.isActive && t.id !== '*').length === 0 ? (
                  <span className="text-[12px] text-[var(--color-text-muted)]">
                    등록된 태그가 없습니다 — 어드민 → 태그 마스터에서 먼저 추가하세요.
                  </span>
                ) : (
                  sessionTags
                    .filter(t => t.isActive && t.id !== '*')
                    .map(t => {
                      const checked = tags.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            setTags(prev =>
                              checked ? prev.filter(x => x !== t.id) : [...prev, t.id]
                            )
                          }
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[12px] transition-colors',
                            checked
                              ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                              : 'bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/40'
                          )}
                          style={
                            checked && t.color
                              ? { backgroundColor: t.color, borderColor: t.color }
                              : undefined
                          }
                        >
                          {t.icon && <span>{t.icon}</span>}
                          {t.label}
                        </button>
                      );
                    })
                )}
              </div>
            </FormField>
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


