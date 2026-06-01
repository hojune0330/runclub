/* Firebase / Push Notification client helper
 *
 * Initializes Firebase Messaging on the client side, requests notification
 * permission, and sends the FCM token to our /api/push-subscribe endpoint
 * so the server can push notifications to this device.
 *
 * Usage:
 *   import { requestNotificationPermission } from '@/lib/firebase';
 *   const token = await requestNotificationPermission();
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  type Messaging,
} from 'firebase/messaging';

// These values are safe to expose — they are public Firebase keys.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
};

function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey) return null;
  if (getApps().length > 0) return getApps()[0];
  return initializeApp(firebaseConfig);
}

function getFcmMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    return getMessaging(app);
  } catch {
    return null;
  }
}

/**
 * Request notification permission and obtain an FCM token.
 * Returns null if permission denied, not supported, or Firebase not configured.
 */
export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const messaging = getFcmMessaging();
  if (!messaging) return null;

  try {
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
    });
    return token;
  } catch (err) {
    console.error('[firebase] getToken failed:', err);
    return null;
  }
}

/**
 * Listen for foreground push messages.
 * Calls `handler` with the payload when a message arrives while the app is open.
 */
export function listenForMessages(
  handler: (payload: any) => void
): () => void {
  const messaging = getFcmMessaging();
  if (!messaging) return () => {};

  const unsubscribe = onMessage(messaging, (payload) => {
    handler(payload);
  });

  return unsubscribe;
}

/**
 * Send the FCM token to our server for persistent push delivery.
 */
export async function registerPushToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
