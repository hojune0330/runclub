import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ArrowRight, Calendar, QrCode, MapPin, Clock, Users, LogIn, UserPlus, Sparkles } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
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
      {/* ── HERO (compact, app-like) ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[var(--color-primary)] via-[#1d4ed8] to-[#1e3a8a] text-white">
        <div className="absolute inset-0 opacity-20" aria-hidden>
          <div className="absolute -top-24 -right-24 w-[320px] h-[320px] rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-[380px] h-[380px] rounded-full bg-[#60a5fa]/30 blur-3xl" />
        </div>
        <div className="relative max-w-[1200px] mx-auto px-4 md:px-6 py-10 md:py-16">
          <div className="max-w-[640px]">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-[11px] md:text-[11.5px] font-medium tracking-wider uppercase backdrop-blur">
              <Sparkles size={11} /> 런클럽 매니저
            </span>
            <h1 className="mt-4 text-[26px] md:text-[40px] font-bold leading-[1.2] tracking-tight">
              오늘 달릴 세션을
              <br className="md:hidden" />
              <span className="text-[#bfdbfe]"> 한 번에 확인.</span>
            </h1>
            <p className="mt-3 text-[13.5px] md:text-[15.5px] text-white/85 leading-relaxed max-w-[520px]">
              예약 · QR 출석 · 수강권 관리까지. 가입 전에도 일정을 확인할 수 있어요.
            </p>

            {/* Primary action row — mobile-first, full-width buttons */}
            <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2.5 max-w-[420px] sm:max-w-none">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-1.5 h-11 sm:h-[46px] px-4 sm:px-5 rounded-md text-[14px] font-semibold bg-white text-[var(--color-primary)] active:bg-white/90 sm:hover:bg-white/90 transition-colors"
              >
                <LogIn size={15} /> 로그인
              </Link>
              <Link
                href="/login?mode=register"
                className="inline-flex items-center justify-center gap-1.5 h-11 sm:h-[46px] px-4 sm:px-5 rounded-md text-[14px] font-semibold bg-white/10 sm:hover:bg-white/20 active:bg-white/20 text-white border border-white/30 transition-colors"
              >
                <UserPlus size={15} /> 가입하기
              </Link>
              <Link
                href="/sessions"
                className="col-span-2 sm:col-auto inline-flex items-center justify-center gap-1.5 h-11 sm:h-[46px] px-4 sm:px-5 rounded-md text-[14px] font-medium text-white/90 sm:hover:text-white hover:bg-white/10 transition-colors"
              >
                세션 일정 보기 <ArrowRight size={14} />
              </Link>
            </div>

            {/* Quick stats row */}
            {stats && (
              <div className="mt-7 md:mt-9 grid grid-cols-3 gap-2 md:gap-6 max-w-[520px]">
                <HeroStat value={stats.activeMembers} suffix="명" label="함께하는 러너" />
                <HeroStat value={stats.upcomingSessionsThisWeek} suffix="개" label="이번 주 세션" />
                <HeroStat value={stats.attendedLast30Days} suffix="회" label="30일 출석" />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── UPCOMING SESSIONS (primary content, app-like list) ── */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="flex items-end justify-between gap-3 mb-4 md:mb-5">
          <div>
            <h2 className="text-[18px] md:text-[22px] font-bold text-[var(--color-text)] tracking-tight">
              다가오는 세션
            </h2>
            <p className="mt-0.5 text-[12px] md:text-[13px] text-[var(--color-text-muted)]">
              가입 전에도 일정·위치를 확인할 수 있어요
            </p>
          </div>
          <Link
            href="/sessions"
            className="shrink-0 text-[12.5px] md:text-[13px] font-medium text-[var(--color-primary)] active:underline sm:hover:underline inline-flex items-center gap-1"
          >
            전체 일정 <ArrowRight size={12} />
          </Link>
        </div>

        {sessions.length === 0 ? (
          <div className="border border-dashed border-[var(--color-border)] rounded-md p-8 text-center">
            <Calendar size={22} className="mx-auto mb-2 text-[var(--color-text-muted)]" />
            <p className="text-[13.5px] text-[var(--color-text)] font-medium">예정된 세션이 없어요</p>
            <p className="text-[12px] text-[var(--color-text-muted)] mt-1">
              곧 새로운 세션이 업데이트될 예정입니다.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
            {sessions.slice(0, 4).map(s => (
              <SessionPreviewCard key={s.id} session={s} />
            ))}
          </div>
        )}
      </section>

      {/* ── QUICK ACTIONS (app-launcher style) ── */}
      <section className="bg-[var(--color-bg-subtle)] border-y border-[var(--color-border)]">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-8 md:py-12">
          <h2 className="text-[18px] md:text-[22px] font-bold text-[var(--color-text)] tracking-tight mb-4 md:mb-5">
            빠른 시작
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
            <QuickLink
              href="/sessions"
              icon={Calendar}
              title="세션 일정"
              description="다가오는 세션 미리보기"
            />
            <QuickLink
              href="/about"
              icon={MapPin}
              title="운영 장소"
              description="러닝 스팟·시간표"
            />
            <QuickLink
              href="/login?mode=register"
              icon={UserPlus}
              title="가입하기"
              description="30초면 완료"
              highlight
            />
            <QuickLink
              href="/login"
              icon={QrCode}
              title="로그인"
              description="예약·QR 출석·수강권"
            />
          </div>
        </div>
      </section>

      {/* ── Footer CTA (subtle) ── */}
      <section className="max-w-[1000px] mx-auto px-4 md:px-6 py-10 md:py-14 text-center">
        <h3 className="text-[18px] md:text-[22px] font-bold text-[var(--color-text)] tracking-tight">
          오늘, 첫 걸음을 내딛어볼까요?
        </h3>
        <p className="mt-2 text-[13px] md:text-[14px] text-[var(--color-text-muted)] max-w-[460px] mx-auto">
          가입하고 수강권을 등록하면 바로 원하는 세션을 예약할 수 있어요.
        </p>
        <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:gap-2.5 justify-center max-w-[320px] sm:max-w-none mx-auto">
          <Link
            href="/login?mode=register"
            className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-md text-[14px] font-semibold bg-[var(--color-primary)] text-white active:opacity-90 sm:hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            무료로 가입하기 <ArrowRight size={14} />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-md text-[14px] font-semibold border border-[var(--color-border)] text-[var(--color-text)] active:bg-[var(--color-bg-hover)] sm:hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            이미 회원이에요
          </Link>
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

function HeroStat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  return (
    <div>
      <p className="text-[22px] md:text-[28px] font-bold tabular-nums leading-none">
        {koNumber.format(value)}
        <span className="text-[13px] md:text-[15px] font-medium text-white/70 ml-0.5">{suffix}</span>
      </p>
      <p className="text-[11px] md:text-[12px] text-white/70 mt-1">{label}</p>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
  highlight,
}: {
  href: string;
  icon: typeof Calendar;
  title: string;
  description: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-2.5 sm:gap-3 p-3 sm:p-4 rounded-lg border transition-all active:scale-[0.98] ${
        highlight
          ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white sm:hover:opacity-95'
          : 'bg-white border-[var(--color-border)] sm:hover:border-[var(--color-primary-border)] sm:hover:shadow-sm'
      }`}
    >
      <div
        className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-md flex items-center justify-center ${
          highlight ? 'bg-white/15' : 'bg-[var(--color-primary-bg)]'
        }`}
      >
        <Icon size={16} className={highlight ? 'text-white' : 'text-[var(--color-primary)]'} />
      </div>
      <div className="min-w-0">
        <p className={`text-[13.5px] sm:text-[14px] font-semibold leading-tight ${highlight ? 'text-white' : 'text-[var(--color-text)]'}`}>
          {title}
        </p>
        <p className={`text-[11.5px] sm:text-[12px] mt-0.5 leading-snug ${highlight ? 'text-white/80' : 'text-[var(--color-text-muted)]'}`}>
          {description}
        </p>
      </div>
    </Link>
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
