'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Menu, X, LogIn, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import BusinessFooter from './BusinessFooter';

const NAV = [
  { href: '/', label: '홈' },
  { href: '/sessions', label: '세션 일정' },
  { href: '/training', label: '트레이닝 허브' },
  { href: '/about', label: '런클럽 소개' },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mobilePrimaryCta = pathname === '/' || pathname === '/training'
    ? { href: '/login?mode=register', label: '시작하기', icon: ArrowRight }
    : { href: '/login', label: '로그인', icon: LogIn };
  const MobilePrimaryIcon = mobilePrimaryCta.icon;

  // Lock scroll when drawer is open (mobile)
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--color-border)]">
        <div className="max-w-[1200px] mx-auto h-[52px] md:h-[60px] px-3 md:px-6 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-md bg-[var(--color-primary)] flex items-center justify-center">
              <span className="text-white text-[13px] font-bold">R</span>
            </div>
            <span className="text-[15px] md:text-[15.5px] font-semibold text-[var(--color-text)]">런클럽</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(item => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'px-3 py-1.5 rounded text-[13.5px] transition-colors',
                    active
                      ? 'text-[var(--color-primary)] font-medium bg-[var(--color-primary-bg)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Desktop auth buttons */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/login"
              className="px-3 py-1.5 rounded text-[13.5px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition-colors"
            >
              로그인
            </Link>
            <Link
              href="/login?mode=register"
              className="px-3.5 py-1.5 rounded-md text-[13.5px] font-medium bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              가입하기
            </Link>
          </div>

          {/* Mobile: login shortcut + menu button */}
          <div className="flex md:hidden items-center gap-1">
            <Link
              href={mobilePrimaryCta.href}
              aria-label={mobilePrimaryCta.label}
              className="h-10 px-3 rounded-md text-[13px] font-semibold bg-[var(--color-primary)] text-white inline-flex items-center gap-1 active:opacity-90"
            >
              <MobilePrimaryIcon size={13} /> {mobilePrimaryCta.label}
            </Link>
            <button
              onClick={() => setOpen(v => !v)}
              className="h-10 w-10 rounded-md hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] inline-flex items-center justify-center"
              aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
              aria-expanded={open}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile drawer menu */}
        {open && (
          <>
            <div
              className="fixed inset-0 top-[52px] bg-black/30 md:hidden"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div className="fixed top-[52px] left-0 right-0 md:hidden border-t border-[var(--color-border)] bg-white shadow-lg animate-slide-down z-40">
              <nav className="px-3 py-2 flex flex-col gap-0.5">
                {NAV.map(item => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'px-3 h-11 rounded-md text-[14px] inline-flex items-center',
                        active
                          ? 'text-[var(--color-primary)] font-semibold bg-[var(--color-primary-bg)]'
                          : 'text-[var(--color-text)] active:bg-[var(--color-bg-hover)]'
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                <div className="border-t border-[var(--color-border)] mt-2 pt-2 flex gap-2">
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex-1 text-center h-11 rounded-md text-[13.5px] font-medium border border-[var(--color-border)] text-[var(--color-text)] inline-flex items-center justify-center active:bg-[var(--color-bg-hover)]"
                  >
                    로그인
                  </Link>
                  <Link
                    href="/login?mode=register"
                    onClick={() => setOpen(false)}
                    className="flex-1 text-center h-11 rounded-md text-[13.5px] font-semibold bg-[var(--color-primary)] text-white inline-flex items-center justify-center active:opacity-90"
                  >
                    가입하기
                  </Link>
                </div>
              </nav>
            </div>
          </>
        )}
      </header>

      <main className="flex-1">{children}</main>

      {/*
        공개 페이지 푸터.
        - 이전에 있던 "브랜드/바로가기/고객문의" 3-column 블록은 BusinessFooter와
          전화/이메일이 중복되고, 브랜드 카피·바로가기는 헤더 NAV에 이미 존재해
          정보 중복이었다. 토스 톤 정리(2025-05) 일환으로 제거.
        - 사업자 정보(BusinessFooter)는 전자상거래법 제13조에 따른 법적 의무라
          그대로 유지. 단 BusinessFooter 내부에서도 의무 항목만 남기도록 정리.
      */}
      <BusinessFooter variant="full" />
    </div>
  );
}
