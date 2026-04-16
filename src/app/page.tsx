'use client';

import { useState } from 'react';
import MemberApp from '@/components/member/MemberApp';
import AdminApp from '@/components/admin/AdminApp';
import { UserRole } from '@/types';

export default function Home() {
  const [role, setRole] = useState<UserRole>('member');

  return (
    <div className="min-h-screen bg-white">
      {/* Role Switcher — demo only */}
      <div className="fixed top-0 left-0 right-0 z-[100] bg-white/95 backdrop-blur-md border-b border-gray-200/80">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-5 h-11 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-soft" />
            <span className="text-[12px] tracking-wide text-gray-500 font-medium">DEMO</span>
          </div>
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-full p-[3px]">
            <button
              onClick={() => setRole('member')}
              className={`text-[12px] px-4 py-1.5 rounded-full font-medium transition-all ${
                role === 'member'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              회원 앱
            </button>
            <button
              onClick={() => setRole('admin')}
              className={`text-[12px] px-4 py-1.5 rounded-full font-medium transition-all ${
                role === 'admin'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              관리자
            </button>
          </div>
        </div>
      </div>

      <div className="pt-11">
        {role === 'member' ? <MemberApp /> : <AdminApp />}
      </div>
    </div>
  );
}
