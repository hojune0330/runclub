import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ArrowRight, Calendar, MapPin, Clock, Users, Ticket } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import PublicProductCard from '@/components/public/PublicProductCard';
import { sessionTypeConfig } from '@/lib/config';
import { formatKoreanDate } from '@/lib/utils';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface PublicSession {
  id: string;
  name: string;
  type: 'ebw' | 'slowrun' | 'marathon';
  date: string;
  startTime: string;
  endTime?: string;
  location: string;
  isIndoor: boolean;
  capacity: number;
  reserved: number;
  remaining: number;
  isFull: boolean;
}

interface PublicStats {
  activeMembers: number;
  upcomingSessionsThisWeek: number;
  attendedLast30Days: number;
  sessionTypesThisWeek: Record<string, number>;
}

async function fetchPublicData(): Promise<{ sessions: PublicSession[]; stats: PublicStats | null }> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  try {
    const [sRes, stRes] = await Promise.all([
      fetch(`${base}/api/public/sessions?limit=4&days=14`, { cache: 'no-store' }),
      fetch(`${base}/api/public/stats`, { cache: 'no-store' }),
    ]);
    const sData = sRes.ok ? await sRes.json() : { sessions: [] };
    const stData = stRes.ok ? await stRes.json() : null;
    return { sessions: sData.sessions || [], stats: stData };
  } catch {
    return { sessions: [], stats: null };
  }
}

export default async function LandingPage() {
  // Server-side auth check: if user is already logged in, go straight to the app
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      redirect('/app');
    }
  }

  const { sessions, stats } = await fetchPublicData();

  return (
    <PublicLayout>
      {/*
        ── HERO ──
        토스 스타일: 그라디언트/일러스트 없이 화이트 베이스 + 큰 타이포 +
        단일 primary CTA. 두번째 줄에 인라인 텍스트 링크로 보조 액션 제공.
        모바일에서 첫 화면에 CTA가 보이도록 px/py 보수적으로 책정.
      */}
      <section className="bg-white">
        <div className="max-w-[1200px] mx-auto px-5 md:px-6 pt-10 md:pt-20 pb-8 md:pb-14">
          <div className="max-w-[640px]">
            <h1 className="text-[28px] md:text-[44px] font-bold leading-[1.25] tracking-[-0.02em] text-[var(--color-text)]">
              오늘 달릴 세션,
              <br />
              한 번에 정리했어요.
            </h1>
            <p className="mt-4 md:mt-5 text-[14.5px] md:text-[17px] text-[var(--color-text-secondary)] leading-relaxed">
              예약부터 QR 출석, 수강권까지.
              <br className="md:hidden" />
              <span className="hidden md:inline"> </span>
              필요한 건 다 들어 있어요.
            </p>

            <div className="mt-7 md:mt-9 flex flex-col sm:flex-row gap-2.5 sm:items-center">
              <Link
                href="/login?mode=register"
                className="inline-flex items-center justify-center gap-1.5 h-12 sm:h-[52px] px-6 rounded-md text-[15px] font-semibold bg-[var(--color-primary)] text-white active:bg-[var(--color-primary-active)] sm:hover:bg-[var(--color-primary-hover)] transition-colors"
              >
                30초 만에 시작하기 <ArrowRight size={16} />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center h-12 sm:h-[52px] px-2 sm:px-3 text-[14px] font-medium text-[var(--color-text-secondary)] sm:hover:text-[var(--color-text)]"
              >
                이미 회원이에요 →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/*
        ── UPCOMING SESSIONS ──
        랜딩의 진짜 콘텐츠. 가입 전에도 일정·자리를 확인할 수 있다는 가치.
        섹션 헤더 톤 다운 (서브카피 줄임), 카드 그리드 그대로 유지.
      */}
      <section className="bg-white border-t border-[var(--color-border-subtle)]">
        <div className="max-w-[1200px] mx-auto px-5 md:px-6 py-10 md:py-16">
          <div className="flex items-end justify-between gap-3 mb-5 md:mb-7">
            <h2 className="text-[20px] md:text-[26px] font-bold tracking-[-0.01em] text-[var(--color-text)]">
              다가오는 세션
            </h2>
            <Link
              href="/sessions"
              className="shrink-0 text-[13px] md:text-[13.5px] font-medium text-[var(--color-primary)] inline-flex items-center gap-1 active:underline sm:hover:underline"
            >
              전체 보기 <ArrowRight size={12} />
            </Link>
          </div>

          {sessions.length === 0 ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-md p-10 text-center">
              <Calendar size={22} className="mx-auto mb-2 text-[var(--color-text-muted)]" />
              <p className="text-[13.5px] text-[var(--color-text)] font-medium">예정된 세션이 없어요</p>
              <p className="text-[12px] text-[var(--color-text-muted)] mt-1">
                곧 새 세션이 업데이트됩니다.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
              {sessions.slice(0, 4).map(s => (
                <SessionPreviewCard key={s.id} session={s} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/*
        ── STATS STRIP ──
        토스 스타일의 절제된 숫자 한 줄. 자랑성 헤딩 없이 그냥 숫자만.
        통계가 비어 있으면 섹션 자체를 렌더하지 않는다.
      */}
      {stats && (stats.activeMembers > 0 || stats.upcomingSessionsThisWeek > 0) && (
        <section className="bg-[var(--color-bg-subtle)] border-y border-[var(--color-border-subtle)]">
          <div className="max-w-[1200px] mx-auto px-5 md:px-6 py-8 md:py-10">
            <div className="grid grid-cols-3 gap-3 md:gap-10">
              <Stat value={stats.activeMembers} suffix="명" label="함께하는 러너" />
              <Stat value={stats.upcomingSessionsThisWeek} suffix="개" label="이번 주 세션" />
              <Stat value={stats.attendedLast30Days} suffix="회" label="최근 30일 출석" />
            </div>
          </div>
        </section>
      )}

      {/*
        ── PRODUCT PREVIEW ──
        통계 숫자로 신뢰를 쌓은 직후, "어떤 상품이 있는지" 가격 투명성을
        보여준다. compact 모드로 공간을 적게 차지하면서도 3종 대표 상품 노출.
        마케팅 목적: "가격이 이렇구나" → 가입 장벽 ↓
      */}
      <section className="bg-white border-b border-[var(--color-border-subtle)]">
        <div className="max-w-[1200px] mx-auto px-5 md:px-6 py-10 md:py-14">
          <div className="flex items-end justify-between gap-3 mb-5 md:mb-7">
            <h2 className="text-[20px] md:text-[26px] font-bold tracking-[-0.01em] text-[var(--color-text)]">
              이런 상품이 있어요
            </h2>
            <Link
              href="/sessions#products"
              className="shrink-0 text-[13px] md:text-[13.5px] font-medium text-[var(--color-primary)] inline-flex items-center gap-1 active:underline sm:hover:underline"
            >
              <Ticket size={13} /> 전체 보기
            </Link>
          </div>
          <PublicProductCard variant="card" compact max={3} />
        </div>
      </section>

      {/*
        ── HOW IT WORKS ──
        "빠른 시작" 4개 카드 → 3-step 절차 안내로 교체.
        토스 패턴: 굵직한 숫자 + 짧은 헤드라인 + 한 줄 보조 설명.
        세번째 단계 끝에 단일 CTA로 다시 컨버전 회수.
      */}
      <section className="bg-white">
        <div className="max-w-[1200px] mx-auto px-5 md:px-6 py-12 md:py-20">
          <h2 className="text-[20px] md:text-[26px] font-bold tracking-[-0.01em] text-[var(--color-text)]">
            이렇게 사용해요
          </h2>
          <p className="mt-2 text-[13.5px] md:text-[14.5px] text-[var(--color-text-muted)]">
            세 단계면 첫 세션 예약까지 끝나요.
          </p>

          <ol className="mt-7 md:mt-10 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5">
            <Step
              n={1}
              title="가입하고 수강권 등록"
              desc="휴대폰 번호로 30초 만에 가입하고, 보유한 수강권을 등록해요."
            />
            <Step
              n={2}
              title="원하는 세션 예약"
              desc="런클럽 · 러닝 클래스 세션 일정을 보고 자리를 잡아요."
            />
            <Step
              n={3}
              title="현장에서 QR 출석"
              desc="입장 시 QR을 스캔하면 출석이 자동 기록돼요."
            />
          </ol>

          <div className="mt-8 md:mt-10">
            <Link
              href="/login?mode=register"
              className="inline-flex items-center justify-center gap-1.5 h-12 px-6 rounded-md text-[14.5px] font-semibold bg-[var(--color-primary)] text-white active:bg-[var(--color-primary-active)] sm:hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              지금 시작하기 <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

// ───────── Sub-components ─────────

// Format with explicit ko-KR locale so server (system locale = en-US on
// most hosts) and client (Korean phones) produce *identical* strings.
// Prevents "Hydration mismatch" warnings from value.toLocaleString().
const koNumber = new Intl.NumberFormat('ko-KR');

function Stat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  return (
    <div>
      <p className="text-[22px] md:text-[28px] font-bold tabular-nums leading-none text-[var(--color-text)] tracking-[-0.01em]">
        {koNumber.format(value)}
        <span className="text-[13px] md:text-[15px] font-medium text-[var(--color-text-muted)] ml-0.5">
          {suffix}
        </span>
      </p>
      <p className="text-[11.5px] md:text-[12.5px] text-[var(--color-text-muted)] mt-1.5">{label}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <li className="relative pl-12 md:pl-0 md:pt-0">
      {/*
        모바일: 좌측에 큰 숫자, 데스크톱: 위쪽에 큰 숫자.
        토스 스타일대로 숫자는 컬러풀하게 (primary), 그 외는 무채색.
      */}
      <span
        className="absolute left-0 top-0 md:static md:block w-9 h-9 md:w-auto md:h-auto md:mb-3 rounded-full md:rounded-none bg-[var(--color-primary-bg)] md:bg-transparent text-[var(--color-primary)] inline-flex items-center justify-center md:items-start md:justify-start text-[14px] md:text-[28px] font-bold tabular-nums tracking-tight"
        aria-hidden
      >
        {n}
      </span>
      <p className="text-[15px] md:text-[16px] font-semibold text-[var(--color-text)] leading-tight">
        {title}
      </p>
      <p className="mt-1.5 text-[13px] md:text-[13.5px] text-[var(--color-text-secondary)] leading-relaxed">
        {desc}
      </p>
    </li>
  );
}

function SessionPreviewCard({ session }: { session: PublicSession }) {
  const config = sessionTypeConfig[session.type];
  const ratio = session.capacity > 0 ? (session.reserved / session.capacity) * 100 : 0;
  return (
    <Link
      href="/sessions"
      className="block border border-[var(--color-border)] bg-white rounded-md p-3 sm:p-3.5 active:scale-[0.99] sm:hover:border-[var(--color-primary-border)] sm:hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium"
          style={{ backgroundColor: config.bgColor, color: config.textColor }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
          {config.label}
        </span>
        <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
          {formatKoreanDate(session.date, 'M.d (EEE)')}
        </span>
      </div>
      <h4 className="text-[13.5px] sm:text-[14px] font-semibold text-[var(--color-text)] leading-tight mb-1.5 line-clamp-1">
        {session.name}
      </h4>
      <div className="space-y-0.5 text-[11.5px] sm:text-[12px] text-[var(--color-text-secondary)]">
        <div className="flex items-center gap-1">
          <Clock size={10.5} className="text-[var(--color-text-muted)]" />
          <span className="tabular-nums">
            {session.startTime}
            {session.endTime ? ` - ${session.endTime}` : ''}
          </span>
        </div>
        {session.location && (
          <div className="flex items-center gap-1">
            <MapPin size={10.5} className="text-[var(--color-text-muted)]" />
            <span className="truncate">{session.location}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Users size={10.5} className="text-[var(--color-text-muted)]" />
          <span className="tabular-nums">
            {session.reserved}/{session.capacity}
            {session.isFull && <span className="text-[var(--color-danger)] ml-1">· 마감</span>}
          </span>
        </div>
      </div>
      <div className="h-1 bg-[var(--color-bg-hover)] rounded-full overflow-hidden mt-2.5">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, ratio)}%`,
            backgroundColor: session.isFull ? 'var(--color-danger)' : config.color,
          }}
        />
      </div>
    </Link>
  );
}
