'use client';

import { useState } from 'react';
import { LayoutDashboard, Calendar, Users, Ticket, Megaphone, BarChart3, QrCode } from 'lucide-react';
import Dashboard from './Dashboard';
import SessionManagement from './SessionManagement';
import MemberManagement from './MemberManagement';
import PassManagement from './PassManagement';
import NoticeManagement from './NoticeManagement';
import Statistics from './Statistics';
import AdminQR from './AdminQR';
import { cn } from '@/lib/utils';

type AdminTab = 'dashboard' | 'sessions' | 'members' | 'passes' | 'notices' | 'stats' | 'qr';

const navItems: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'sessions', label: '세션 관리', icon: Calendar },
  { id: 'members', label: '회원 관리', icon: Users },
  { id: 'passes', label: '수강권', icon: Ticket },
  { id: 'notices', label: '공지', icon: Megaphone },
  { id: 'stats', label: '통계', icon: BarChart3 },
  { id: 'qr', label: 'QR 생성', icon: QrCode },
];

export default function AdminApp() {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'sessions': return <SessionManagement />;
      case 'members': return <MemberManagement />;
      case 'passes': return <PassManagement />;
      case 'notices': return <NoticeManagement />;
      case 'stats': return <Statistics />;
      case 'qr': return <AdminQR />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/80">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200/80 sticky top-11 z-40">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center">
                <span className="text-[14px] font-extrabold text-white">RC</span>
              </div>
              <div>
                <h1 className="text-[15px] sm:text-[16px] font-extrabold text-gray-900 tracking-tight leading-none">런클럽 관리자</h1>
                <p className="text-[10px] sm:text-[11px] text-gray-500 font-medium">Run Club Manager</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right mr-1 sm:mr-2 hidden sm:block">
                <p className="text-[13px] font-bold text-gray-700">장호준 코치</p>
                <p className="text-[11px] text-gray-400">관리자</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                <span className="text-[14px] font-bold text-white">장</span>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <nav className="flex gap-0.5 -mb-px overflow-x-auto scrollbar-none">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 text-[12px] sm:text-[13px] border-b-2 transition-all whitespace-nowrap font-semibold",
                    isActive
                      ? "border-gray-900 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
                  )}
                >
                  <Icon size={16} strokeWidth={isActive ? 2.2 : 1.5} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 animate-fade-in">
        {renderContent()}
      </main>
    </div>
  );
}
