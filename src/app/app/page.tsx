'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/store/AuthContext';
import { AppProvider, useApp } from '@/store/AppContext';
import MemberApp from '@/components/member/MemberApp';
import AdminApp from '@/components/admin/AdminApp';
import ForcePasswordChange from '@/components/auth/ForcePasswordChange';
import { ToastProvider, PageSkeleton } from '@/components/ui';
import InstallPrompt from '@/components/pwa/InstallPrompt';
import { api } from '@/lib/api';

// 로그인 직후 role을 모르는 짧은 구간에서 보여줄 중립 스켈레톤.
// member 변형이 admin 변형보다 헤더/카드 톤이 일반적이라 기본값으로 사용한다.
function NeutralPageSkeleton() {
  return <PageSkeleton variant="member" />;
}

function AppLoadingGate({ role }: { role: 'admin' | 'member' }) {
  const { loading } = useApp();
  // 첫 진입 시 단순 스피너 대신 실제 화면 모양과 닮은 스켈레톤을 보여줘
  // 체감 속도와 "곧 무엇이 뜰지" 명확성을 같이 끌어올린다.
  if (loading) return <PageSkeleton variant={role} />;
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
    // 인증 확인 단계에서도 페이지 스켈레톤을 보여주면 이후 AppLoadingGate
    // 단계의 스켈레톤과 자연스럽게 연결되어 "스피너 → 스켈레톤" 깜빡임이 없어진다.
    return <NeutralPageSkeleton />;
  }

  // Block the entire app behind the password-change wall when required.
  if (user.mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return (
    <AppProvider>
      <AppLoadingGate role={user.role} />
      {/*
        PWA 설치 프롬프트는 로그인 후 앱 진입 시점에만 띄운다.
        - 로그인 전 랜딩에서 설치 권유는 친밀도/이탈률 측면에서 비효율.
        - 8초 지연 + 30일 dismiss 메모리는 컴포넌트 내부에서 처리.
      */}
      <InstallPrompt />
    </AppProvider>
  );
}

export default function AppRoute() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}
