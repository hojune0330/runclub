/* Server-side push notification sender
 *
 * Uses Firebase Admin SDK to send push notifications to subscribed devices.
 * Falls back gracefully if Firebase is not configured.
 *
 * The FIREBASE_ADMIN_CREDENTIAL env var should contain a base64-encoded
 * service account JSON key. If not set, push is disabled (no-op).
 */

import { dbAll } from '@/lib/db';

let _adminApp: any = null;
let _initAttempted = false;

async function getFirebaseAdmin() {
  if (_initAttempted) return _adminApp;

  _initAttempted = true;

  const credB64 = process.env.FIREBASE_ADMIN_CREDENTIAL;
  if (!credB64) {
    console.warn('[push] FIREBASE_ADMIN_CREDENTIAL not set — push notifications disabled');
    return null;
  }

  try {
    const admin = await import('firebase-admin');
    const credential = JSON.parse(Buffer.from(credB64, 'base64').toString('utf-8'));
    _adminApp = admin.initializeApp({
      credential: admin.credential.cert(credential),
      projectId: credential.project_id,
    });
    return _adminApp;
  } catch (err) {
    console.error('[push] Firebase Admin init failed:', err);
    return null;
  }
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
}

/**
 * Send push notification to all subscribed members.
 *
 * @param memberIds - Array of member IDs to send to (empty = all subscribers).
 * @param payload - Title, body, optional URL/deeplink.
 * @returns Number of tokens successfully sent.
 */
export async function sendPushToMembers(
  memberIds: string[],
  payload: PushPayload
): Promise<{ success: number; failed: number }> {
  const app = await getFirebaseAdmin();
  if (!app) return { success: 0, failed: 0 };

  try {
    // Fetch tokens
    let rows: Array<{ token: string }>;
    if (memberIds.length > 0) {
      const placeholders = memberIds.map((_, i) => `$${i + 1}`).join(',');
      rows = await dbAll<{ token: string }>(
        `SELECT DISTINCT token FROM push_subscriptions WHERE member_id IN (${placeholders})`,
        memberIds
      );
    } else {
      rows = await dbAll<{ token: string }>(
        `SELECT DISTINCT token FROM push_subscriptions`
      );
    }

    if (rows.length === 0) return { success: 0, failed: 0 };

    // Firebase messaging
    const message: any = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        url: payload.url || '/app',
        tag: payload.tag || 'runclub',
        requireInteraction: payload.requireInteraction ? 'true' : 'false',
      },
      tokens: rows.map((r) => r.token),
    };

    // Send multicast (up to 500 tokens per batch)
    const batchResponse = await app.messaging().sendEachForMulticast(message);

    let success = 0;
    let failed = 0;

    // Clean up invalid tokens
    const invalidTokens: string[] = [];
    batchResponse.responses.forEach((resp: any, idx: number) => {
      if (resp.success) {
        success++;
      } else {
        failed++;
        if (
          resp.error?.code === 'messaging/registration-token-not-registered' ||
          resp.error?.code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(rows[idx].token);
        }
      }
    });

    // Remove invalid tokens from DB
    if (invalidTokens.length > 0) {
      const placeholders = invalidTokens.map((_, i) => `$${i + 1}`).join(',');
      try {
        await dbAll(
          `DELETE FROM push_subscriptions WHERE token IN (${placeholders})`,
          invalidTokens
        );
      } catch { /* swallow */ }
    }

    return { success, failed };
  } catch (err) {
    console.error('[push] sendPushToMembers error:', err);
    return { success: 0, failed: 0 };
  }
}
