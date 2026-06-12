'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  Sun, Clock, MapPin, Phone, Check, Ban, RotateCcw,
  Sprout, History, StickyNote, RefreshCw, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig, reservationStatusConfig } from '@/lib/config';
import { formatKoreanDate, cn, format } from '@/lib/utils';
import { Button, ConfirmDialog, EmptyState, useToast } from '@/components/ui';
import type { Session, Reservation, ReservationStatus, Member } from '@/types';

// 회원별 과거 출석 이력 요약 — 전체 reservations 에서 한 번만 인덱싱.
interface MemberHistory {
  attendedCount: number;
  lastAttendedDate: string | null; // YYYY-MM-DD
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '잠시 후 다시 시도해주세요';
}

export default function TodayDashboard() {
  const {
    sessions, reservations, members,
    updateReservationStatus, bulkMarkNoshow,
    refreshReservations, refreshSessions, loading,
  } = useApp();
  const toast = useToast();
  const today = format(new Date(), 'yyyy-MM-dd');

  const todaySessions = useMemo(
    () => sessions
      .filter(s => s.date === today)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [sessions, today]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => todaySessions.find(s => s.id === selectedId) ?? todaySessions[0] ?? null,
    [todaySessions, selectedId]
  );

  // 첫 진입 시 첫 세션 자동 선택
  useEffect(() => {
    if (!selectedId && todaySessions.length > 0) setSelectedId(todaySessions[0].id);
  }, [todaySessions, selectedId]);

  // 회원별 출석 이력 인덱스 (memberId → {count, last})
  const historyByMember = useMemo(() => {
    const map = new Map<string, MemberHistory>();
    for (const r of reservations) {
      if (r.status !== 'attended') continue;
      const sess = r.session ?? sessions.find(s => s.id === r.sessionId);
      const date = sess?.date ?? '';
      const cur = map.get(r.memberId) ?? { attendedCount: 0, lastAttendedDate: null };
      cur.attendedCount += 1;
      if (date && (!cur.lastAttendedDate || date > cur.lastAttendedDate)) cur.lastAttendedDate = date;
      map.set(r.memberId, cur);
    }
    return map;
  }, [reservations, sessions]);

  const memberById = useMemo(() => {
    const m = new Map<string, Member>();
    for (const mem of members) m.set(mem.id, mem);
    return m;
  }, [members]);

  // 선택 세션 참여자 — 활성 상태 우선 정렬
  const attendees = useMemo(() => {
    if (!selected) return [];
    const order: Record<ReservationStatus, number> = { reserved: 0, attended: 1, noshow: 2, cancelled: 3 };
    return reservations
      .filter(r => r.sessionId === selected.id)
      .sort((a, b) => {
        const o = (order[a.status] ?? 9) - (order[b.status] ?? 9);
        if (o !== 0) return o;
        return a.memberName.localeCompare(b.memberName);
      });
  }, [selected, reservations]);

  const counts = useMemo(() => {
    const reserved = attendees.filter(r => r.status === 'reserved').length;
    const attended = attendees.filter(r => r.status === 'attended').length;
    const noshow = attendees.filter(r => r.status === 'noshow').length;
    const cancelled = attendees.filter(r => r.status === 'cancelled').length;
    return { reserved, attended, noshow, cancelled };
  }, [attendees]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const setStatus = async (r: Reservation, status: ReservationStatus) => {
    if (busyId) return;
    setBusyId(r.id);
    try {
      await updateReservationStatus(r.id, status);
      await refreshReservations();
    } catch (e: unknown) {
      toast.error('처리 실패', getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const navigateToSessions = () => {
    window.dispatchEvent(new CustomEvent('admin:navigate', { detail: 'sessions' }));
  };

  const runBulkNoshow = async () => {
    if (!selected || bulkBusy) return;
    setBulkBusy(true);
    try {
      const n = await bulkMarkNoshow(selected.id);
      await refreshReservations();
      toast.success('노쇼 일괄 처리 완료', `${n}건을 노쇼로 표시했어요.`);
      setBulkConfirmOpen(false);
    } catch (e: unknown) {
      toast.error('처리 실패', getErrorMessage(e));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="max-w-[1400px] space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Sun size={20} className="text-[var(--color-primary)]" />
            오늘
          </h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
            {formatKoreanDate(new Date(), 'yyyy년 M월 d일 EEEE')} · 오늘 온 분들을 한눈에 보고 바로 출석 처리하세요.
          </p>
        </div>
        <button
          onClick={() => { refreshReservations(); refreshSessions(); }}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 text-[12.5px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-bg-hover)]"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {todaySessions.length === 0 ? (
        <div className="bg-white border border-[var(--color-border)] rounded-md py-16 px-4">
          <Sun size={40} className="text-[var(--color-border-strong)] mx-auto mb-3" />
          <EmptyState
            message="오늘 예정된 세션이 없습니다."
            description="세션 관리에서 오늘 일정을 추가하면 이 화면에서 바로 출석 처리를 시작할 수 있어요."
            action={(
              <Button type="button" variant="primary" onClick={navigateToSessions}>
                세션 관리로 이동
              </Button>
            )}
            className="py-0"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
          {/* 좌: 오늘 세션 목록 */}
          <div className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-[var(--color-text)]">오늘의 세션</h2>
              <span className="text-[12px] text-[var(--color-text-muted)]">{todaySessions.length}개</span>
            </div>
            <ul className="divide-y divide-[var(--color-border-subtle)] max-h-[640px] overflow-y-auto">
              {todaySessions.map(s => (
                <SessionRow
                  key={s.id}
                  session={s}
                  selected={selected?.id === s.id}
                  attendedCount={reservations.filter(r => r.sessionId === s.id && r.status === 'attended').length}
                  reservedCount={reservations.filter(r => r.sessionId === s.id && r.status === 'reserved').length}
                  onClick={() => setSelectedId(s.id)}
                />
              ))}
            </ul>
          </div>

          {/* 우: 선택 세션 참여자 */}
          <div className="space-y-4">
            {selected && (
              <>
                <div className="bg-white border border-[var(--color-border)] rounded-md p-4">
                  <SessionHeader session={selected} />
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    <Stat label="예약 대기" value={counts.reserved} tone="primary" />
                    <Stat label="출석" value={counts.attended} tone="success" />
                    <Stat label="노쇼" value={counts.noshow} tone="danger" />
                    <Stat label="취소" value={counts.cancelled} tone="muted" />
                  </div>
                  {counts.reserved > 0 && (
                    <button
                      onClick={() => setBulkConfirmOpen(true)}
                      disabled={bulkBusy}
                      className="mt-3 inline-flex items-center gap-1.5 h-8 px-2.5 text-[12px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
                    >
                      {bulkBusy ? <RefreshCw size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                      남은 예약 대기 {counts.reserved}명 노쇼 처리
                    </button>
                  )}
                </div>

                <div className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between">
                    <h2 className="text-[14px] font-semibold text-[var(--color-text)]">참여자 명단</h2>
                    <span className="text-[12px] text-[var(--color-text-muted)]">{attendees.length}명</span>
                  </div>
                  {attendees.length === 0 ? (
                    <div className="py-12 text-center text-[13px] text-[var(--color-text-muted)]">
                      아직 예약자가 없어요. 현장 참가자는 ‘출석 체크’ 화면에서 바로 추가할 수 있어요.
                    </div>
                  ) : (
                    <ul className="divide-y divide-[var(--color-border-subtle)]">
                      {attendees.map(r => (
                        <AttendeeRow
                          key={r.id}
                          reservation={r}
                          member={memberById.get(r.memberId)}
                          history={historyByMember.get(r.memberId)}
                          busy={busyId === r.id}
                          onMark={(status) => setStatus(r, status)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={bulkConfirmOpen}
        title="남은 예약 대기자를 노쇼 처리할까요?"
        description={selected ? `'${selected.name}' 세션의 남은 예약 대기자 ${counts.reserved}명을 모두 노쇼로 표시합니다. 이 작업은 출석 현황에 바로 반영돼요.` : undefined}
        confirmLabel="노쇼 처리"
        cancelLabel="취소"
        tone="danger"
        busy={bulkBusy}
        onConfirm={runBulkNoshow}
        onClose={() => setBulkConfirmOpen(false)}
      />
    </div>
  );
}

function SessionRow({ session, selected, attendedCount, reservedCount, onClick }: {
  session: Session; selected: boolean; attendedCount: number; reservedCount: number; onClick: () => void;
}) {
  const config = sessionTypeConfig[session.type];
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors',
          selected ? 'bg-[var(--color-primary-bg)]' : 'hover:bg-[var(--color-bg-subtle)]'
        )}
      >
        <span className="w-1 h-11 rounded shrink-0" style={{ backgroundColor: config.color }} />
        <div className="flex-1 min-w-0">
          <p className={cn('text-[13.5px] font-medium truncate', selected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]')}>
            {session.name}
          </p>
          <div className="flex items-center gap-3 text-[11.5px] text-[var(--color-text-muted)] mt-0.5">
            <span className="flex items-center gap-1 tabular-nums"><Clock size={10} />{session.startTime}</span>
            {session.location && <span className="flex items-center gap-1 truncate"><MapPin size={10} />{session.location}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[12px] tabular-nums text-[var(--color-text)]">
            <span className="text-[var(--color-success)] font-semibold">{attendedCount}</span>
            <span className="text-[var(--color-text-muted)]"> 출석</span>
          </p>
          <p className="text-[11px] tabular-nums text-[var(--color-text-muted)]">대기 {reservedCount}</p>
        </div>
        <ChevronRight size={15} className={cn('shrink-0', selected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]')} />
      </button>
    </li>
  );
}

function SessionHeader({ session }: { session: Session }) {
  const config = sessionTypeConfig[session.type];
  return (
    <div>
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium"
        style={{ backgroundColor: config.bgColor, color: config.textColor }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
        {config.label}
      </span>
      <h2 className="text-[18px] font-bold text-[var(--color-text)] mt-2">{session.name}</h2>
      <p className="text-[13px] text-[var(--color-text-secondary)] tabular-nums mt-0.5">
        {session.startTime}{session.endTime ? `–${session.endTime}` : ''}
        {session.location ? ` · ${session.location}` : ''}
        {` · 정원 ${session.currentReservations}/${session.maxCapacity}`}
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'success' | 'danger' | 'muted' }) {
  const cls = tone === 'primary'
    ? 'bg-[var(--color-primary-bg)] text-[var(--color-primary)] border-[var(--color-primary-border)]'
    : tone === 'success'
      ? 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]'
      : tone === 'danger'
        ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]'
        : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] border-[var(--color-border)]';
  return (
    <div className={cn('rounded-lg border px-2 py-2 text-center', cls)}>
      <p className="text-[11px] font-medium">{label}</p>
      <p className="text-[20px] font-bold tabular-nums leading-tight mt-0.5">{value}</p>
    </div>
  );
}

function AttendeeRow({ reservation, member, history, busy, onMark }: {
  reservation: Reservation;
  member?: Member;
  history?: MemberHistory;
  busy: boolean;
  onMark: (status: ReservationStatus) => void;
}) {
  const status = reservation.status;
  const statusCfg = reservationStatusConfig[status];
  const phone = member?.phone ?? '';
  const memo = member?.memo;
  const attendedCount = history?.attendedCount ?? 0;
  // 이 예약이 이미 '출석'으로 집계돼 있으면, 그 1회를 제외한 "이전" 누적을 보여준다.
  const priorCount = status === 'attended' ? Math.max(0, attendedCount - 1) : attendedCount;
  const isNew = priorCount === 0;

  return (
    <li className={cn('px-4 py-3', status === 'cancelled' && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[14px] font-semibold truncate', status === 'cancelled' ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text)]')}>
              {reservation.memberName}
            </span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
              style={{ backgroundColor: statusCfg.bgColor, color: statusCfg.color }}
            >
              {status === 'attended' && <Check size={10} />}
              {statusCfg.label}
            </span>
            {isNew ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                <Sprout size={10} />신규
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                <History size={10} />누적 {priorCount}회
                {history?.lastAttendedDate && status !== 'attended' && (
                  <span> · 최근 {formatKoreanDate(history.lastAttendedDate, 'M.d')}</span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 text-[12px] text-[var(--color-text-muted)]">
            {phone ? (
              <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} className="inline-flex items-center gap-1 tabular-nums hover:text-[var(--color-primary)] hover:underline">
                <Phone size={11} />{phone}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1 text-[var(--color-text-muted)]"><Phone size={11} />연락처 미등록</span>
            )}
          </div>

          {memo && (
            <p className="mt-1 flex items-start gap-1 text-[11.5px] text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] rounded px-2 py-1">
              <StickyNote size={11} className="shrink-0 mt-0.5 text-[var(--color-text-muted)]" />
              <span className="line-clamp-2">{memo}</span>
            </p>
          )}
        </div>

        {/* 빠른 출석 처리 */}
        <div className="shrink-0 flex flex-col gap-1.5">
          {status !== 'attended' && (
            <button
              onClick={() => onMark('attended')}
              disabled={busy}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-[var(--color-primary)] text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
              출석
            </button>
          )}
          {status === 'attended' && (
            <button
              onClick={() => onMark('reserved')}
              disabled={busy}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] text-[12px] hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
            >
              {busy ? <RefreshCw size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              출석 취소
            </button>
          )}
          {status === 'reserved' && (
            <button
              onClick={() => onMark('noshow')}
              disabled={busy}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] text-[12px] hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
            >
              <Ban size={12} />노쇼
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
