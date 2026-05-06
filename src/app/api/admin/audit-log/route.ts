import { NextRequest, NextResponse } from 'next/server';
import { dbAll, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

/**
 * PR-5: Admin audit log read API.
 *
 *   GET /api/admin/audit-log
 *     ?limit=  (default 100, max 500)
 *     ?before= (ISO timestamp, returns rows strictly older than this — for pagination)
 *     ?adminId=     (filter by acting admin)
 *     ?targetType=  (filter by entity type: member|session|pass|notice|reservation|qr)
 *     ?targetId=    (filter by specific target id)
 *     ?action=      (filter by action key e.g. member.update)
 *
 *   Admin only. Returns rows newest-first.
 */

const ALLOWED_TARGET = new Set(['member', 'session', 'pass', 'notice', 'reservation', 'qr']);

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  await ensureSchema();

  const { searchParams } = new URL(req.url);

  // limit (1..500, default 100)
  let limit = parseInt(searchParams.get('limit') ?? '100', 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  if (limit > 500) limit = 500;

  const before = searchParams.get('before');
  const adminId = searchParams.get('adminId');
  const targetType = searchParams.get('targetType');
  const targetId = searchParams.get('targetId');
  const action = searchParams.get('action');

  // Build WHERE clause dynamically. Each filter is parameterised — never
  // string-interpolated — to prevent SQL injection.
  const where: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (before) {
    // Validate ISO; ignore silently on bad input rather than 400 (avoids
    // breaking pagination if a stale cursor is sent).
    const d = new Date(before);
    if (!Number.isNaN(d.getTime())) {
      where.push(`created_at < $${i++}`);
      params.push(d.toISOString());
    }
  }
  if (adminId && adminId.length <= 64) {
    where.push(`admin_id = $${i++}`);
    params.push(adminId);
  }
  if (targetType && ALLOWED_TARGET.has(targetType)) {
    where.push(`target_type = $${i++}`);
    params.push(targetType);
  }
  if (targetId && targetId.length <= 64) {
    where.push(`target_id = $${i++}`);
    params.push(targetId);
  }
  if (action && action.length <= 64) {
    where.push(`action = $${i++}`);
    params.push(action);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit);

  try {
    const rows = await dbAll<any>(
      `SELECT id, admin_id, admin_name, action, target_type, target_id,
              target_name, summary, before_value, after_value,
              ip_address, user_agent, created_at
         FROM admin_audit_log
         ${whereSql}
         ORDER BY created_at DESC, id DESC
         LIMIT $${i}`,
      params
    );

    return NextResponse.json({
      entries: rows.map((r) => ({
        id: r.id,
        adminId: r.admin_id,
        adminName: r.admin_name,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        targetName: r.target_name,
        summary: r.summary,
        beforeValue: r.before_value,
        afterValue: r.after_value,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        createdAt: r.created_at,
      })),
      nextBefore: rows.length === limit ? rows[rows.length - 1].created_at : null,
      limit,
    });
  } catch (error: any) {
    console.error('[audit-log GET] error:', error?.message ?? error);
    return NextResponse.json(
      { error: '감사 로그 조회 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
