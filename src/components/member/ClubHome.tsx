'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  Ticket,
  QrCode,
  History,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  CalendarPlus,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui';
import { CLUBS } from '@/lib/clubs';
import { format, cn, isSessionFull } from '@/lib/utils';
import type { SessionType, Session, Reservation } from '@/types';

interface ClubHomeProps {
  type: SessionType;
  onBack: () => void;
  /** 상위 MemberApp이 제공하는 다른 탭으로 점프하는 함수 */
  onGoToQR: () => void;
  onGoToAttendance: () => void;
}

/**
 * 특정 클럽(EBW / 슬로우롱런 / 마라톤)에 집중한 홈 화면.
 *
 * - 이 클럽의 다가오는 세션 목록
 * - 이 클럽과 매칭되는 내 활성 수강권
 * - 오늘/다음 세션 빠른 예약 & 체크인 CTA
 * - 최근 출석 이력 (이 클럽만)
 */
export default function ClubHome({
  type,
  onBack,
  onGoToQR,
  onGoToAttendance,
}: ClubHomeProps) {
  const meta = CLUBS[type];
  const {
    sessions,
    reservations,
    memberPasses,
    currentMember,
    makeReservation,
    cancelReservation,
  } = useApp();
  const toast = useToast();

  const todayIso = format(new Date(), 'yyyy-MM-dd');

  // 이 클럽에 한정된 데이터
  const clubSessions = useMemo(
    () =>
      sessions
        .filter(s => s.type === type && s.status !== 'cancelled')
        .sort((a, b) =>
          (a.date + a.startTime).localeCompare(b.date + b.startTime)
        ),
    [sessions, type]
  );

  const upcomingSessions = useMemo(
    () => clubSessions.filter(s => s.date >= todayIso).slice(0, 8),
    [clubSessions, todayIso]
  );

  const myClubReservations = useMemo(
    () =>
      reservations
        .filter(r => r.memberId === currentMember.id)
        .map(r => ({
          ...r,
          session: r.session ?? sessions.find(s => s.id === r.sessionId),
        }))
        .filter(r => r.session && r.session.type === type),
    [reservations, sessions, type, currentMember.id]
  );

  const myUpcoming = useMemo(
    () =>
      myClubReservations
        .filter(r => r.status === 'reserved' && r.session!.date >= todayIso)
        .sort((a, b) =>
          (a.session!.date + a.session!.startTime).localeCompare(
            b.session!.date + b.session!.startTime
          )
        ),
    [myClubReservations, todayIso]
  );

  const myHistory = useMemo(
    () =>
      myClubReservations
        .filter(r => r.status === 'attended' || r.status === 'noshow')
        .sort((a, b) =>
          (b.session!.date + b.session!.startTime).localeCompare(
            a.session!.date + a.session!.startTime
          )
        )
        .slice(0, 5),
    [myClubReservations]
  );

  const myPasses = useMemo(() => {
    return memberPasses
      .filter(
        p =>
          p.memberId === currentMember.id &&
          p.status === 'active' &&
          (p.applicableSessions === 'all' ||
            (p.applicableSessions as SessionType[]).includes(type))
      )
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  }, [memberPasses, type, currentMember.id]);

  const reservedSessionIds = new Set(
    myUpcoming.map(r => r.sessionId)
  );

  const [busySessionId, setBusySessionId] = useState<string | null>(null);

  const handleReserve = async (session: Session) => {
    if (myPasses.length === 0) {
      toast.warning(
        '사용 가능한 수강권이 없어요',
        `${meta.name} 예약을 위해 '내 수강권' 메뉴에서 먼저 구매해주세요.`
      );
      return;
    }
    setBusySessionId(session.id);
    try {
      await makeReservation(session.id);
    } finally {
      setBusySessionId(null);
    }
  };

  const handleCancel = async (reservationId: string) => {
    if (!confirm('예약을 취소하시겠습니까?')) return;
    setBusySessionId(reservationId);
    try {
      await cancelReservation(reservationId);
    } finally {
      setBusySessionId(null);
    }
  };

  const attendedCount = myClubReservations.filter(
    r => r.status === 'attended'
  ).length;

  return (
    <div className="max-w-[1100px] space-y-5">
      {/* 상단 헤더 */}
      <button
        onClick={onBack}
        className="h-10 -ml-2 px-2 inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:bg-[var(--color-bg-hover)] rounded"
      >
        <ArrowLeft size={14} />
        내 클럽 홈으로
      </button>

      <section
        className="rounded-lg p-4 md:p-5 border"
        style={{
          background: meta.bgColor,
          borderColor: `${meta.color}33`,
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-md bg-white flex items-center justify-center text-[26px] shrink-0 shadow-sm"
            aria-hidden
          >
            {meta.heroEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: meta.color }}
            >
              {meta.short}
            </p>
            <h1
              className="text-[18px] md:text-[20px] font-semibold leading-tight"
              style={{ color: meta.textColor }}
            >
              {meta.name}
            </h1>
            <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
              {meta.summary}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11.5px] text-[var(--color-text-secondary)]">
              <span className="inline-flex items-center gap-1">
                <Calendar size={12} />
                {meta.dayLabel}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} />
                {meta.timeLabel}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} />
                {meta.place}
              </span>
            </div>
          </div>
        </div>

        {/* 퀵 액션 */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <QuickAction
            icon={QrCode}
            label="QR 체크인"
            onClick={onGoToQR}
            accent={meta.color}
          />
          <QuickAction
            icon={Ticket}
            label={`수강권 ${myPasses.length}`}
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('member:navigate', { detail: 'passes' })
              )
            }
            accent={meta.color}
          />
          <QuickAction
            icon={History}
            label={`출석 ${attendedCount}`}
            onClick={onGoToAttendance}
            accent={meta.color}
          />
        </div>
      </section>

      {/* 내 활성 수강권 (이 클럽 매칭) */}
      <section>
        <h2 className="text-[13.5px] font-semibold text-[var(--color-text)] mb-2">
          이 클럽에서 쓸 수 있는 수강권
        </h2>
        {myPasses.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3.5 py-3 text-[12.5px] text-[var(--color-text-muted)] flex items-center gap-2">
            <AlertCircle size={14} className="text-[var(--color-warning)]" />
            <span>
              아직 활성 수강권이 없어요. 수강권 구매 후 예약할 수 있어요.
            </span>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {myPasses.map(p => (
              <div
                key={p.id}
                className="rounded border border-[var(--color-border)] bg-white px-3.5 py-2.5 flex items-center gap-3"
              >
                <div
                  className="w-8 h-8 rounded flex items-center justify-center shrink-0"
                  style={{ background: meta.bgColor }}
                >
                  <Ticket size={15} style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-text)] truncate">
                    {p.productName}
                  </p>
                  <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">
                    {p.remainingCount !== undefined
                      ? `잔여 ${p.remainingCount}회 · `
                      : ''}
                    {p.expiryDate} 만료
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 내 다음 예약 (이 클럽) */}
      <section>
        <h2 className="text-[13.5px] font-semibold text-[var(--color-text)] mb-2">
          내 예약
        </h2>
        {myUpcoming.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3.5 py-3 text-[12.5px] text-[var(--color-text-muted)]">
            아직 {meta.short} 예약이 없어요. 아래에서 원하는 세션을 선택해
            예약해보세요.
          </div>
        ) : (
          <div className="space-y-2">
            {myUpcoming.map(r => (
              <ReservedRow
                key={r.id}
                reservation={r}
                accent={meta.color}
                busy={busySessionId === r.id}
                onCancel={() => handleCancel(r.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 예약 가능한 세션 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[13.5px] font-semibold text-[var(--color-text)]">
            다가오는 {meta.short} 세션
          </h2>
          <span className="text-[11.5px] text-[var(--color-text-muted)]">
            총 {upcomingSessions.length}건 표시
          </span>
        </div>
        {upcomingSessions.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3.5 py-4 text-[12.5px] text-[var(--color-text-muted)] text-center">
            예정된 세션이 아직 없어요.
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingSessions.map(s => {
              const reserved = reservedSessionIds.has(s.id);
              const full = isSessionFull(s);
              return (
                <SessionRow
                  key={s.id}
                  session={s}
                  accent={meta.color}
                  bgAccent={meta.bgColor}
                  textAccent={meta.textColor}
                  reserved={reserved}
                  full={full}
                  busy={busySessionId === s.id}
                  disabledReason={
                    myPasses.length === 0 && !reserved
                      ? '수강권 필요'
                      : undefined
                  }
                  onReserve={() => handleReserve(s)}
                  onCancel={() => {
                    const myRes = myUpcoming.find(r => r.sessionId === s.id);
                    if (myRes) handleCancel(myRes.id);
                  }}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* 최근 출석 (이 클럽) */}
      {myHistory.length > 0 && (
        <section>
          <h2 className="text-[13.5px] font-semibold text-[var(--color-text)] mb-2">
            최근 {meta.short} 출석
          </h2>
          <div className="rounded border border-[var(--color-border)] bg-white divide-y divide-[var(--color-border)]">
            {myHistory.map(r => (
              <div
                key={r.id}
                className="px-3.5 py-2.5 flex items-center gap-3 text-[12.5px]"
              >
                <span className="tabular-nums text-[var(--color-text-muted)] w-[88px] shrink-0">
                  {r.session!.date.slice(5)} {r.session!.startTime}
                </span>
                <span className="flex-1 truncate text-[var(--color-text)]">
                  {r.session!.location}
                </span>
                <span
                  className={cn(
                    'text-[11px] font-medium px-2 py-0.5 rounded-full',
                    r.status === 'attended'
                      ? 'text-[var(--color-success)] bg-[var(--color-success-bg)]'
                      : 'text-[var(--color-danger)] bg-[var(--color-danger-bg)]'
                  )}
                >
                  {r.status === 'attended' ? '출석' : '노쇼'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Sub components ───
function QuickAction({
  icon: Icon,
  label,
  onClick,
  accent,
}: {
  icon: typeof Calendar;
  label: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-md px-2 py-2.5 flex flex-col items-center gap-1 border border-[var(--color-border)] hover:shadow-sm active:bg-[var(--color-bg-hover)] transition"
      style={{ minHeight: 56 }}
    >
      <Icon size={17} style={{ color: accent }} />
      <span className="text-[11.5px] font-medium text-[var(--color-text)]">
        {label}
      </span>
    </button>
  );
}

function SessionRow({
  session,
  accent,
  bgAccent,
  textAccent,
  reserved,
  full,
  busy,
  disabledReason,
  onReserve,
  onCancel,
}: {
  session: Session;
  accent: string;
  bgAccent: string;
  textAccent: string;
  reserved: boolean;
  full: boolean;
  busy: boolean;
  disabledReason?: string;
  onReserve: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded border border-[var(--color-border)] bg-white flex items-center gap-3 px-3 py-2.5">
      <div
        className="w-11 rounded text-center py-1 shrink-0"
        style={{ background: bgAccent }}
      >
        <p
          className="text-[10px] font-medium"
          style={{ color: textAccent }}
        >
          {session.date.slice(5, 7)}.{session.date.slice(8, 10)}
        </p>
        <p
          className="text-[13px] font-semibold tabular-nums"
          style={{ color: textAccent }}
        >
          {session.startTime}
        </p>
      </div>
      <div className="flex-1 min-w-0">
        {/* 홈에서는 세션명 + 최소 정보만. 상세는 눌러 들어가면 보인다. */}
        <p className="text-[13px] font-medium text-[var(--color-text)] truncate">
          {session.name}
        </p>
        <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5 inline-flex items-center gap-1.5 truncate">
          {session.location && <span className="truncate">{session.location}</span>}
          <span className="inline-flex items-center gap-0.5 shrink-0 tabular-nums">
            <Users size={11} />
            {session.currentReservations}/{session.maxCapacity}
          </span>
        </p>
      </div>
      {reserved ? (
        <button
          onClick={onCancel}
          disabled={busy}
          className="h-9 px-3 text-[12px] font-medium rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)] transition disabled:opacity-50 inline-flex items-center gap-1"
        >
          <CheckCircle2 size={13} className="text-[var(--color-success)]" />
          예약됨
        </button>
      ) : full ? (
        <span className="h-9 px-3 text-[12px] font-medium rounded border border-[var(--color-border)] text-[var(--color-text-muted)] inline-flex items-center">
          마감
        </span>
      ) : disabledReason ? (
        <span
          title={disabledReason}
          className="h-9 px-3 text-[12px] font-medium rounded border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] inline-flex items-center"
        >
          {disabledReason}
        </span>
      ) : (
        <button
          onClick={onReserve}
          disabled={busy}
          className="h-9 px-3 text-[12px] font-medium rounded text-white inline-flex items-center gap-1 disabled:opacity-60"
          style={{ background: accent }}
        >
          <CalendarPlus size={13} />
          {busy ? '처리 중' : '예약'}
        </button>
      )}
    </div>
  );
}

function ReservedRow({
  reservation,
  accent,
  busy,
  onCancel,
}: {
  reservation: Reservation & { session?: Session };
  accent: string;
  busy: boolean;
  onCancel: () => void;
}) {
  const s = reservation.session!;
  return (
    <div className="rounded border border-[var(--color-border)] bg-white flex items-center gap-3 px-3 py-2.5">
      <div
        className="w-1 h-10 rounded-sm shrink-0"
        style={{ background: accent }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--color-text)] truncate">
          {s.date.slice(5)} ({s.startTime}) · {s.location}
        </p>
        <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5 inline-flex items-center gap-1">
          <ChevronRight size={11} />
          예약 완료 — {s.endTime ? `~${s.endTime}` : ''}
        </p>
      </div>
      <button
        onClick={onCancel}
        disabled={busy}
        className="h-9 px-3 text-[12px] font-medium rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)] transition disabled:opacity-50"
      >
        {busy ? '처리 중' : '취소'}
      </button>
    </div>
  );
}
