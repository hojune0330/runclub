import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { PwaInstallBanner } from "@/hooks/usePushNotifications";
import "./globals.css";

export const metadata: Metadata = {
  title: "런클럽 매니저",
  description: "런클럽 세션 스케줄, 회원 예약, 출석, 수강권 통합 관리 시스템",
  manifest: "/manifest.json",
  applicationName: "런클럽",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "런클럽",
  },
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: in-app browsers on iOS/Android (KakaoTalk,
    // Naver, Samsung Internet, etc.) inject extra attributes into <html>
    // *before* React hydrates — that is *not* a real mismatch in our markup,
    // but Next.js logs a noisy "tree hydrated but some attributes…" warning.
    // Suppressing it on <html> is the Next.js-recommended fix and only
    // silences attribute drift on this single element.
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        {children}
        {/* PWA 설치 유도 배너 — beforeinstallprompt 발생 시 하단에 표시 */}
        <PwaInstallBanner />
        {/*
          Service Worker 등록.
          - production 환경에서만 등록해 dev 시 캐시로 인한 혼란을 방지한다.
          - load 이벤트 후에 register 호출 → 초기 페인트를 방해하지 않는다.
          - strategy="afterInteractive" 로 hydration 이후에 실행.
        */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator && location.protocol === 'https:') {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function(err) {
                console.warn('[SW] register failed:', err);
              });
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
