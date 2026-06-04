'use client';

import { useState, useEffect } from 'react';
import { Calendar, ClipboardList, Ticket, QrCode, User, LogOut, Bell, Megaphone, History, ChevronDown, HelpCircle, LayoutDashboard, Menu, X, Home, ShoppingBag, Info, Target } from 'lucide-react';
import Overview from './Overview';
import CalendarView from './CalendarView';
import MyReservations from './MyReservations';
import MyPasses from './MyPasses';
import PassCatalog from './PassCatalog';
import QRCheckin from './QRCheckin';
import Notices from './Notices';
import AttendanceHistory from './AttendanceHistory';
import Profile from './Profile';
import Help from './Help';
import ClubHub from './ClubHub';
import ClubHome from './ClubHome';
import SlowRunMembership from './SlowRunMembership';
import MyClasses from './MyClasses';
import { useAuth } from '@/store/AuthContext';
import { useApp } from '@/store/AppContext';
import { cn } from '@/lib/utils';
import BusinessFooter from '@/components/public/BusinessFooter';
import type { SessionType } from '@/types';

type Tab = 'home' | 'overview' | 'calendar' | 'reservations' | 'passes' | 'catalog' | 'attendance' | 'qr' | 'notices' | 'profile' | 'help' | 'membership' | 'classes';

const navGroups: { label: string; items: { id: Tab; label: string; icon: typeof Calendar }[] }[] = [
  {
    label: '홈',
    items: [
      { id: 'home', label: '홈', icon: Home },
      { id: 'overview', label: '내 활동 통계', icon: LayoutDashboard },
    ],
  },
  {
    label: '러닝 참여',
    items: [
      { id: 'calendar', label: '세션 일정·예약', icon: Calendar },
      { id: 'reservations', label: '내 예약', icon: ClipboardList },
      { id: 'qr', label: 'QR 체크인', icon: QrCode },
      { id: 'attendance', label: '출석 이력', icon: History },
    ],
  },
  {
    label: '내 클래스',
    items: [
      { id: 'classes', label: '코칭 클래스·팀', icon: Target },
    ],
  },
  {
    label: '수강권 · 멤버십',
    items: [
      { id: 'membership', label: '슬로우롱런 소개', icon: Info },
      { id: 'passes', label: '내 수강권', icon: Ticket },
      { id: 'catalog', label: '수강권 구매', icon: ShoppingBag },
    ],
  },
  {
    label: '소식',
    items: [
      { id: 'notices', label: '공지사항', icon: Megaphone },
    ],
  },
  {
    label: '내 정보',
    items: [
      { id: 'profile', label: '프로필', icon: User },
      { id: 'help', label: '도움말', icon: HelpCircle },
    ],
  },
];

// Bottom navigation (mobile) — 5 most important tabs
const bottomNav: { id: Tab; label: string; icon: typeof Calendar }[] = [
  { id: 'home', label: '내 클럽', icon: Home },
  { id: 'calendar', label: '일정', icon: Calendar },
  { id: 'qr', label: 'QR', icon: QrCode },
  { id: 'passes', label: '수강권', icon: Ticket },
  { id: 'profile', label: '내 정보', icon: User },
];

export default function MemberApp() {
  const { user, logout } = useAuth();
  const { notices } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [selectedClub, setSelectedClub] = useState<SessionType | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const unreadNotices = notices.filter(n => !n.isRead).length;

  // Allow child components (e.g. empty-state CTAs) to navigate programmatically
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Tab;
      if (detail) {
        setActiveTab(detail);
        setDrawerOpen(false);
        // 전역 탭 이동 시 클럽 상세 상태는 초기화
        setSelectedClub(null);
      }
    };
    window.addEventListener('member:navigate', handler);
    return () => window.removeEventListener('member:navigate', handler);
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const selectTab = (t: Tab) => {
    setActiveTab(t);
    setDrawerOpen(false);
    if (t !== 'home') setSelectedClub(null);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        if (selectedClub) {
          return (
            <ClubHome
              type={selectedClub}
              onBack={() => setSelectedClub(null)}
              onGoToQR={() => { setSelectedClub(null); setActiveTab('qr'); }}
              onGoToAttendance={() => { setSelectedClub(null); setActiveTab('attendance'); }}
            />
          );
        }
        return (
          <ClubHub
            onSelectClub={type => setSelectedClub(type)}
            onGoToDashboard={() => setActiveTab('overview')}
          />
        );
      case 'overview': return <Overview />;
      case 'calendar': return <CalendarView />;
      case 'reservations': return <MyReservations />;
      case 'passes': return <MyPasses />;
      case 'catalog': return <PassCatalog />;
      case 'attendance': return <AttendanceHistory />;
      case 'qr': return <QRCheckin />;
      case 'notices': return <Notices />;
      case 'profile': return <Profile />;
      case 'help': return <Help />;
      case 'membership': return <SlowRunMembership />;
      case 'classes': return <MyClasses />;
    }
  };

  const currentLabel = navGroups.flatMap(g => g.items).find(i => i.id === activeTab)?.label ?? '';

  const handleLogout = async () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      await logout();
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-subtle)] md:flex">
      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden md:flex w-[236px] shrink-0 bg-white border-r border-[var(--color-border)] flex-col sticky top-0 h-screen">
        <div className="h-[56px] px-5 flex items-center border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[var(--color-primary)] flex items-center justify-center">
              <span className="text-white text-[12px] font-bold">R</span>
            </div>
            <span className="text-[15px] font-semibold text-[var(--color-text)]">런클럽</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {navGroups.map(group => (
            <div key={group.label} className="mb-4">
              <p className="text-[11px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider px-3 mb-1.5">
                {group.label}
              </p>
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const badge = item.id === 'notices' && unreadNotices > 0 ? unreadNotices : null;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] transition-colors",
                      isActive
                        ? "bg-[var(--color-primary-bg)] text-[var(--color-primary)] font-medium"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
                    )}
                  >
                    <Icon size={15} strokeWidth={isActive ? 2 : 1.6} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {badge && (
                      <span className="bg-[var(--color-danger)] text-white text-[10px] tabular-nums min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--color-border)] p-2 relative">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0">
              <span className="text-white text-[12px] font-medium">{user?.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-medium text-[var(--color-text)] truncate">{user?.name}</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">회원</p>
            </div>
            <ChevronDown size={14} className={cn("text-[var(--color-text-muted)] transition-transform", userMenuOpen && "rotate-180")} />
          </button>
          {userMenuOpen && (
            <div className="absolute bottom-full left-2 right-2 mb-1 bg-white border border-[var(--color-border)] rounded shadow-md py-1 animate-slide-up">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)] transition-colors"
              >
                <LogOut size={13} />
                로그아웃
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ─── Main column ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — mobile & desktop */}
        <header className="h-[52px] md:h-[56px] bg-white border-b border-[var(--color-border)] px-3 md:px-8 flex items-center justify-between sticky top-0 z-30">
          {/* Mobile: menu button + brand */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="메뉴 열기"
              className="w-9 h-9 rounded-md inline-flex items-center justify-center text-[var(--color-text-secondary)] active:bg-[var(--color-bg-hover)]"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded bg-[var(--color-primary)] flex items-center justify-center">
                <span className="text-white text-[11px] font-bold">R</span>
              </div>
              <span className="text-[14px] font-semibold text-[var(--color-text)]">{currentLabel || '런클럽'}</span>
            </div>
          </div>

          {/* Desktop breadcrumb */}
          <div className="hidden md:flex items-center gap-2 text-[13px] text-[var(--color-text-muted)]">
            <span>회원</span>
            <span>›</span>
            <span className="text-[var(--color-text)] font-medium">{currentLabel}</span>
          </div>

          <div className="flex items-center gap-1.5 md:gap-3">
            <button
              onClick={() => setActiveTab('notices')}
              className="relative w-9 h-9 md:w-auto md:h-auto md:p-1.5 text-[var(--color-text-muted)] active:bg-[var(--color-bg-hover)] md:hover:text-[var(--color-text)] rounded md:hover:bg-[var(--color-bg-hover)] transition-colors inline-flex items-center justify-center"
              aria-label="공지사항"
              title="공지사항"
            >
              <Bell size={17} />
              {unreadNotices > 0 && (
                <span className="absolute -top-0.5 -right-0.5 md:-top-1 md:-right-1 bg-[var(--color-danger)] text-white text-[10px] tabular-nums min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full font-medium">
                  {unreadNotices > 9 ? '9+' : unreadNotices}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 px-3 md:px-8 py-4 md:py-6 pb-[80px] md:pb-6 animate-fade-in">
          {renderContent()}
        </main>

        {/* 전자상거래법 제13조·시행령 제10조 — 사업자 정보 의무 표기 (회원 앱 공통 푸터) */}
        <div className="hidden md:block">
          <BusinessFooter variant="compact" />
        </div>
        {/* 모바일은 하단 탭바와 겹치지 않도록 안전 여백 + 별도 출력 */}
        <div className="md:hidden pb-[64px]">
          <BusinessFooter variant="compact" />
        </div>

        {/* ─── Mobile Bottom Nav ─── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[var(--color-border)] grid grid-cols-5 h-[64px] pb-[env(safe-area-inset-bottom)]">
          {bottomNav.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => selectTab(item.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 transition-colors",
                  isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)] active:text-[var(--color-text)]"
                )}
                aria-label={item.label}
              >
                <Icon size={19} strokeWidth={isActive ? 2.2 : 1.7} />
                <span className="text-[10.5px] font-medium leading-none">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ─── Mobile Drawer (full menu) ─── */}
      {drawerOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="md:hidden fixed top-0 left-0 bottom-0 w-[280px] max-w-[82vw] bg-white z-50 flex flex-col shadow-xl animate-slide-up">
            <div className="h-[52px] px-4 flex items-center justify-between border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--color-primary)] flex items-center justify-center">
                  <span className="text-white text-[11px] font-bold">R</span>
                </div>
                <span className="text-[14.5px] font-semibold text-[var(--color-text)]">런클럽</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-9 h-9 rounded-md inline-flex items-center justify-center text-[var(--color-text-muted)] active:bg-[var(--color-bg-hover)]"
                aria-label="메뉴 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-2 px-2">
              {navGroups.map(group => (
                <div key={group.label} className="mb-3">
                  <p className="text-[10.5px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider px-3 mb-1">
                    {group.label}
                  </p>
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    const badge = item.id === 'notices' && unreadNotices > 0 ? unreadNotices : null;
                    return (
                      <button
                        key={item.id}
                        onClick={() => selectTab(item.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 h-11 rounded text-[14px] transition-colors",
                          isActive
                            ? "bg-[var(--color-primary-bg)] text-[var(--color-primary)] font-semibold"
                            : "text-[var(--color-text-secondary)] active:bg-[var(--color-bg-hover)]"
                        )}
                      >
                        <Icon size={16} strokeWidth={isActive ? 2 : 1.6} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {badge && (
                          <span className="bg-[var(--color-danger)] text-white text-[10px] tabular-nums min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full">
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="border-t border-[var(--color-border)] p-3">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <span className="text-white text-[13px] font-medium">{user?.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-[var(--color-text)] truncate">{user?.name}</p>
                  <p className="text-[11.5px] text-[var(--color-text-muted)]">회원</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full h-10 rounded-md border border-[var(--color-border)] text-[13px] text-[var(--color-text-secondary)] active:bg-[var(--color-bg-hover)] active:text-[var(--color-danger)] inline-flex items-center justify-center gap-1.5"
              >
                <LogOut size={13} />
                로그아웃
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
