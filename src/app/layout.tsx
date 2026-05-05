import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "런클럽 매니저",
  description: "런클럽 세션 스케줄, 회원 예약, 출석, 수강권 통합 관리 시스템",
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
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body>{children}</body>
    </html>
  );
}
