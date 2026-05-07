'use client';

import { useState } from 'react';
import {
  ArrowLeft, MapPin, Clock, Users, ExternalLink, AlertCircle, Check, Ticket,
  Calendar, Share2, Camera, MessageCircle, Link as LinkIcon,
} from 'lucide-react';
import { Session, SessionRibbon } from '@/types';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig } from '@/lib/config';
import { getSessionStatusLabel, isSessionFull, formatKoreanDate, cn, canUsePassForSession } from '@/lib/utils';
import InviteModal from './InviteModal';

// Mirrors RIBBON_PRESETS in admin/SessionManagement.tsx; kept here as a tiny
// lookup so the member bundle doesn't have to import the admin module.
const RIBBON_DISPLAY: Record<Exclude<SessionRibbon, 'none'>, { emoji: string; label: string; tone: string }> = {
  new:        { emoji: '🆕', label: '신규',         tone: 'bg-[var(--color-primary-bg)] text-[var(--color-primary)] border-[var(--color-primary-border)]' },
  hot:        { emoji: '🔥', label: '인기',         tone: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]' },
  few_seats:  { emoji: '⏰', label: '마감 임박',    tone: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]' },
  beginner:   { emoji: '🌱', label: '입문 환영',    tone: 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]' },
  special:    { emoji: '⭐', label: '스페셜',       tone: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]' },
  event:      { emoji: '🎉', label: '이벤트',       tone: 'bg-[var(--color-primary-bg)] text-[var(--color-primary)] border-[var(--color-primary-border)]' },
  rain_check: { emoji: '☔', label: '우천 시 안내', tone: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] border-[var(--color-border)]' },
};

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

      {/* Optional cover image — shown only when admin set one. Lazy-loaded
          and capped at a comfortable 220px so it doesn't push reservation
          actions below the fold on mobile. */}
      {session.coverImageUrl && (
        <div className="rounded-md overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={session.coverImageUrl}
            alt=""
            loading="lazy"
            className="w-full max-h-[220px] object-cover block"
          />
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
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
          {/* PR-7: Optional ribbon/badge curated by the admin */}
          {session.ribbon && session.ribbon !== 'none' && RIBBON_DISPLAY[session.ribbon as Exclude<SessionRibbon, 'none'>] && (
            <span
              className={cn(
                'text-[12px] font-medium px-2 py-0.5 rounded border inline-flex items-center gap-1',
                RIBBON_DISPLAY[session.ribbon as Exclude<SessionRibbon, 'none'>].tone
              )}
            >
              <span aria-hidden>{RIBBON_DISPLAY[session.ribbon as Exclude<SessionRibbon, 'none'>].emoji}</span>
              {RIBBON_DISPLAY[session.ribbon as Exclude<SessionRibbon, 'none'>].label}
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
        {/* PR-7: Short description shown right under the title — like a
            speech-bubble subtitle so members get the gist before scrolling. */}
        {session.description && (
          <div className="mt-3 px-3 py-2.5 bg-[var(--color-primary-bg)] border border-[var(--color-primary-border)] rounded-md">
            <p className="text-[13px] text-[var(--color-text)] leading-relaxed whitespace-pre-line">
              {session.description}
            </p>
          </div>
        )}
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

      {/* PR-7: Extra info links curated by the admin — event page, Instagram
          review, OpenChat. Renders only when at least one link is set so the
          section doesn't take screen space when there's nothing to show. */}
      {(session.eventUrl || session.instagramUrl || session.kakaoOpenChatUrl) && (
        <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">추가 안내</h2>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {session.eventUrl && (
              <a
                href={session.eventUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 rounded border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-bg-hover)] transition-colors group"
              >
                <span className="w-8 h-8 rounded bg-[var(--color-primary-bg)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <LinkIcon size={14} />
                </span>
                <span className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-[var(--color-text)]">이벤트 페이지</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] truncate">자세히 보기</p>
                </span>
                <ExternalLink size={12} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]" />
              </a>
            )}
            {session.instagramUrl && (
              <a
                href={session.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 rounded border border-[var(--color-border)] hover:border-[#E1306C]/40 hover:bg-[var(--color-bg-hover)] transition-colors group"
              >
                <span className="w-8 h-8 rounded bg-[#FDE8EE] text-[#E1306C] flex items-center justify-center shrink-0">
                  <Camera size={14} />
                </span>
                <span className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-[var(--color-text)]">인스타 후기</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] truncate">참여 후기 보기</p>
                </span>
                <ExternalLink size={12} className="text-[var(--color-text-muted)] group-hover:text-[#E1306C]" />
              </a>
            )}
            {session.kakaoOpenChatUrl && (
              <a
                href={session.kakaoOpenChatUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 rounded border border-[var(--color-border)] hover:border-[#FAE100]/60 hover:bg-[var(--color-bg-hover)] transition-colors group"
              >
                <span className="w-8 h-8 rounded bg-[#FFF7C2] text-[#3C1E1E] flex items-center justify-center shrink-0">
                  <MessageCircle size={14} />
                </span>
                <span className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-[var(--color-text)]">오픈채팅</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] truncate">참가자와 소통</p>
                </span>
                <ExternalLink size={12} className="text-[var(--color-text-muted)] group-hover:text-[#3C1E1E]" />
              </a>
            )}
          </div>
        </section>
      )}

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
