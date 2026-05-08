/**
 * PR-C1: Session tag master CRUD.
 *
 *   GET    /api/tags                  - 모든 태그 목록 (회원·어드민 모두 허용)
 *   POST   /api/tags                  - 신규 태그 생성 (어드민만)
 *   PUT    /api/tags                  - 태그 수정 (어드민만)
 *   DELETE /api/tags?id=xxx           - 태그 삭제 (어드민만, 사용 중이면 차단)
 *
 * 응답 포맷은 다른 API 와 동일하게 camelCase 로 정규화한다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/audit';
import { validateTagId, OMNI_TAG } from '@/lib/tags';

interface TagRow {
  id: string;
  label: string;
  color: string | null;
  icon: string | null;
  display_order: number;
  is_active: boolean;
  updated_at: string | null;
}

function rowToDto(r: TagRow) {
  return {
    id: r.id,
    label: r.label,
    color: r.color ?? undefined,
    icon: r.icon ?? undefined,
    displayOrder: r.display_order,
    isActive: r.is_active,
    updatedAt: r.updated_at ?? undefined,
  };
}

// ─────────────────────────────────────────── GET ───────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === '1';
  const sql = includeInactive
    ? `SELECT id, label, color, icon, display_order, is_active, updated_at
         FROM session_tags
        ORDER BY display_order ASC, label ASC`
    : `SELECT id, label, color, icon, display_order, is_active, updated_at
         FROM session_tags
        WHERE is_active = TRUE
        ORDER BY display_order ASC, label ASC`;
  const rows = await dbAll<TagRow>(sql);
  return NextResponse.json({ tags: rows.map(rowToDto) });
}

// ─────────────────────────────────────────── POST ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();
  await ensureSchema();

  const rl = rateLimit(req, 'tags-write', { windowMs: 60_000, max: 30 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    const body = await req.json();
    const id = String(body?.id ?? '').trim().toLowerCase();
    const label = String(body?.label ?? '').trim();
    if (!label || label.length > 32) {
      return NextResponse.json({ error: '라벨은 1~32자여야 합니다' }, { status: 400 });
    }
    const v = validateTagId(id);
    if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });

    const exists = await dbGet('SELECT id FROM session_tags WHERE id = $1', [id]);
    if (exists) {
      return NextResponse.json({ error: '이미 존재하는 태그 id 입니다' }, { status: 409 });
    }

    const color = body?.color ? String(body.color).slice(0, 16) : null;
    const icon = body?.icon ? String(body.icon).slice(0, 64) : null;
    const displayOrder = Number.isFinite(Number(body?.displayOrder))
      ? Math.max(0, Math.min(9999, Math.floor(Number(body.displayOrder))))
      : 100;

    await dbRun(
      `INSERT INTO session_tags (id, label, color, icon, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [id, label, color, icon, displayOrder]
    );

    void logAdminAction(req, auth.memberId, {
      action: 'tag_create',
      targetType: 'tag',
      targetId: id,
      targetName: label,
      summary: `태그 생성: ${label} (${id})`,
      afterValue: { id, label, color, icon, displayOrder },
    });

    const row = await dbGet<TagRow>(
      `SELECT id, label, color, icon, display_order, is_active, updated_at
         FROM session_tags WHERE id = $1`,
      [id]
    );
    return NextResponse.json({ tag: row ? rowToDto(row) : null }, { status: 201 });
  } catch (err: any) {
    console.error('[tags POST] error:', err);
    return NextResponse.json({ error: '태그 생성 중 오류가 발생했습니다' }, { status: 500 });
  }
}

// ─────────────────────────────────────────── PUT ───────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();
  await ensureSchema();

  try {
    const body = await req.json();
    const id = String(body?.id ?? '').trim().toLowerCase();
    if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });

    const before = await dbGet<TagRow>(
      `SELECT id, label, color, icon, display_order, is_active, updated_at
         FROM session_tags WHERE id = $1`,
      [id]
    );
    if (!before) return NextResponse.json({ error: '태그를 찾을 수 없습니다' }, { status: 404 });

    const sets: { col: string; val: any }[] = [];
    if (typeof body.label === 'string') {
      const lbl = body.label.trim();
      if (!lbl || lbl.length > 32) {
        return NextResponse.json({ error: '라벨은 1~32자여야 합니다' }, { status: 400 });
      }
      sets.push({ col: 'label', val: lbl });
    }
    if (body.color !== undefined) sets.push({ col: 'color', val: body.color ? String(body.color).slice(0, 16) : null });
    if (body.icon !== undefined) sets.push({ col: 'icon', val: body.icon ? String(body.icon).slice(0, 64) : null });
    if (body.displayOrder !== undefined) {
      const n = Number(body.displayOrder);
      if (!Number.isFinite(n)) return NextResponse.json({ error: 'displayOrder가 숫자가 아닙니다' }, { status: 400 });
      sets.push({ col: 'display_order', val: Math.max(0, Math.min(9999, Math.floor(n))) });
    }
    if (typeof body.isActive === 'boolean') sets.push({ col: 'is_active', val: body.isActive });

    if (sets.length === 0) {
      return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 });
    }

    const setSql = sets.map((s, i) => `${s.col} = $${i + 1}`).join(', ');
    const params = sets.map(s => s.val);
    params.push(id);
    await dbRun(
      `UPDATE session_tags SET ${setSql}, updated_at = NOW() WHERE id = $${params.length}`,
      params
    );

    const after = await dbGet<TagRow>(
      `SELECT id, label, color, icon, display_order, is_active, updated_at
         FROM session_tags WHERE id = $1`,
      [id]
    );

    void logAdminAction(req, auth.memberId, {
      action: 'tag_update',
      targetType: 'tag',
      targetId: id,
      targetName: after?.label ?? before.label,
      summary: `태그 수정: ${after?.label ?? id}`,
      beforeValue: before,
      afterValue: after,
    });

    return NextResponse.json({ tag: after ? rowToDto(after) : null });
  } catch (err: any) {
    console.error('[tags PUT] error:', err);
    return NextResponse.json({ error: '태그 수정 중 오류가 발생했습니다' }, { status: 500 });
  }
}

// ───────────────────────────────────────── DELETE ──────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();
  await ensureSchema();

  const id = (req.nextUrl.searchParams.get('id') ?? '').trim().toLowerCase();
  if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });
  if (id === OMNI_TAG) {
    return NextResponse.json({ error: "'*' 는 시스템 태그라 삭제할 수 없습니다" }, { status: 400 });
  }

  const before = await dbGet<TagRow>(
    `SELECT id, label, color, icon, display_order, is_active, updated_at
       FROM session_tags WHERE id = $1`,
    [id]
  );
  if (!before) return NextResponse.json({ error: '태그를 찾을 수 없습니다' }, { status: 404 });

  // 사용 중인 태그는 삭제 차단 — 어드민이 먼저 매핑을 정리하도록 강제.
  const usedSession = await dbGet<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM session_tag_map WHERE tag_id = $1',
    [id]
  );
  const usedProduct = await dbGet<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM pass_product_tag_map WHERE tag_id = $1',
    [id]
  );
  const sessionRefs = Number(usedSession?.count ?? 0);
  const productRefs = Number(usedProduct?.count ?? 0);
  if (sessionRefs > 0 || productRefs > 0) {
    return NextResponse.json(
      {
        error: `이 태그를 사용 중인 항목이 있어 삭제할 수 없습니다 (세션 ${sessionRefs}건, 수강권 상품 ${productRefs}건). 먼저 해당 항목에서 태그를 제거하거나 비활성화(isActive=false)하세요.`,
        sessionRefs,
        productRefs,
      },
      { status: 409 }
    );
  }

  await dbRun('DELETE FROM session_tags WHERE id = $1', [id]);

  void logAdminAction(req, auth.memberId, {
    action: 'tag_delete',
    targetType: 'tag',
    targetId: id,
    targetName: before.label,
    summary: `태그 삭제: ${before.label}`,
    beforeValue: before,
  });

  return NextResponse.json({ success: true });
}
