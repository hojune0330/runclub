'use client';

import { useState, useMemo } from 'react';
import { Clock, MapPin, CalendarDays, ArrowRight, AlertCircle, MessageSquareWarning, X } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig, reservationStatusConfig } from '@/lib/config';
import { formatKoreanDate, cn } from '@/lib/utils';
import CorrectionRequestSheet from './CorrectionRequestSheet';
import type { Reservation, Session } from '@/types';

type Tab = 'upcoming' | 'past';

// PR-MR1: 정정 요청 기한 — 서버(api/correction-requests)와 동일하게 48h.
// 클라이언트는 UI 노출 결정에만 사용하고 검증은 서버가 최종 책임진다.
const CORRECTION_WINDOW_HOURS = 48;

function withinCorrectionWindow(session: Session | undefined): boolean {
  if (!session) return false;
  const t = new Date(`${session.date}T${session.startTime || '00:00'}:00`).getTime();
  if (Number.isNaN(t)) return false;
  const deadline = t + CORRECTION_WINDOW_HOURS * 3600_000;
  return Date.now() <= deadline;
}

export default function MyReservations() {
  const {
    reservations, sessions, currentMember, cancelReservation,
    correctionRequests, withdrawCorrectionRequest,
  } = useApp();
  const [tab, setTab] = useState<Tab>('upcoming');
  // 정정 요청 시트 — 어느 예약을 대상으로 띄울지
  const [correctionTarget, setCorrectionTarget] = useState<{ reservation: Reservation; session: Session } | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const myReservations = useMemo(() => {
    return reservations
      .filter(r => r.memberId === currentMember.id)
      .map(r => ({
        ...r,
        session: r.session || sessions.find(s => s.id === r.sessionId),
      }));
  }, [reservations, sessions, currentMember.id]);

  const upcoming = myReservations
    .filter(r => r.session && r.session.date >= today && r.status === 'reserved')
    .sort((a, b) => (a.session?.date || '').localeCompare(b.session?.date || ''));
  const past = myReservations
    .filter(r => r.session && (r.session.date < today || r.status !== 'reserved'))
    .sort((a, b) => (b.session?.date || '').localeCompare(a.session?.date || ''));

  const items = tab === 'upcoming' ? upcoming : past;

  const handleCancel = async (reservationId: string) => {
    if (confirm('예약을 취소하시겠습니까?')) {
      await cancelReservation(reservationId);
    }
  };

  // 내 정정 요청 — pending 만 상단 strip 에 노출. 처리된 건은 인박스 컨셉
  // 이 아니라 그냥 결과만 반영되면 되므로 굳이 표시하지 않는다.
  const myPendingCorrections = useMemo(() => {
    return (correctionRequests || []).filter(
      c => c.memberId === currentMember.id && c.status === 'pending',
    );
  }, [correctionRequests, currentMember.id]);

  // 이 예약에 이미 pending 정정 요청이 있는가? — 있다면 버튼을 disable 하고
  // 안내 텍스트를 띄운다 (서버에도 UNIQUE INDEX 로 막혀있지만 UX 차원).
  const pendingForReservation = (reservationId: string) =>
    myPendingCorrections.find(c => c.reservationId === reservationId);

  // 회원 입장에서 [정정 요청] 버튼을 노출할 조건:
  //  - 세션 시작으로부터 48h 이내
  //  - 같은 예약에 pending 인 요청이 아직 없음
  //  - 상태와 무관(예약/출석/노쇼/취소 모두 가능)
  const canRequestCorrection = (r: Reservation & { session?: Session }) => {
    if (!r.session) return false;
    return withinCorrectionWindow(r.session) && !pendingForReservation(r.id);
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Page heading */}
      <div>
        <h1 className="page-title">내 예약</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          다가오는 예약 {upcoming.length}건 · 지난 예약 {past.length}건
        </p>
      </div>

      {/* PR-MR1: 처리 중인 정정 요청 strip — 회원이 자신이 보낸 요청 진행 상황을
          한눈에 보고 필요하면 철회할 수 있게 한다. pending 이 0건이면 숨김. */}
      {myPendingCorrections.length > 0 && (
        <div className="bg-[var(--color-primary-bg)] border border-[var(--color-primary)]/30 rounded-md px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={15} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[var(--color-text)] font-medium">
                처리 중인 정정 요청 {myPendingCorrections.length}건
              </p>
              <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                관리자가 확인 후 처리합니다. 보통 1~2일 내로 답변드려요.
              </p>
              <ul className="mt-2 space-y-1">
                {myPendingCorrections.map(c => {
                  const sess = sessions.find(s => s.id === c.sessionId);
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 bg-white border border-[var(--color-border-subtle)] rounded px-2.5 py-1.5"
                    >
                      <span className="text-[12px] text-[var(--color-text-secondary)] truncate min-w-0">
                        {sess
                          ? `${formatKoreanDate(sess.date, 'M.d (EEE)')} ${sess.startTime} · ${sess.name}`
                          : '세션 정보 없음'}
                        {c.detail ? ` — ${c.detail}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm('이 정정 요청을 철회하시겠습니까?')) {
                            await withdrawCorrectionRequest(c.id);
                          }
                        }}
                        className="shrink-0 inline-flex items-center gap-1 text-[11.5px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
                        title="요청 철회"
                      >
                        <X size={11} />
                        철회
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Panel */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-[var(--color-border)] px-4">
          {(
            [
              { id: 'upcoming' as Tab, label: '다가오는 예약', count: upcoming.length },
              { id: 'past' as Tab, label: '지난 예약', count: past.length },
            ]
          ).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'text-[13px] py-2.5 px-3 -mb-px border-b-2 transition-colors inline-flex items-center gap-1.5',
                tab === t.id
                  ? 'border-[var(--color-primary)] text-[var(--color-text)] font-medium'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              )}
            >
              {t.label}
              <span
                className={cn(
                  'text-[11px] px-1.5 py-0 rounded-full tabular-nums',
                  tab === t.id
                    ? 'bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
                    : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
              <CalendarDays size={18} className="text-[var(--color-text-muted)]" />
            </div>
            <p className="text-[13.5px] text-[var(--color-text)] font-medium mb-1">
              {tab === 'upcoming' ? '다가오는 예약이 없어요' : '지난 예약이 없어요'}
            </p>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mb-4">
              {tab === 'upcoming'
                ? '세션 일정에서 원하는 세션을 선택해 예약해 보세요.'
                : '참여한 세션이 쌓이면 여기에 기록이 남아요.'}
            </p>
            {tab === 'upcoming' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('member:navigate', { detail: 'calendar' }))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded transition-colors"
              >
                세션 일정 보기
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        ) : (
          <>
          {/* Mobile card list */}
          <ul className="sm:hidden divide-y divide-[var(--color-border-subtle)]">
            {items.map(r => {
              const session = r.session;
              if (!session) return null;
              const config = sessionTypeConfig[session.type];
              const statusConf = reservationStatusConfig[r.status];
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0"
                        style={{ backgroundColor: config.bgColor, color: config.textColor }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                        {config.label}
                      </span>
                      <p className="text-[13px] font-medium text-[var(--color-text)] truncate">
                        {session.name}
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0"
                      style={{ backgroundColor: statusConf.bgColor, color: statusConf.color }}
                    >
                      {statusConf.label}
                    </span>
                  </div>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[var(--color-text-muted)] tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={11} />
                      {formatKoreanDate(session.date, 'M월 d일 (EEE)')}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      {session.startTime}
                    </span>
                    {session.location && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <MapPin size={11} />
                        {session.location}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {tab === 'upcoming' && r.status === 'reserved' && (
                      <button
                        onClick={() => handleCancel(r.id)}
                        className="text-[12px] px-2.5 py-1 border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger-border)] transition-colors"
                      >
                        예약 취소
                      </button>
                    )}
                    {/* PR-MR1: 정정 요청 진입점 — 48h 이내이고 pending 요청이 없을 때만 */}
                    {canRequestCorrection(r) && (
                      <button
                        onClick={() => setCorrectionTarget({ reservation: r, session })}
                        className="text-[12px] px-2.5 py-1 border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/50 transition-colors inline-flex items-center gap-1"
                      >
                        <MessageSquareWarning size={11} />
                        정정 요청
                      </button>
                    )}
                    {pendingForReservation(r.id) && (
                      <span className="text-[11.5px] text-[var(--color-primary)] inline-flex items-center gap-1">
                        <AlertCircle size={11} />
                        정정 요청 처리 중
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop table */}
          <div className="hidden sm:block scroll-x">
          <table className="responsive-table" style={{ minWidth: 640 }}>
            <thead>
              <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                <th className="text-left font-medium px-4 py-2.5 w-[140px]">날짜</th>
                <th className="text-left font-medium px-4 py-2.5 w-[80px]">시간</th>
                <th className="text-left font-medium px-4 py-2.5 w-[120px]">유형</th>
                <th className="text-left font-medium px-4 py-2.5 w-[160px]">세션명</th>
                <th className="text-left font-medium px-4 py-2.5 w-[160px]">장소</th>
                <th className="text-left font-medium px-4 py-2.5 w-[100px]">상태</th>
                <th className="text-right font-medium px-4 py-2.5 w-[100px]"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(r => {
                const session = r.session;
                if (!session) return null;
                const config = sessionTypeConfig[session.type];
                const statusConf = reservationStatusConfig[r.status];
                return (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)] transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--color-text)] tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays size={12} className="text-[var(--color-text-muted)]" />
                        {formatKoreanDate(session.date, 'M월 d일 (EEE)')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)] tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-[var(--color-text-muted)]" />
                        {session.startTime}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium"
                        style={{ backgroundColor: config.bgColor, color: config.textColor }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)] font-medium max-w-[160px] truncate" title={session.name}>{session.name}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] max-w-[160px] truncate" title={session.location || undefined}>
                      {session.location ? (
                        <div className="flex items-center gap-1">
                          <MapPin size={12} className="text-[var(--color-text-muted)] shrink-0" />
                          <span className="truncate">{session.location}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium"
                        style={{ backgroundColor: statusConf.bgColor, color: statusConf.color }}
                      >
                        {statusConf.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {tab === 'upcoming' && r.status === 'reserved' && (
                          <button
                            onClick={() => handleCancel(r.id)}
                            className="text-[12px] px-2.5 py-1 border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger-border)] transition-colors"
                          >
                            예약 취소
                          </button>
                        )}
                        {canRequestCorrection(r) && (
                          <button
                            onClick={() => setCorrectionTarget({ reservation: r, session })}
                            className="text-[12px] px-2.5 py-1 border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/50 transition-colors inline-flex items-center gap-1"
                            title="48시간 이내라면 출석/예약을 잘못 처리한 경우 관리자에게 정정 요청을 보낼 수 있습니다"
                          >
                            <MessageSquareWarning size={11} />
                            정정 요청
                          </button>
                        )}
                        {pendingForReservation(r.id) && (
                          <span className="text-[11.5px] text-[var(--color-primary)] inline-flex items-center gap-1">
                            <AlertCircle size={11} />
                            처리 중
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </>
        )}
      </section>

      {/* PR-MR1: 정정 요청 작성 시트 */}
      {correctionTarget && (
        <CorrectionRequestSheet
          reservation={correctionTarget.reservation}
          session={correctionTarget.session}
          onClose={() => setCorrectionTarget(null)}
        />
      )}
    </div>
  );
}
