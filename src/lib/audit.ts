/**
 * PR-5: Admin audit log helper.
 *
 * Append-only ledger of administrator state changes. Every admin-mutating
 * route should call `logAdminAction()` *after* a successful DB write so
 * we capture "what really happened", not "what was attempted".
 *
 * Design principles:
 *  - Fire-and-forget. A log failure must NEVER break the originating action,
 *    so callers should `void logAdminAction(...)` and never `await` it.
 *  - Sensitive fields (password_hash, token_version, failed_login_count,
 *    locked_until, the temp password itself) MUST NOT be passed in
 *    before_value/after_value. The helper redacts a known list as a
 *    defence-in-depth measure.
 *  - Mirrored to Google Sheets `AdminLog` tab via the standard safeSync
 *    fire-and-forget path. Sheet rows are append-only (never updated).
 */

import { NextRequest } from 'next/server';
import { dbRun, dbGet } from './db';
import { safeSync } from './sheets';
import { mapAdminAuditRow } from './sheets-mappers';

/**
 * Action keys follow `<entity>.<verb>` for easy filtering. Keep the list
 * short and meaningful; new actions can be added freely as needed.
 */
export type AuditAction =
  | 'member.create'
  | 'member.update'
  | 'member.delete'
  | 'member.activate'
  | 'member.deactivate'
  | 'member.reset_password'
  | 'member.role_change'
  | 'session.create'
  | 'session.update'
  | 'session.delete'
  | 'pass.issue'
  | 'pass.pause'
  | 'pass.resume'
  | 'pass.refund'
  | 'pass.extend'
  | 'pass.adjust'
  | 'pass.payment'
  | 'pass.memo'
  | 'pass_product.create'
  | 'pass_product.update'
  | 'pass_product.delete'
  | 'pass_product.deactivate'
  | 'notice.create'
  | 'notice.delete'
  | 'reservation.update_status'
  | 'reservation.force_add'
  | 'reservation.bulk_noshow'
  | 'correction_request.approve'
  | 'correction_request.reject'
  | 'qr.generate'
  // PR-C1: 세션 태그 마스터 CRUD
  | 'tag_create'
  | 'tag_update'
  | 'tag_delete';

export interface AuditEntry {
  action: AuditAction;
  targetType?: 'member' | 'session' | 'pass' | 'pass_product' | 'notice' | 'reservation' | 'qr' | 'tag';
  targetId?: string | null;
  targetName?: string | null;
  summary?: string | null;
  beforeValue?: Record<string, any> | null;
  afterValue?: Record<string, any> | null;
}

// Defence-in-depth: redact any field that could leak credentials, tokens,
// or rate-limit state, even if a caller forgets.
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordHash',
  'temp_password',
  'tempPassword',
  'token',
  'token_version',
  'tokenVersion',
  'failed_login_count',
  'failedLoginCount',
  'locked_until',
  'lockedUntil',
  'jwt',
  'secret',
]);

function redact<T extends Record<string, any> | null | undefined>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const out: any = Array.isArray(value) ? [...value] : { ...value };
  for (const k of Object.keys(out)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = '[REDACTED]';
    } else if (out[k] && typeof out[k] === 'object') {
      out[k] = redact(out[k]);
    }
  }
  return out as T;
}

/**
 * Extract a best-effort client IP. Behind Render/Vercel/Cloudflare we trust
 * the standard forwarding headers. Fallback to "unknown" so the field is
 * never null in the log.
 */
function readClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

function readUserAgent(req: NextRequest): string {
  const ua = req.headers.get('user-agent') ?? '';
  // Bound to keep the column compact; full UA strings can be 500+ chars.
  return ua.slice(0, 256);
}

/**
 * Resolve the acting admin's display name. Cached on the log row so future
 * renames or deletions don't lose context.
 */
async function resolveAdminName(adminId: string): Promise<string | null> {
  try {
    const row = await dbGet<{ name: string }>(
      'SELECT name FROM members WHERE id = $1',
      [adminId]
    );
    return row?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist a single audit row. Returns silently on any failure — callers
 * MUST treat this as fire-and-forget (`void logAdminAction(...)`).
 */
export async function logAdminAction(
  req: NextRequest,
  adminId: string,
  entry: AuditEntry
): Promise<void> {
  try {
    const adminName = await resolveAdminName(adminId);
    const before = redact(entry.beforeValue);
    const after = redact(entry.afterValue);
    const ip = readClientIp(req);
    const ua = readUserAgent(req);
    const createdAt = new Date();

    await dbRun(
      `INSERT INTO admin_audit_log
         (admin_id, admin_name, action, target_type, target_id, target_name,
          summary, before_value, after_value, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)`,
      [
        adminId,
        adminName,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.targetName ?? null,
        entry.summary ?? null,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        ip,
        ua,
        createdAt,
      ]
    );

    // Sheet mirror — fire-and-forget. AdminLog tab is append-only.
    void safeSync(
      'adminLog',
      'append',
      mapAdminAuditRow({
        createdAt: createdAt.toISOString(),
        adminId,
        adminName,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        targetName: entry.targetName ?? null,
        summary: entry.summary ?? null,
        ipAddress: ip,
      })
    );
  } catch (err: any) {
    // Audit logging must never throw — only warn.
    console.warn('[audit] logAdminAction failed:', err?.message ?? err);
  }
}
