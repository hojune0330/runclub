import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';

// PR-6: pass_products = "merchant catalog" so members can view a real menu
// and admins have full CRUD plus rich detail fields.
//   GET     — list (members see only is_active=true; admin sees all)
//   POST    — create new product (admin)
//   PUT     — update existing product (admin)
//   DELETE  — soft-delete by flipping is_active=false (admin)

// Whitelist of editable fields. Anything else in the request body is ignored.
// This is the single source of truth for "what can be PATCH'd on a product".
const PATCHABLE_FIELDS = [
  'name', 'category', 'applicableSessions',
  'totalCount', 'durationDays', 'price', 'originalPrice',
  'description', 'descriptionLong', 'refundPolicy',
  'imageUrl', 'displayOrder', 'isFeatured', 'isActive',
] as const;

function rowToProduct(p: any) {
  let applicableSessions: any;
  try {
    applicableSessions = p.applicable_sessions === 'all'
      ? 'all'
      : JSON.parse(p.applicable_sessions);
  } catch {
    applicableSessions = 'all';
  }
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    applicableSessions,
    totalCount: p.total_count,
    durationDays: p.duration_days,
    price: p.price,
    originalPrice: p.original_price,
    description: p.description,
    descriptionLong: p.description_long,
    refundPolicy: p.refund_policy,
    imageUrl: p.image_url,
    displayOrder: p.display_order ?? 0,
    isFeatured: !!p.is_featured,
    isActive: !!p.is_active,
    updatedAt: p.updated_at ? new Date(p.updated_at).toISOString() : null,
    createdAt: p.created_at ? new Date(p.created_at).toISOString() : null,
  };
}

// ─── GET /api/pass-products ───
// Members see ONLY active products (catalog). Admin sees everything plus the
// full detail fields. Sort: featured first → display_order asc → price asc.
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  const isAdmin = auth.role === 'admin';
  const includeInactive = isAdmin && req.nextUrl.searchParams.get('includeInactive') !== 'false';

  const where = includeInactive ? '' : 'WHERE is_active = TRUE';
  const products = await dbAll(`
    SELECT * FROM pass_products
    ${where}
    ORDER BY is_featured DESC NULLS LAST, display_order ASC NULLS LAST, price ASC
  `, []);

  return NextResponse.json(products.map(rowToProduct));
}

// ─── POST /api/pass-products ───
// Admin-only. Creates a new product.
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const body = await req.json();

    // ── Validate required fields ──
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: '상품명을 입력해주세요' }, { status: 400 });
    }
    if (!['count', 'season', 'monthly'].includes(body.category)) {
      return NextResponse.json({ error: '분류는 count/season/monthly 중 하나여야 합니다' }, { status: 400 });
    }
    if (typeof body.durationDays !== 'number' || body.durationDays <= 0 || body.durationDays > 3650) {
      return NextResponse.json({ error: '이용 기간(일)은 1~3650 사이여야 합니다' }, { status: 400 });
    }
    if (typeof body.price !== 'number' || body.price < 0 || body.price > 99999999) {
      return NextResponse.json({ error: '가격은 0 이상이어야 합니다' }, { status: 400 });
    }
    if (body.category === 'count') {
      if (typeof body.totalCount !== 'number' || body.totalCount <= 0 || body.totalCount > 1000) {
        return NextResponse.json({ error: '횟수권은 totalCount(1~1000)가 필요합니다' }, { status: 400 });
      }
    }
    if (body.originalPrice != null) {
      if (typeof body.originalPrice !== 'number' || body.originalPrice < body.price) {
        return NextResponse.json({ error: '정가는 판매가보다 같거나 커야 합니다' }, { status: 400 });
      }
    }

    const applicableSessions = body.applicableSessions === 'all'
      ? 'all'
      : JSON.stringify(body.applicableSessions ?? []);

    const id = genId('pp');
    await dbRun(`
      INSERT INTO pass_products (
        id, name, category, applicable_sessions, total_count, duration_days,
        price, original_price, description, description_long, refund_policy,
        image_url, display_order, is_featured, is_active, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
      )
    `, [
      id,
      body.name.trim(),
      body.category,
      applicableSessions,
      body.category === 'count' ? body.totalCount : null,
      body.durationDays,
      body.price,
      body.originalPrice ?? null,
      body.description?.trim() || null,
      body.descriptionLong?.trim() || null,
      body.refundPolicy?.trim() || null,
      body.imageUrl?.trim() || null,
      body.displayOrder ?? 0,
      body.isFeatured === true,
      body.isActive !== false,
    ]);

    void logAdminAction(req, auth.memberId, {
      action: 'pass_product.create',
      targetType: 'pass_product',
      targetId: id,
      targetName: body.name,
      summary: `수강권 상품 생성: ${body.name} (${body.price}원)`,
      afterValue: { id, ...body },
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error: any) {
    console.error('[pass-products POST] error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}

// ─── PUT /api/pass-products ───
// Admin-only. Partial update by `id`. Body: { id, ...patchableFields }.
export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const body = await req.json();
    const id = body?.id;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '상품 ID가 필요합니다' }, { status: 400 });
    }

    const before = await dbGet<any>('SELECT * FROM pass_products WHERE id = $1', [id]);
    if (!before) {
      return NextResponse.json({ error: '상품을 찾을 수 없습니다' }, { status: 404 });
    }

    // ── Build dynamic UPDATE clause from whitelisted fields only ──
    const setParts: string[] = [];
    const params: any[] = [];
    let i = 1;

    const map: Record<string, string> = {
      name: 'name',
      category: 'category',
      applicableSessions: 'applicable_sessions',
      totalCount: 'total_count',
      durationDays: 'duration_days',
      price: 'price',
      originalPrice: 'original_price',
      description: 'description',
      descriptionLong: 'description_long',
      refundPolicy: 'refund_policy',
      imageUrl: 'image_url',
      displayOrder: 'display_order',
      isFeatured: 'is_featured',
      isActive: 'is_active',
    };

    for (const key of PATCHABLE_FIELDS) {
      if (!(key in body)) continue;
      const col = map[key];
      let val: any = body[key];

      // Validation per field
      if (key === 'name') {
        if (typeof val !== 'string' || val.trim().length === 0) {
          return NextResponse.json({ error: '상품명이 비어있습니다' }, { status: 400 });
        }
        val = val.trim();
      } else if (key === 'category') {
        if (!['count', 'season', 'monthly'].includes(val)) {
          return NextResponse.json({ error: '분류 값이 올바르지 않습니다' }, { status: 400 });
        }
      } else if (key === 'durationDays') {
        if (typeof val !== 'number' || val <= 0 || val > 3650) {
          return NextResponse.json({ error: '이용 기간은 1~3650일이어야 합니다' }, { status: 400 });
        }
      } else if (key === 'price') {
        if (typeof val !== 'number' || val < 0 || val > 99999999) {
          return NextResponse.json({ error: '가격이 올바르지 않습니다' }, { status: 400 });
        }
      } else if (key === 'originalPrice') {
        if (val != null && (typeof val !== 'number' || val < 0)) {
          return NextResponse.json({ error: '정가가 올바르지 않습니다' }, { status: 400 });
        }
      } else if (key === 'totalCount') {
        if (val != null && (typeof val !== 'number' || val <= 0 || val > 1000)) {
          return NextResponse.json({ error: '횟수가 올바르지 않습니다' }, { status: 400 });
        }
      } else if (key === 'applicableSessions') {
        val = val === 'all' ? 'all' : JSON.stringify(val ?? []);
      } else if (key === 'displayOrder') {
        if (typeof val !== 'number') val = 0;
      } else if (key === 'isFeatured' || key === 'isActive') {
        val = !!val;
      } else if (typeof val === 'string') {
        val = val.trim() || null;
      }

      setParts.push(`${col} = $${i++}`);
      params.push(val);
    }

    if (setParts.length === 0) {
      return NextResponse.json({ error: '변경할 항목이 없습니다' }, { status: 400 });
    }

    setParts.push(`updated_at = NOW()`);
    params.push(id);
    const sql = `UPDATE pass_products SET ${setParts.join(', ')} WHERE id = $${i}`;
    await dbRun(sql, params);

    const after = await dbGet<any>('SELECT * FROM pass_products WHERE id = $1', [id]);

    void logAdminAction(req, auth.memberId, {
      action: 'pass_product.update',
      targetType: 'pass_product',
      targetId: id,
      targetName: after?.name ?? before.name,
      summary: `수강권 상품 수정: ${after?.name ?? before.name}`,
      beforeValue: rowToProduct(before),
      afterValue: rowToProduct(after),
    });

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('[pass-products PUT] error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}

// ─── DELETE /api/pass-products?id=xxx ───
// Soft-delete (set is_active=false). Hard-delete is refused if any
// member_passes reference the product, to preserve audit history.
export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const id = req.nextUrl.searchParams.get('id');
    const hard = req.nextUrl.searchParams.get('hard') === 'true';
    if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });

    const before = await dbGet<any>('SELECT * FROM pass_products WHERE id = $1', [id]);
    if (!before) return NextResponse.json({ error: '상품을 찾을 수 없습니다' }, { status: 404 });

    const issued = await dbGet<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM member_passes WHERE product_id = $1',
      [id]
    );
    const issuedCount = Number(issued?.count ?? 0);

    if (hard) {
      if (issuedCount > 0) {
        return NextResponse.json({
          error: `발급 이력이 ${issuedCount}건 있어 영구 삭제할 수 없습니다. 판매 중단(비활성)을 사용하세요.`,
          issuedCount,
        }, { status: 409 });
      }
      await dbRun('DELETE FROM pass_products WHERE id = $1', [id]);
      void logAdminAction(req, auth.memberId, {
        action: 'pass_product.delete',
        targetType: 'pass_product',
        targetId: id,
        targetName: before.name,
        summary: `수강권 상품 영구 삭제: ${before.name}`,
        beforeValue: rowToProduct(before),
      });
    } else {
      await dbRun(`UPDATE pass_products SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [id]);
      void logAdminAction(req, auth.memberId, {
        action: 'pass_product.deactivate',
        targetType: 'pass_product',
        targetId: id,
        targetName: before.name,
        summary: `수강권 상품 판매 중단: ${before.name}`,
        beforeValue: { isActive: !!before.is_active },
        afterValue: { isActive: false },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[pass-products DELETE] error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
