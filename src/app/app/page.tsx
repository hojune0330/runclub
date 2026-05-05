'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/store/AuthContext';
import { AppProvider, useApp } from '@/store/AppContext';
import MemberApp from '@/components/member/MemberApp';
import AdminApp from '@/components/admin/AdminApp';
import ForcePasswordChange from '@/components/auth/ForcePasswordChange';
import { api } from '@/lib/api';

function LoadingSpinner({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-subtle)]">
      <div className="text-center">
        <div className="w-6 h-6 border-2 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[13px] text-[var(--color-text-muted)]">{message}</p>
      </div>
    </div>
  );
}

function AppLoadingGate({ role }: { role: 'admin' | 'member' }) {
  const { loading } = useApp();
  if (loading) return <LoadingSpinner message="데이터 불러오는 중..." />;
  return (
    <div className="min-h-screen">
      {role === 'member' ? <MemberApp /> : <AdminApp />}
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    // Auto-seed on first visit only outside production. In production the
    // seed endpoint is gated by SEED_TOKEN/ALLOW_SEED — calling it from the
    // browser would just fail with 403 anyway, so don't bother.
    if (process.env.NODE_ENV !== 'production') {
      api.seed().catch(() => {});
    }
  }, []);

  // If unauthenticated, redirect to login
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return <LoadingSpinner message="로딩 중..." />;
  }

  // Block the entire app behind the password-change wall when required.
  if (user.mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return (
    <AppProvider>
      <AppLoadingGate role={user.role} />
    </AppProvider>
  );
}

export default function AppRoute() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
