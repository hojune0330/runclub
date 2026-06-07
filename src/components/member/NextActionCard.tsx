'use client';

import { useMemo } from 'react';
import {
  Calendar, MapPin, QrCode, ArrowRight,
  Sparkles, AlertTriangle,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { cn, format } from '@/lib/utils';
import type { Reservation, Session } from '@/types';

/**
 * "다음 할 일" 카드 — 회원이 로그인 직후 가장 먼저 보는 단 하나의 행동 유도.
 *
 * 바쁜 회원(워킹맘), 입문자, 단일 클럽 회원 모두에게 "지금 뭘 하면 되는지"를
 * 한 줄로 답한다. 회원 상태를 우선순위로 판별해 하나의 상태만 보여준다:
 *
 *   1) 오늘 예약이 있다  → QR 체크인 강조 (오늘 출석하러 가는 사람)
 *   2) 다가오는 예약이 있다 → 다음 모임 일시/장소 + 내 예약 보기
 *   3) 활성 수강권은 있는데 예약이 없다 → 세션 예약하기
 *   4) 활성 수강권이 없다(신규) → 슬로우롱런 멤버십 안내 보기
 *
 *  + 만료 임박/잔여 부족 경고가 있으면 하단에 한 줄 덧붙인다.
 */

function navigate(tab: string) {
  window.dispatchEvent(new CustomEvent('member:navigate', { detail: tab }));
}

export default function NextActionCard() {
  const { reservations, sessions, memberPasses, currentMember } = useApp();
  const today = format(new Date(), 'yyyy-MM-dd');

  const activePasses = useMemo(
    () => memberPasses.filter(p => p.memberId === currentMember.id && p.status === 'active'),
    [memberPasses, currentMember.id]
  );

  // 다가오는 예약(오늘 포함) — 가장 가까운 것 1건
  const nextReservation = useMemo(() => {
    return reservations
      .filter(r => r.memberId === currentMember.id && r.status === 'reserved')
      .map(r => ({ ...r, session: r.session || sessions.find(s => s.id === r.sessionId) }))
      .filter((r): r is Reservation & { session: Session } => !!r.session && r.session.date >= today)
      .sort((a, b) =>
        (a.session.date + a.session.startTime).localeCompare(b.session.date + b.session.startTime)
      )[0];
  }, [reservations, sessions, currentMember.id, today]);

  const isTodayReservation = nextReservation?.session.date === today;

  // 만료 임박/잔여 부족 경고 (가장 시급한 1건)
  const warning = useMemo(() => {
    for (const p of activePasses) {
      const days = Math.ceil(
        (new Date(p.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      if (p.category === 'count' && (p.remainingCount ?? 0) <= 2 && (p.remainingCount ?? 0) > 0) {
        return `${p.productName} 잔여 ${p.remainingCount}회 — 곧 소진돼요`;
      }
      if (days >= 0 && days <= 7) {
        return `${p.productName}이(가) D-${days} 후 만료돼요`;
      }
    }
    return null;
  }, [activePasses]);

  // ── 상태 판별 ──
  type State = 'today' | 'upcoming' | 'needReserve' | 'newcomer';
  const state: State = isTodayReservation
    ? 'today'
    : nextReservation
    ? 'upcoming'
    : activePasses.length > 0
    ? 'needReserve'
    : 'newcomer';

  // 상태별 표현
  const config: Record<State, {
    accent: string; accentBg: string; icon: typeof Calendar;
    eyebrow: string; title: string; sub: string;
    primary: { label: string; tab: string }; secondary?: { label: string; tab: string };
  }> = {
    today: {
      accent: 'var(--color-runclub)', accentBg: 'var(--color-runclub-bg)', icon: QrCode,
      eyebrow: '오늘 모임이 있어요',
      title: nextReservation ? `${nextReservation.session.startTime} · ${nextReservation.session.name}` : '오늘 모임',
      sub: nextReservation?.session.location ?? '',
      primary: { label: 'QR 체크인 하기', tab: 'qr' },
      secondary: { label: '내 예약 보기', tab: 'reservations' },
    },
    upcoming: {
      accent: 'var(--color-primary)', accentBg: 'var(--color-primary-bg)', icon: Calendar,
      eyebrow: '다음 모임 예약됨',
      title: nextReservation
        ? `${nextReservation.session.date.slice(5).replace('-', '.')} ${nextReservation.session.startTime} · ${nextReservation.session.name}`
        : '',
      sub: nextReservation?.session.location ?? '',
      primary: { label: '내 예약 보기', tab: 'reservations' },
      secondary: { label: '다른 세션 보기', tab: 'calendar' },
    },
    needReserve: {
      accent: 'var(--color-primary)', accentBg: 'var(--color-primary-bg)', icon: Calendar,
      eyebrow: '예약된 모임이 없어요',
      title: '이번 주 세션을 예약해 보세요',
      sub: '수강권이 활성 상태예요. 원하는 날짜를 골라 신청하면 끝!',
      primary: { label: '세션 예약하기', tab: 'calendar' },
      secondary: { label: '내 수강권 보기', tab: 'passes' },
    },
    newcomer: {
      accent: 'var(--color-runclub)', accentBg: 'var(--color-runclub-bg)', icon: Sparkles,
      eyebrow: '환영합니다! 🎉',
      title: '슬로우롱런클럽, 첫 1회는 무료예요',
      sub: '매주 수·금 저녁 7:30, 여의도공원 문화의마당. 일단 한 번 나와보세요!',
      primary: { label: '슬로우롱런 안내 보기', tab: 'membership' },
      secondary: { label: '세션 일정 보기', tab: 'calendar' },
    },
  };

  const c = config[state];
  const Icon = c.icon;

  return (
    <section
      className="rounded-2xl border p-4 sm:p-5"
      style={{ background: c.accentBg, borderColor: `color-mix(in srgb, ${c.accent} 30%, transparent)` }}
    >
      <div className="flex items-start gap-3.5">
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: c.accent }}
        >
          <Icon size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11.5px] font-semibold tracking-wide" style={{ color: c.accent }}>
            {c.eyebrow}
          </p>
          <h2 className="text-[15.5px] sm:text-[16px] font-bold text-[var(--color-text)] mt-0.5 leading-snug">
            {c.title}
          </h2>
          {c.sub && (
            <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-1 leading-relaxed flex items-center gap-1.5 flex-wrap">
              {(state === 'today' || state === 'upcoming') && c.sub && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} className="shrink-0" /> {c.sub}
                </span>
              )}
              {state !== 'today' && state !== 'upcoming' && c.sub}
            </p>
          )}

          {/* 액션 버튼 */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              onClick={() => navigate(c.primary.tab)}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-white text-[13px] font-medium transition-opacity hover:opacity-90"
              style={{ background: c.accent }}
            >
              {state === 'today' ? <QrCode size={14} /> : <ArrowRight size={14} />}
              {c.primary.label}
            </button>
            {c.secondary && (
              <button
                onClick={() => navigate(c.secondary!.tab)}
                className="inline-flex items-center justify-center gap-1 h-9 px-3 rounded-md text-[13px] font-medium text-[var(--color-text-secondary)] bg-white/70 border border-[var(--color-border)] hover:bg-white transition-colors"
              >
                {c.secondary.label}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 만료/잔여 경고 (있을 때만) */}
      {warning && (
        <button
          onClick={() => navigate('passes')}
          className="mt-3.5 w-full flex items-center gap-2 rounded-md bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] px-3 py-2 text-left hover:opacity-90 transition-opacity"
        >
          <AlertTriangle size={14} className="text-[var(--color-warning)] shrink-0" />
          <span className="flex-1 text-[12.5px] text-[var(--color-warning)] font-medium">{warning}</span>
          <ArrowRight size={13} className="text-[var(--color-warning)] shrink-0" />
        </button>
      )}
    </section>
  );
}
