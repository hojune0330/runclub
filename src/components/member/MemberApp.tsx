'use client';

import { useState } from 'react';
import { Calendar, ClipboardList, Ticket, QrCode, MoreHorizontal } from 'lucide-react';
import CalendarView from './CalendarView';
import MyReservations from './MyReservations';
import MyPasses from './MyPasses';
import QRCheckin from './QRCheckin';
import MoreMenu from './MoreMenu';
import { cn } from '@/lib/utils';

type Tab = 'calendar' | 'reservations' | 'passes' | 'qr' | 'more';

const tabs: { id: Tab; label: string; icon: typeof Calendar }[] = [
  { id: 'calendar', label: '일정', icon: Calendar },
  { id: 'reservations', label: '예약', icon: ClipboardList },
  { id: 'passes', label: '수강권', icon: Ticket },
  { id: 'qr', label: 'QR', icon: QrCode },
  { id: 'more', label: '더보기', icon: MoreHorizontal },
];

export default function MemberApp() {
  const [activeTab, setActiveTab] = useState<Tab>('calendar');

  const renderContent = () => {
    switch (activeTab) {
      case 'calendar': return <CalendarView />;
      case 'reservations': return <MyReservations />;
      case 'passes': return <MyPasses />;
      case 'qr': return <QRCheckin />;
      case 'more': return <MoreMenu />;
    }
  };

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-screen bg-white relative border-x border-gray-100 md:shadow-sm">
      {/* Content */}
      <main className="pb-[90px]">
        {renderContent()}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white/95 backdrop-blur-lg border-t border-gray-200 z-50 shadow-[0_-6px_18px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around h-[64px] px-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 w-16 py-1.5 rounded-xl",
                  "transition-all duration-200",
                  isActive ? "text-gray-900 bg-gray-50" : "text-gray-500 active:text-gray-700"
                )}
              >
                <div className={cn(
                  "relative",
                  isActive && "after:absolute after:-top-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-orange-400"
                )}>
                  <Icon size={24} strokeWidth={isActive ? 2 : 1.5} />
                </div>
                <span className={cn(
                  "text-[11px] leading-tight",
                  isActive ? "font-bold" : "font-medium"
                )}>{tab.label}</span>
              </button>
            );
          })}
        </div>
        {/* Safe area bottom */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
