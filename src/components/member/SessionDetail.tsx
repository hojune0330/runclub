'use client';

import { useState } from 'react';
import { ArrowLeft, MapPin, Clock, Users, ExternalLink, AlertCircle, Check, Ticket, Calendar, Share2 } from 'lucide-react';
import { Session } from '@/types';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig } from '@/lib/config';
import { getSessionStatusLabel, isSessionFull, formatKoreanDate, cn, canUsePassForSession } from '@/lib/utils';
import InviteModal from './InviteModal';

interface Props {
  session: Session;
  onBack: () => void;
}

export default function SessionDetail({ session, onBack }: Props) {
  const {
    reservations,
    currentMember,
    memberPasses,
    waitlistEntries,
    makeReservation,
    cancelReservation,
    joinWaitlist,
    leaveWaitlist,
  } = useApp();

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const myReservation = reservations.find(
    r => r.sessionId === session.id && r.memberId === currentMember.id && r.status === 'reserved'
  );
  const myWaitlist = waitlistEntries.find(
    w => w.sessionId === session.id && w.memberId === currentMember.id && w.status === 'waiting'
  );
  const state: 'idle' | 'reserved' | 'waitlisted' = myReservation
    ? 'reserved'
    : myWaitlist
    ? 'waitlisted'
    : 'idle';

  const config = sessionTypeConfig[session.type];
  const full = isSessionFull(session);
  const isPast = new Date(session.date + 'T' + session.startTime) < new Date();
  const myPasses = memberPasses.filter(p => p.memberId === currentMember.id);
  const validPass = myPasses.find(p => canUsePassForSession(p, session.type));
  const ratio =
    session.maxCapacity > 0
      ? Math.round((session.currentReservations / session.maxCapacity) * 100)
      : 0;

  const waitPos = myWaitlist
    ? waitlistEntries
        .filter(w => w.sessionId === session.id && w.status === 'waiting')
        .findIndex(w => w.memberId === currentMember.id) + 1
    : 0;

  const toast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  };

  const handleReserve = async () => {
    setActionLoading(true);
    try {
      if (full) {
        await joinWaitlist(session.id);
        toast('대기 등록이 완료되었습니다.');
      } else {
        const ok = await makeReservation(session.id);
        if (ok) toast('예약이 완료되었습니다.');
      }
    } catch {
      toast('요청에 실패했습니다.');
    }
    setActionLoading(false);
  };

  const handleCancel = async () => {
    if (!confirm(state === 'reserved' ? '예약을 취소하시겠습니까?' : '대기를 취소하시겠습니까?'))
      return;
    setActionLoading(true);
    try {
      if (state === 'reserved' && myReservation) {
        await cancelReservation(myReservation.id);
        toast('예약이 취소되었습니다.');
      } else if (state === 'waitlisted' && myWaitlist) {
        await leaveWaitlist(myWaitlist.id);
        toast('대기가 취소되었습니다.');
      }
    } catch {
      toast('요청에 실패했습니다.');
    }
    setActionLoading(false);
  };

  return (
    <div className="space-y-6 max-w-[1000px]">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-text)] text-white text-[13px] px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2 animate-slide-up">
          <Check size={14} />
          {toastMsg}
        </div>
      )}

      {/* Breadcrumb / back */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] px-2 py-1 rounded hover:bg-[var(--color-bg-hover)] -ml-2"
        >
          <ArrowLeft size={14} />
          목록으로
        </button>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium"
            style={{ backgroundColor: config.bgColor, color: config.textColor }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
            {config.label}
          </span>
          {session.isIndoor && (
            <span className="text-[12px] text-[var(--color-text-muted)] border border-[var(--color-border)] rounded px-1.5 py-0.5">
              실내
            </span>
          )}
          {state === 'reserved' && (
            <span className="text-[12px] font-medium px-2 py-0.5 rounded bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
              예약 완료
            </span>
          )}
          {state === 'waitlisted' && (
            <span className="text-[12px] font-medium px-2 py-0.5 rounded bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]">
              대기 {waitPos}번째
            </span>
          )}
        </div>
        <h1 className="text-[20px] font-semibold text-[var(--color-text)]">{session.name}</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          {formatKoreanDate(session.date, 'yyyy년 M월 d일 EEEE')} · {session.startTime}
          {session.endTime ? ` — ${session.endTime}` : ''}
        </p>
      </div>

      {/* Info grid */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">세션 정보</h2>
        </div>
        <dl className="divide-y divide-[var(--color-border-subtle)]">
          <InfoRow icon={Calendar} label="일시">
            <span className="tabular-nums">
              {formatKoreanDate(session.date, 'yyyy.M.d (EEE)')}
            </span>
          </InfoRow>
          <InfoRow icon={Clock} label="시간">
            <span className="tabular-nums">
              {session.startTime}
              {session.endTime ? ` — ${session.endTime}` : ''}
            </span>
          </InfoRow>
          <InfoRow icon={MapPin} label="장소">
            {session.location ? (
              <div>
                <p className="text-[13px] text-[var(--color-text)]">{session.location}</p>
                {session.locationAddress && (
                  <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                    {session.locationAddress}
                  </p>
                )}
                {session.locationMapUrl && (
                  <a
                    href={session.locationMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] text-[var(--color-primary)] hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    지도 보기 <ExternalLink size={11} />
                  </a>
                )}
              </div>
            ) : (
              <span className="text-[var(--color-text-muted)]">미정</span>
            )}
          </InfoRow>
          <InfoRow icon={Users} label="참여 인원">
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--color-text)] tabular-nums font-medium">
                {session.currentReservations} / {session.maxCapacity}명
              </span>
              <div className="w-28 h-1.5 bg-[var(--color-bg-hover)] rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${ratio}%`,
                    backgroundColor: full
                      ? 'var(--color-danger)'
                      : ratio >= 80
                      ? 'var(--color-warning)'
                      : config.color,
                  }}
                />
              </div>
              <span
                className={cn(
                  'text-[12px]',
                  full
                    ? 'text-[var(--color-danger)]'
                    : ratio >= 80
                    ? 'text-[var(--color-warning)]'
                    : 'text-[var(--color-success)]'
                )}
              >
                {getSessionStatusLabel(session)}
              </span>
              {session.waitlistCount > 0 && (
                <span className="text-[12px] text-[var(--color-warning)]">
                  대기 {session.waitlistCount}명
                </span>
              )}
            </div>
          </InfoRow>
          {session.memo && session.memoPublic && (
            <div className="px-4 py-3">
              <p className="text-[12px] text-[var(--color-text-muted)] mb-1">안내사항</p>
              <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-line">
                {session.memo}
              </p>
            </div>
          )}
        </dl>
      </section>

      {/* Pass info */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">수강권</h2>
        </div>
        <div className="px-4 py-3">
          {validPass ? (
            <div className="flex items-center gap-3">
              <Ticket size={16} className="text-[var(--color-primary)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[var(--color-text)] font-medium">
                  {validPass.productName}
                </p>
                <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                  {validPass.category === 'count'
                    ? `잔여 ${validPass.remainingCount}회 / 전체 ${validPass.totalCount}회`
                    : validPass.category === 'season'
                    ? '시즌권 · 이용 가능'
                    : '월권 · 이용 가능'}
                </p>
              </div>
              {validPass.category === 'count' &&
                validPass.remainingCount !== undefined &&
                validPass.remainingCount <= 3 && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded border bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]">
                    잔여 {validPass.remainingCount}회
                  </span>
                )}
              <span className="text-[12px] text-[var(--color-text-muted)] tabular-nums">
                {formatKoreanDate(validPass.expiryDate, 'yyyy.M.d')} 만료
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
              <div className="flex-1 text-[13px]">
                <p className="text-[var(--color-warning)] font-medium">
                  이 세션을 이용할 수 있는 수강권이 없습니다.
                </p>
                <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                  현장에서 코치에게 문의하거나, 프로필의 "문의하기"를 이용해주세요.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Actions */}
      <section className="bg-white border border-[var(--color-border)] rounded-md p-4 flex items-center justify-between gap-3">
        <div className="text-[13px] text-[var(--color-text-secondary)]">
          {isPast
            ? '이미 종료된 세션입니다.'
            : state === 'reserved'
            ? '예약이 확정되었습니다. 세션 당일 QR로 체크인하세요.'
            : state === 'waitlisted'
            ? '현재 대기 상태입니다. 자리가 나면 자동 배정됩니다.'
            : full
            ? '정원이 마감되어 대기 신청만 가능합니다.'
            : '예약 가능합니다.'}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-2 rounded text-[13px] font-medium text-[var(--color-text-secondary)] border border-[var(--color-border)] bg-white hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-primary)] transition-colors"
            title="친구에게 공유하기"
          >
            <Share2 size={13} />
            공유
          </button>
          {isPast ? null : state === 'idle' ? (
            <button
              onClick={handleReserve}
              disabled={!validPass || actionLoading}
              className={cn(
                'px-5 py-2 rounded text-[13px] font-medium transition-colors',
                validPass
                  ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]'
                  : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] cursor-not-allowed'
              )}
            >
              {actionLoading ? '처리 중...' : full ? '대기 신청' : '예약하기'}
            </button>
          ) : (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="px-5 py-2 rounded text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] bg-white hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)] transition-colors disabled:opacity-50"
            >
              {state === 'reserved' ? '예약 취소' : '대기 취소'}
            </button>
          )}
        </div>
      </section>

      <InviteModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        session={{
          id: session.id,
          name: session.name,
          date: session.date,
          startTime: session.startTime,
        }}
      />
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Calendar;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-3 items-start">
      <dt className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)] font-medium">
        <Icon size={13} />
        {label}
      </dt>
      <dd className="text-[13px] text-[var(--color-text)]">{children}</dd>
    </div>
  );
}
