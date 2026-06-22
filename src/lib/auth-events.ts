import { NextRequest } from 'next/server';
import { dbRun } from './db';

export type AuthEventType = 'login' | 'password_reset' | 'session';

export type AuthEventReason =
  | 'success'
  | 'invalid_phone'
  | 'no_account'
  | 'inactive'
  | 'locked'
  | 'wrong_password'
  | 'rate_limited'
  | 'server_error'
  | 'reset_requested'
  | 'reset_name_mismatch'
  | 'reset_inactive'
  | 'reset_no_account';

interface RecordAuthEventParams {
  req?: NextRequest;
  eventType: AuthEventType;
  reason: AuthEventReason;
  memberId?: string | null;
  phone?: string | null;
  metadata?: Record<string, unknown>;
}

export function maskAuthPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return '***';
  if (digits.length === 11) return `${digits.slice(0, 3)}-****-${digits.slice(7)}`;
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

function clientIp(req: NextRequest | undefined): string | null {
  if (!req) return null;
  const trustProxy = process.env.NODE_ENV !== 'production' || process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    const real = req.headers.get('x-real-ip');
    if (real) return real.trim();
  }
  return (req as unknown as { ip?: string }).ip ?? 'unknown';
}

function userAgent(req: NextRequest | undefined): string | null {
  const ua = req?.headers.get('user-agent');
  return ua ? ua.slice(0, 240) : null;
}

/**
 * Append a safe, admin-diagnostic auth event. This helper never throws: login
 * and reset flows must not fail just because the diagnostic ledger is down.
 */
export async function recordAuthEvent(params: RecordAuthEventParams): Promise<void> {
  try {
    const phone = params.phone ?? null;
    await dbRun(
      `INSERT INTO auth_events
         (member_id, phone, phone_mask, event_type, reason, ip_address, user_agent, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW())`,
      [
        params.memberId ?? null,
        phone,
        maskAuthPhone(phone),
        params.eventType,
        params.reason,
        clientIp(params.req),
        userAgent(params.req),
        JSON.stringify(params.metadata ?? {}),
      ]
    );
  } catch (error: unknown) {
    console.warn('[auth-events] record failed:', error instanceof Error ? error.message : error);
  }
}
