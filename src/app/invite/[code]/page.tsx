'use client';

import { use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Sparkles, ArrowRight, Calendar, Users } from 'lucide-react';

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('s');

  return (
    <div className="min-h-screen bg-[var(--color-bg-subtle)] flex flex-col">
      <header className="h-[52px] md:h-[56px] px-4 md:px-6 flex items-center border-b border-[var(--color-border)] bg-white">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[var(--color-primary)] flex items-center justify-center">
            <span className="text-white text-[12px] font-bold">R</span>
          </div>
          <span className="text-[14.5px] md:text-[15px] font-semibold text-[var(--color-text)]">런클럽</span>
        </Link>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-6 md:py-10">
        <div className="max-w-[440px] w-full bg-white border border-[var(--color-border)] rounded-lg shadow-sm overflow-hidden">
          {/* Gradient header */}
          <div className="bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-hover)] p-5 md:p-6 text-white text-center">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/15 flex items-center justify-center mx-auto mb-2.5 md:mb-3">
              <Sparkles size={22} />
            </div>
            <h1 className="text-[16px] md:text-[18px] font-semibold">런클럽에 초대되었어요!</h1>
            <p className="text-[12.5px] md:text-[13px] text-white/85 mt-1">
              함께 달릴 준비 되셨나요?
            </p>
          </div>

          <div className="p-5 md:p-6 space-y-4 md:space-y-5">
            {/* Invite code */}
            <div className="text-center">
              <p className="text-[11.5px] md:text-[12px] text-[var(--color-text-muted)] mb-1">초대 코드</p>
              <code className="text-[20px] md:text-[22px] font-mono font-bold tracking-[0.2em] text-[var(--color-text)]">
                {code}
              </code>
            </div>

            {sessionId && (
              <div className="bg-[var(--color-primary-bg)] border border-[var(--color-primary-border)] rounded-md p-3 flex items-start gap-2">
                <Calendar size={14} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
                <div className="text-[12px] md:text-[12.5px] text-[var(--color-primary)] leading-relaxed">
                  특정 세션 참여 링크예요. 로그인 후 바로 예약 페이지로 이동합니다.
                </div>
              </div>
            )}

            {/* Benefits */}
            <ul className="space-y-2 md:space-y-2.5">
              <BenefitItem label="매주 열리는 EBW·슬로우런·마라톤 세션 예약" />
              <BenefitItem label="QR 한 번으로 간편 출석 체크" />
              <BenefitItem label="개인 출석 통계와 연속 출석 기록" />
              <BenefitItem label="친구와 함께 달리는 러닝 크루" />
            </ul>

            {/* CTA */}
            <div className="space-y-2">
              <Link
                href={`/login?mode=register&ref=${code}${sessionId ? `&s=${sessionId}` : ''}`}
                className="w-full inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-md text-[14px] font-semibold bg-[var(--color-primary)] active:opacity-90 sm:hover:bg-[var(--color-primary-hover)] text-white transition-colors"
              >
                회원가입하고 시작하기 <ArrowRight size={14} />
              </Link>
              <Link
                href={`/login?ref=${code}${sessionId ? `&s=${sessionId}` : ''}`}
                className="w-full inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-md text-[13px] font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] active:bg-[var(--color-bg-hover)] sm:hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                이미 계정이 있어요, 로그인
              </Link>
            </div>
          </div>

          <div className="px-5 md:px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-[11px] md:text-[11.5px] text-[var(--color-text-muted)] text-center flex items-center justify-center gap-1">
            <Users size={11} />
            초대한 친구가 런클럽에서 기다리고 있어요
          </div>
        </div>
      </main>
    </div>
  );
}

function BenefitItem({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2 text-[12.5px] md:text-[13px] text-[var(--color-text-secondary)] leading-snug">
      <span className="w-4 h-4 rounded-full bg-[var(--color-success-bg)] text-[var(--color-success)] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
        ✓
      </span>
      {label}
    </li>
  );
}
