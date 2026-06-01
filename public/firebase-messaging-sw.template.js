/* Firebase Messaging Service Worker
 *
 * Firebase Cloud Messaging requires its own service worker at the
 * root scope to handle background push messages. This worker:
 * - Listens for `push` events from FCM
 * - Shows notifications with Korean text
 * - Handles notification clicks → opens the app
 */

// Import Firebase scripts (loaded from CDN inside service worker scope)
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Firebase config — these are public keys, safe to expose.
// Values are injected at build time from env vars (see next.config.ts).
const firebaseConfig = {
  apiKey: '__FIREBASE_API_KEY__',
  authDomain: '__FIREBASE_AUTH_DOMAIN__',
  projectId: '__FIREBASE_PROJECT_ID__',
  storageBucket: '__FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__FIREBASE_APP_ID__',
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Background push handler
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Received background message:', payload);

  const notification = payload.notification || {};
  const data = payload.data || {};

  const title = notification.title || data.title || '런클럽';
  const body = notification.body || data.body || '';
  const icon = '/icons/icon-192.png';
  const badge = '/icons/icon-maskable-192.png';

  const options = {
    body,
    icon,
    badge,
    tag: data.tag || 'runclub-notification',
    data: {
      url: data.url || '/app',
    },
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction === 'true',
    actions: data.url
      ? [{ action: 'open', title: '바로가기' }]
      : undefined,
  };

  self.registration.showNotification(title, options);
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/app';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If a window is already open, focus it
        for (const client of windowClients) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
