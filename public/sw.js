/* 런클럽 매니저 — Service Worker
 *
 * 목적: 홈 화면에 추가된 PWA가 "앱처럼" 동작하도록 최소 캐싱과 오프라인
 * 폴백을 제공한다. next-pwa 같은 의존성을 끌어오지 않고 직접 작성.
 *
 * 전략 요약:
 * - install: 셸 자산(매니페스트, 아이콘, 오프라인 페이지) 미리 캐싱
 * - activate: 구버전 캐시 정리
 * - fetch:
 *     · API/HTML(navigation) → network-first, 실패 시 오프라인 셸
 *     · 정적 자산(아이콘, manifest) → cache-first
 *     · _next/static → cache-first (해시 포함이라 안전)
 * - push: Firebase Cloud Messaging 푸시 알림 처리
 * - notificationclick: 알림 클릭 시 해당 페이지로 이동
 *
 * 캐시 버전을 올리고 싶으면 CACHE_VERSION만 bump 하면 된다.
 */

const CACHE_VERSION = 'runclub-v2';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const PRECACHE = `${CACHE_VERSION}-precache`;

const PRECACHE_URLS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // POST/PUT/DELETE 등은 캐싱하지 않는다.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 동일 출처가 아닌 요청은 SW가 개입하지 않음 (예: Toss SDK, Sheets API).
  if (url.origin !== self.location.origin) return;

  // API 요청은 캐싱하지 않고 네트워크로만.
  if (url.pathname.startsWith('/api/')) return;

  // _next/static 정적 청크 — cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 아이콘/manifest 등 정적 자산 — cache-first.
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.ico' ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML 네비게이션 — network-first, 실패 시 캐시된 셸로 폴백.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 그 외는 SW 개입 없음 (브라우저 기본 동작).
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // 마지막 폴백: 메인 페이지 캐시 (네비게이션 fallback)
    const fallback = await caches.match('/');
    return fallback || Response.error();
  }
}

// ─── Push notification handlers ───
// Foreground push (Firebase onMessage callback fires in the main thread).
// Background push is handled by firebase-messaging-sw.js.
// This SW also gets push events from the server-side web-push API
// as a fallback for non-Firebase environments.

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data?.json();
  } catch {
    data = { title: '런클럽', body: event.data?.text() || '' };
  }

  if (!data) return;

  const title = data.title || '런클럽';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-maskable-192.png',
    tag: data.tag || 'runclub',
    data: {
      url: data.url || '/app',
    },
    vibrate: data.vibrate || [200, 100, 200],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/app';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
