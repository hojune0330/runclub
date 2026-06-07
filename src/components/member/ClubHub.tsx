'use client';

import { useMemo } from 'react';
import {
  ArrowRight,
  Ticket,
  CalendarCheck,
  Sparkles,
  Compass,
  Activity,
  Coins,
  HeartPulse,
  Link2,
  Repeat,
} from 'lucide-react';
import { useAuth } from '@/store/AuthContext';
import { useApp } from '@/store/AppContext';
import {
  CLUBS,
  ALL_CLUB_TYPES,
  getMyClubs,
  getClubStats,
  type ClubMembership,
} from '@/lib/clubs';
import { format, cn } from '@/lib/utils';
import NextActionCard from './NextActionCard';
import type { SessionType } from '@/types';

interface ClubHubProps {
  onSelectClub: (type: SessionType) => void;
  onGoToDashboard: () => void;
  onGoToTraining?: () => void;
}

/**
 * 로그인 직후 보이는 "내 클럽 허브" 화면.
 *
 * - 소속된 클럽(수강권 or 최근 출석 기반) 카드가 먼저
 * - 아직 소속이 없으면 "둘러보기" 형태로 전체 클럽 노출
 * - 각 카드는 클릭 시 해당 클럽의 상세 홈으로 진입
 */
export default function ClubHub({ onSelectClub, onGoToDashboard, onGoToTraining }: ClubHubProps) {
  const { user } = useAuth();
  const { memberPasses, reservations, sessions, currentMember } = useApp();

  const myPasses = useMemo(
    () => memberPasses.filter(p => p.memberId === currentMember.id),
    [memberPasses, currentMember.id]
  );
  const myReservations = useMemo(
    () => reservations.filter(r => r.memberId === currentMember.id),
    [reservations, currentMember.id]
  );

  const memberships = useMemo(
    () => getMyClubs(myPasses, myReservations, sessions),
    [myPasses, myReservations, sessions]
  );
  const mySet = new Set(memberships.map(m => m.type));
  const otherClubs = ALL_CLUB_TYPES.filter(t => !mySet.has(t));

  const todayIso = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="max-w-[1100px] space-y-6">
      {/* 인사 헤더 */}
      <section>
        <p className="text-[11.5px] font-medium text-[var(--color-primary)] tracking-wide uppercase">
          Welcome back
        </p>
        <h1 className="text-[20px] md:text-[22px] font-semibold text-[var(--color-text)] mt-0.5">
          {user?.name}님, 안녕하세요 👋
        </h1>
        <p className="text-[12.5px] md:text-[13px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
          지금 바로 할 수 있는 일을 아래에서 확인하세요.
        </p>
      </section>

      {/* 다음 할 일 — 가장 중요한 행동 유도 */}
      <NextActionCard />

      {/* 트레이닝 허브 디스커버리 — 클래스 없이도 누구나 */}
      {onGoToTraining && <TrainingTeaser onGoToTraining={onGoToTraining} />}

      {/* 내 클럽 */}
      <section>
        <div className="flex items-end justify-between mb-2.5">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)] flex items-center gap-1.5">
            <Sparkles size={15} className="text-[var(--color-primary)]" />
            {memberships.length === 1 ? '내 클럽' : memberships.length > 1 ? '내 클럽' : '클럽 둘러보기'}
          </h2>
          {memberships.length > 0 && (
            <button
              onClick={onGoToDashboard}
              className="h-9 px-2.5 -mr-2 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:bg-[var(--color-bg-hover)] rounded inline-flex items-center gap-1"
            >
              내 활동 통계
              <ArrowRight size={12} />
            </button>
          )}
        </div>

        {memberships.length === 0 ? (
          <EmptyState onSelectClub={onSelectClub} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {memberships.map(m => (
              <ClubCard
                key={m.type}
                type={m.type}
                membership={m}
                onClick={() => onSelectClub(m.type)}
                todayIso={todayIso}
              />
            ))}
          </div>
        )}
      </section>

      {/* 다른 클럽 둘러보기 */}
      {otherClubs.length > 0 && memberships.length > 0 && (
        <section>
          <h2 className="text-[14px] font-semibold text-[var(--color-text)] flex items-center gap-1.5 mb-2.5">
            <Compass size={15} className="text-[var(--color-text-muted)]" />
            다른 클럽 둘러보기
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {otherClubs.map(t => (
              <ClubCard
                key={t}
                type={t}
                membership={null}
                onClick={() => onSelectClub(t)}
                todayIso={todayIso}
                muted
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * 클래스를 듣지 않는 회원도 "이런 기능이 있구나" 하고 발견할 수 있도록
 * 랜딩 화면에 깔끔하게 노출하는 트레이닝 허브 티저.
 * - 지저분하지 않게: 카드 1개에 핵심 기능만 칩 형태로
 * - 궁금해서 눌러보면 바로 트레이닝 허브로 진입
 */
function TrainingTeaser({ onGoToTraining }: { onGoToTraining: () => void }) {
  const features = [
    { icon: Activity, label: '활동 기록', color: '#2563eb' },
    { icon: Repeat, label: '9.5일 주기화', color: '#7c3aed' },
    { icon: HeartPulse, label: '건강·혈당 관리', color: '#dc2626' },
    { icon: Link2, label: '데이터 연동', color: '#ea580c' },
    { icon: Coins, label: '마일리지 적립', color: '#ca8a04' },
  ];
  return (
    <button
      onClick={onGoToTraining}
      className={cn(
        'group w-full text-left rounded-2xl border transition-all p-4 md:p-5',
        'border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary-bg)] to-white',
        'hover:shadow-md hover:-translate-y-[1px] active:translate-y-0'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white"
          style={{ background: 'var(--color-primary)' }}
          aria-hidden
        >
          <Sparkles size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[14.5px] font-semibold text-[var(--color-text)]">
              트레이닝 허브
            </h2>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--color-primary)] text-white">
              누구나 무료
            </span>
          </div>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
            클래스를 듣지 않아도 괜찮아요. 활동 기록·마일리지·건강 관리·데이터
            연동을 <span className="font-medium text-[var(--color-text)]">지금 바로</span> 써볼 수 있어요.
          </p>
        </div>
        <ArrowRight
          size={16}
          className="shrink-0 mt-1 text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] group-hover:translate-x-0.5 transition-all"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3.5">
        {features.map(f => {
          const Icon = f.icon;
          return (
            <span
              key={f.label}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium px-2 py-1 rounded-full bg-white border border-[var(--color-border)]"
            >
              <Icon size={12} style={{ color: f.color }} />
              <span className="text-[var(--color-text-secondary)]">{f.label}</span>
            </span>
          );
        })}
      </div>
    </button>
  );
}

function EmptyState({
  onSelectClub,
}: {
  onSelectClub: (t: SessionType) => void;
}) {
  return (
    <div>
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-5 text-[12.5px] text-[var(--color-text-muted)] mb-3 leading-relaxed">
        아직 활성 수강권이나 최근 예약이 없어요. 관심 있는 클럽을 먼저
        둘러보고, 세션 일정을 확인해보세요.
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {ALL_CLUB_TYPES.map(t => (
          <ClubCard
            key={t}
            type={t}
            membership={null}
            onClick={() => onSelectClub(t)}
            todayIso={format(new Date(), 'yyyy-MM-dd')}
            muted
          />
        ))}
      </div>
    </div>
  );
}

function ClubCard({
  type,
  membership,
  onClick,
  todayIso,
  muted = false,
}: {
  type: SessionType;
  membership: ClubMembership | null;
  onClick: () => void;
  todayIso: string;
  muted?: boolean;
}) {
  const meta = CLUBS[type];
  const { memberPasses, reservations, sessions, currentMember } = useApp();

  const myPasses = useMemo(
    () => memberPasses.filter(p => p.memberId === currentMember.id),
    [memberPasses, currentMember.id]
  );
  const myReservations = useMemo(
    () => reservations.filter(r => r.memberId === currentMember.id),
    [reservations, currentMember.id]
  );

  const stats = getClubStats(type, myPasses, myReservations, sessions, todayIso);

  const hasPass = stats.passes.length > 0;
  const hasReservation = stats.upcomingCount > 0;
  const isMember = hasPass || hasReservation;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative text-center rounded-2xl border transition-all p-4 md:p-5 bg-white',
        'flex flex-col items-center justify-center gap-2 overflow-hidden',
        'hover:shadow-md hover:-translate-y-[1px] active:translate-y-0',
        isMember ? 'border-[var(--color-border)]' : 'border-[var(--color-border-subtle)]',
        muted && 'opacity-90'
      )}
      style={{ minHeight: 150 }}
    >
      {/* 살짝 깔리는 클럽 컬러 (상단 얇은 라인) */}
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: meta.color }}
        aria-hidden
      />

      {/* 이모지 — 큰 원형 배지 */}
      <div
        className="w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center text-[30px] md:text-[34px] shrink-0 mt-0.5"
        style={{ background: meta.bgColor }}
        aria-hidden
      >
        {meta.heroEmoji}
      </div>

      {/* 타이틀 — 메인(가장 큼, 중앙) */}
      <h3
        className="text-[18px] md:text-[20px] font-bold leading-tight tracking-tight"
        style={{ color: meta.textColor }}
      >
        {meta.name}
      </h3>

      {/* 설명 — 아주 짧게, 부가적으로 (한 줄) */}
      <p className="text-[11.5px] text-[var(--color-text-muted)] leading-snug line-clamp-1 max-w-[90%]">
        {meta.short} · {meta.dayLabel}
      </p>

      {/* 단 하나의 신호: 수강권 보유 / 예약 여부 */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 mt-0.5 min-h-[24px]">
        {hasPass && (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[var(--color-success-bg)] text-[var(--color-success)]">
            <Ticket size={12} />
            수강권 보유
          </span>
        )}
        {hasReservation && (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
            <CalendarCheck size={12} />
            예약 {stats.upcomingCount}건
          </span>
        )}
        {!isMember && (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-medium px-2.5 py-1 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">
            <Compass size={12} />
            둘러보기
          </span>
        )}
      </div>

      {/* 진입 화살표 — 우상단 은은하게 */}
      <ArrowRight
        size={16}
        className="absolute top-3.5 right-3.5 text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] group-hover:translate-x-0.5 transition-all"
      />
    </button>
  );
}
