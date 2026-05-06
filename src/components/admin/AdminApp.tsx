'use client';

import { useState, useEffect } from 'react';
import { LayoutDashboard, Calendar, Users, Ticket, Megaphone, BarChart3, QrCode, LogOut, ChevronDown, HelpCircle, Menu, X, Shield } from 'lucide-react';
import { useAuth } from '@/store/AuthContext';
import Dashboard from './Dashboard';
import SessionManagement from './SessionManagement';
import MemberManagement from './MemberManagement';
import PassManagement from './PassManagement';
import NoticeManagement from './NoticeManagement';
import Statistics from './Statistics';
import AdminQR from './AdminQR';
import AuditLog from './AuditLog';
import Help from './Help';
import { cn } from '@/lib/utils';

type AdminTab = 'dashboard' | 'sessions' | 'members' | 'passes' | 'notices' | 'stats' | 'qr' | 'audit' | 'help';

const navGroups: { label: string; items: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: '현황',
    items: [
      { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
      { id: 'stats', label: '통계', icon: BarChart3 },
    ],
  },
  {
    label: '운영',
    items: [
      { id: 'sessions', label: '세션 관리', icon: Calendar },
      { id: 'qr', label: '출석 QR', icon: QrCode },
      { id: 'notices', label: '공지사항', icon: Megaphone },
    ],
  },
  {
    label: '회원',
    items: [
      { id: 'members', label: '회원 관리', icon: Users },
      { id: 'passes', label: '수강권 관리', icon: Ticket },
    ],
  },
  {
    label: '보안',
    items: [
      { id: 'audit', label: '감사 로그', icon: Shield },
    ],
  },
  {
    label: '지원',
    items: [
      { id: 'help', label: '도움말', icon: HelpCircle },
    ],
  },
];

// Bottom navigation (mobile) — top 5 admin tabs
const bottomNav: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: '홈', icon: LayoutDashboard },
  { id: 'sessions', label: '세션', icon: Calendar },
  { id: 'qr', label: 'QR', icon: QrCode },
  { id: 'members', label: '회원', icon: Users },
  { id: 'stats', label: '통계', icon: BarChart3 },
];

export default function AdminApp() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Allow Dashboard widgets (and other children) to programmatically switch tabs
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as AdminTab;
      if (detail) {
        setActiveTab(detail);
        setDrawerOpen(false);
      }
    };
    window.addEventListener('admin:navigate', handler);
    return () => window.removeEventListener('admin:navigate', handler);
  }, []);

  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const selectTab = (t: AdminTab) => {
    setActiveTab(t);
    setDrawerOpen(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'sessions': return <SessionManagement />;
      case 'members': return <MemberManagement />;
      case 'passes': return <PassManagement />;
      case 'notices': return <NoticeManagement />;
      case 'stats': return <Statistics />;
      case 'qr': return <AdminQR />;
      case 'audit': return <AuditLog />;
      case 'help': return <Help />;
    }
  };

  const handleLogout = async () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      await logout();
    }
  };

  const currentLabel = navGroups.flatMap(g => g.items).find(i => i.id === activeTab)?.label ?? '';

  return (
    <div className="min-h-screen bg-[var(--color-bg-subtle)] md:flex">
      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden md:flex w-[236px] shrink-0 bg-white border-r border-[var(--color-border)] flex-col sticky top-0 h-screen">
        {/* Brand */}
        <div className="h-[56px] px-5 flex items-center border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[var(--color-primary)] flex items-center justify-center">
              <span className="text-white text-[12px] font-bold">R</span>
            </div>
            <span className="text-[15px] font-semibold text-[var(--color-text)]">런클럽 매니저</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {navGroups.map(group => (
            <div key={group.label} className="mb-4">
              <p className="text-[11px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider px-3 mb-1.5">
                {group.label}
              </p>
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
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
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User */}
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
              <p className="text-[11px] text-[var(--color-text-muted)]">관리자</p>
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

      {/* ─── Main ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-[52px] md:h-[56px] bg-white border-b border-[var(--color-border)] px-3 md:px-8 flex items-center justify-between sticky top-0 z-30">
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
              <span className="text-[14px] font-semibold text-[var(--color-text)]">{currentLabel || '관리자'}</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-[13px] text-[var(--color-text-muted)]">
            <span>관리자</span>
            <span>›</span>
            <span className="text-[var(--color-text)] font-medium">{currentLabel}</span>
          </div>

          <div className="text-[11px] md:text-[12px] text-[var(--color-text-muted)] tabular-nums">
            {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
          </div>
        </header>

        <main className="flex-1 px-3 md:px-8 py-4 md:py-6 pb-[80px] md:pb-6 animate-fade-in">
          {renderContent()}
        </main>

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

      {/* ─── Mobile Drawer ─── */}
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
                <span className="text-[14.5px] font-semibold text-[var(--color-text)]">런클럽 매니저</span>
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
                        {item.label}
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
                  <p className="text-[11.5px] text-[var(--color-text-muted)]">관리자</p>
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
