'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  requestNotificationPermission,
  registerPushToken,
  listenForMessages,
} from '@/lib/firebase';
import { Bell, BellOff, X } from 'lucide-react';

interface PushNotificationState {
  permission: NotificationPermission | 'unsupported';
  token: string | null;
  loading: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    permission: 'unsupported',
    token: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) {
      setState((s) => ({ ...s, permission: 'unsupported' }));
      return;
    }
    setState((s) => ({ ...s, permission: Notification.permission }));
  }, []);

  const subscribe = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const token = await requestNotificationPermission();
      if (!token) {
        const perm = Notification.permission;
        setState((s) => ({
          ...s,
          permission: perm,
          loading: false,
          error: perm === 'denied'
            ? '알림 권한이 차단되었습니다. 브라우저 설정에서 허용해주세요.'
            : '알림 구독에 실패했습니다.',
        }));
        return;
      }
      const ok = await registerPushToken(token);
      if (!ok) {
        setState((s) => ({ ...s, permission: 'granted', loading: false, error: '서버 등록에 실패했습니다.' }));
        return;
      }
      setState({ permission: 'granted', token, loading: false, error: null });
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err?.message || '알 수 없는 오류' }));
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!state.token) return;
    try {
      await fetch('/api/push-subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: state.token }),
      });
    } catch { /* swallow */ }
    setState((s) => ({ ...s, token: null }));
  }, [state.token]);

  useEffect(() => {
    if (state.permission !== 'granted') return;
    return listenForMessages((payload) => {
      if (Notification.permission === 'granted') {
        const n = payload.notification || {};
        new Notification(n.title || '런클럽', {
          body: n.body || '',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-maskable-192.png',
          data: { url: payload.data?.url || '/app' },
        });
      }
    });
  }, [state.permission]);

  return { state, subscribe, unsubscribe };
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    if (dismissed) {
      const ts = parseInt(dismissed, 10);
      if (Date.now() - ts < 3 * 24 * 60 * 60 * 1000) return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!show) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShow(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-banner-dismissed', String(Date.now()));
    setShow(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5 animate-in slide-in-from-bottom-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">런클럽 앱으로 설치하기</p>
          <p className="mt-0.5 text-xs text-gray-500">홈 화면에 추가하면 알림도 받고 더 빠르게 이용할 수 있어요</p>
          <div className="mt-3 flex gap-2">
            <button onClick={handleInstall} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">설치하기</button>
            <button onClick={handleDismiss} className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">다음에</button>
          </div>
        </div>
        <button onClick={handleDismiss} className="shrink-0 rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="닫기"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function PushNotificationToggle() {
  const { state, subscribe, unsubscribe } = usePushNotifications();

  if (state.permission === 'unsupported') return null;

  const isGranted = state.permission === 'granted' && state.token;

  return (
    <button
      onClick={isGranted ? unsubscribe : subscribe}
      disabled={state.loading}
      className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50"
      aria-label={isGranted ? '알림 끄기' : '알림 켜기'}
      title={isGranted ? '푸시 알림 끄기' : '푸시 알림 켜기'}
    >
      {state.loading ? (
        <span className="block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      ) : isGranted ? (
        <Bell className="h-5 w-5 text-blue-600" />
      ) : (
        <BellOff className="h-5 w-5" />
      )}
    </button>
  );
}
