'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AuthProvider, useAuth } from '@/store/AuthContext';
import LoginPage from '@/components/auth/LoginPage';
import { api } from '@/lib/api';

function LoginGate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    api.seed().catch(() => {});
  }, []);

  // If already authenticated, send to the app root (which will route to the correct dashboard)
  useEffect(() => {
    if (!loading && user) {
      router.replace('/app');
    }
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-subtle)]">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[13px] text-[var(--color-text-muted)]">이동 중…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-subtle)]">
      <div className="max-w-[440px] mx-auto px-4 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[12.5px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <ArrowLeft size={13} /> 홈으로
        </Link>
      </div>
      <LoginPage />
    </div>
  );
}

export default function LoginRoute() {
  return (
    <AuthProvider>
      <LoginGate />
    </AuthProvider>
  );
}
