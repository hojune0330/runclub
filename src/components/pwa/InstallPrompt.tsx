'use client';

import { useEffect, useState, useCallback } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────
// PWA InstallPrompt
//
// 목적: 회원/관리자가 "매번 링크 찾기" 마찰 없이 한 번 설치하면 홈 화면
// 아이콘으로 곧장 들어올 수 있도록 안내한다.
//
// 동작:
// - Android/Chrome/Edge: `beforeinstallprompt` 이벤트를 가로채 두었다가
//   사용자가 "홈 화면에 추가" 버튼을 누르면 `prompt()`를 호출.
// - iOS Safari: 위 이벤트가 없다. 대신 직접 안내 시트로 "공유 → 홈 화면에
//   추가" 단계 설명.
// - 이미 standalone 모드면 노출하지 않음.
// - 한 번 닫으면 30일간 다시 안 띄움 (localStorage).
// - 등장 시점은 라우트 진입 후 8초 (즉시 띄우면 거슬림).
// ─────────────────────────────────────────────────────────────────────

const DISMISS_KEY = 'runclub:pwa:dismissed-at';
const DISMISS_DAYS = 30;
const SHOW_DELAY_MS = 8_000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isIosSafari() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  // CriOS=Chrome on iOS, FxiOS=Firefox on iOS, EdgiOS=Edge on iOS — 이들은 Safari가 아니다.
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function wasRecentlyDismissed(): boolean {
  try {
    const at = localStorage.getItem(DISMISS_KEY);
    if (!at) return false;
    const dismissedAt = Number(at);
    if (!Number.isFinite(dismissedAt)) return false;
    const ageMs = Date.now() - dismissedAt;
    return ageMs < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function InstallPrompt({
  bottomOffsetClassName = 'bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-4',
}: {
  /** 모바일 앱 하단 탭바와 겹치지 않도록 호출부가 위치를 조정할 수 있는 모듈화 지점 */
  bottomOffsetClassName?: string;
}) {
  const [bipEvent, setBipEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [visible, setVisible] = useState(false);

  // 1) beforeinstallprompt 이벤트 캡처
  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setBipEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  // 2) 등장 지연: 사용자가 화면에 적응한 뒤 노출
  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    const timer = setTimeout(() => {
      // Android: bipEvent 있으면 무조건 노출.
      // iOS Safari: 이벤트가 없으니 자체 안내 시트로 노출.
      if (bipEvent || isIosSafari()) {
        setVisible(true);
      }
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, [bipEvent]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* swallow */ }
    setVisible(false);
    setShowIosSheet(false);
  }, []);

  const handleInstall = useCallback(async () => {
    if (bipEvent) {
      try {
        await bipEvent.prompt();
        const choice = await bipEvent.userChoice;
        if (choice.outcome === 'accepted') {
          // 설치 수락 시에도 dismiss 기록 (재노출 방지)
          dismiss();
        }
      } catch {
        // SDK가 prompt를 두 번째 호출에서 거부하면 silently 닫힘.
      }
      setBipEvent(null);
    } else if (isIosSafari()) {
      // iOS는 직접 prompt 불가 → 안내 시트 노출
      setShowIosSheet(true);
    }
  }, [bipEvent, dismiss]);

  if (!visible) return null;

  return (
    <>
      {/* 하단 배너 */}
      {!showIosSheet && (
        <div
          className={cn(
            'fixed left-3 right-3 z-40 max-w-[420px] mx-auto',
            bottomOffsetClassName,
            'bg-white border border-[var(--color-border)] rounded-md shadow-lg',
            'flex items-center gap-3 p-3 animate-slide-up'
          )}
          role="dialog"
          aria-label="앱 설치 안내"
        >
          <div className="shrink-0 w-9 h-9 rounded bg-[var(--color-primary-bg)] flex items-center justify-center">
            <Download size={16} className="text-[var(--color-primary)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text)] leading-tight">
              홈 화면에 추가하기
            </p>
            <p className="text-[11.5px] text-[var(--color-text-secondary)] mt-0.5 leading-tight">
              매번 링크 찾지 마세요. 한 번 설치하면 앱처럼 바로 열려요.
            </p>
          </div>
          <button
            onClick={handleInstall}
            className="shrink-0 h-8 px-3 text-[12px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)]"
          >
            설치
          </button>
          <button
            onClick={dismiss}
            aria-label="닫기"
            className="shrink-0 p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* iOS Safari용 안내 시트 */}
      {showIosSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center px-3 pb-[calc(16px+env(safe-area-inset-bottom))] sm:pb-3"
          onClick={dismiss}
        >
          <div
            className="bg-white border border-[var(--color-border)] rounded-md shadow-lg w-full max-w-[420px] p-4 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="text-[14.5px] font-semibold text-[var(--color-text)]">
                  홈 화면에 추가하기
                </p>
                <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
                  Safari 하단의 단계를 따라하면 앱처럼 바로 열려요.
                </p>
              </div>
              <button
                onClick={dismiss}
                aria-label="닫기"
                className="shrink-0 p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              >
                <X size={16} />
              </button>
            </div>
            <ol className="space-y-2 mt-3">
              <li className="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] inline-flex items-center justify-center text-[11.5px] font-semibold text-[var(--color-text-secondary)] tabular-nums">
                  1
                </span>
                <span className="inline-flex items-center gap-1">
                  하단의 <Share size={14} className="text-[var(--color-primary)]" /> 공유 버튼을 누르세요
                </span>
              </li>
              <li className="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] inline-flex items-center justify-center text-[11.5px] font-semibold text-[var(--color-text-secondary)] tabular-nums">
                  2
                </span>
                <span className="inline-flex items-center gap-1">
                  <Plus size={14} className="text-[var(--color-primary)]" /> 홈 화면에 추가를 선택하세요
                </span>
              </li>
              <li className="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] inline-flex items-center justify-center text-[11.5px] font-semibold text-[var(--color-text-secondary)] tabular-nums">
                  3
                </span>
                <span>오른쪽 위 추가를 누르면 끝!</span>
              </li>
            </ol>
            <button
              onClick={dismiss}
              className="mt-4 w-full h-10 text-[13px] font-semibold text-[var(--color-text)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)]"
            >
              알겠어요
            </button>
          </div>
        </div>
      )}
    </>
  );
}
