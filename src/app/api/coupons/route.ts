import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, requireAdmin } from '@/lib/auth';

// ─────────────────────────────────────────────────────────────────────
// PR-DISCOUNT: Admin coupon CRUD
//
// GET    /api/coupons          — list all coupons (admin only)
// POST   /api/coupons          — create a new coupon
// PUT    /api/coupons?id=xxx   — update coupon
// DELETE /api/coupons?id=xxx   — soft-delete (deactivate) coupon
// ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (auth.role !== 'admin') return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });

  const coupons = await dbAll<any>(
    `SELECT * FROM coupons ORDER BY created_at DESC`
  );

  return NextResponse.json({
    items: coupons.map(c => ({
      id: c.id,
      code: c.code,
      name: c.name,
      discountType: c.discount_type,
      discountValue: c.discount_value,
      minOrder: c.min_order,
      maxDiscount: c.max_discount,
      totalQuantity: c.total_quantity,
      usedCount: c.used_count,
      perMember: c.per_member,
      startsAt: c.starts_at,
      expiresAt: c.expires_at,
      targetProducts: c.target_products ? JSON.parse(c.target_products) : null,
      targetGrades: c.target_grades ? JSON.parse(c.target_grades) : null,
      isActive: c.is_active,
      createdAt: c.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (auth.role !== 'admin') return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });

  try {
    const body = await req.json();
    const {
      code, name,
      discountType, discountValue,
      minOrder, maxDiscount,
      totalQuantity, perMember,
      startsAt, expiresAt,
      targetProducts, targetGrades,
    } = body;

    if (!code || !name || !discountType || discountValue == null) {
      return NextResponse.json({ error: 'code, name, discountType, discountValue는 필수입니다' }, { status: 400 });
    }
    if (!['fixed', 'percent'].includes(discountType)) {
      return NextResponse.json({ error: 'discountType은 fixed 또는 percent여야 합니다' }, { status: 400 });
    }

    // Check code uniqueness
    const existing = await dbGet<{ id: string }>('SELECT id FROM coupons WHERE code = $1', [code]);
    if (existing) {
      return NextResponse.json({ error: '이미 사용 중인 쿠폰 코드입니다' }, { status: 409 });
    }

    const id = genId('cpn');
    await dbRun(`
      INSERT INTO coupons (
        id, code, name,
        discount_type, discount_value,
        min_order, max_discount,
        total_quantity, per_member,
        starts_at, expires_at,
        target_products, target_grades,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE)
    `, [
      id, code, name,
      discountType, discountValue,
      minOrder ?? 0, maxDiscount ?? null,
      totalQuantity ?? -1, perMember ?? 1,
      startsAt ? new Date(startsAt).toISOString() : null,
      expiresAt ? new Date(expiresAt).toISOString() : null,
      targetProducts ? JSON.stringify(targetProducts) : null,
      targetGrades ? JSON.stringify(targetGrades) : null,
    ]);

    return NextResponse.json({ id, code, name }, { status: 201 });
  } catch (error: any) {
    console.error('[coupons POST] error:', error);
    return NextResponse.json({ error: '쿠폰 생성 중 오류가 발생했습니다' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (auth.role !== 'admin') return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 파라미터가 필요합니다' }, { status: 400 });

    const body = await req.json();

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    for (const [key, col] of [
      ['code', 'code'],
      ['name', 'name'],
      ['discountType', 'discount_type'],
      ['discountValue', 'discount_value'],
      ['minOrder', 'min_order'],
      ['maxDiscount', 'max_discount'],
      ['totalQuantity', 'total_quantity'],
      ['perMember', 'per_member'],
      ['isActive', 'is_active'],
    ] as const) {
      if (body[key] !== undefined) {
        sets.push(`${col} = $${idx++}`);
        vals.push(body[key]);
      }
    }

    if (body.startsAt !== undefined) {
      sets.push(`starts_at = $${idx++}`);
      vals.push(body.startsAt ? new Date(body.startsAt).toISOString() : null);
    }
    if (body.expiresAt !== undefined) {
      sets.push(`expires_at = $${idx++}`);
      vals.push(body.expiresAt ? new Date(body.expiresAt).toISOString() : null);
    }
    if (body.targetProducts !== undefined) {
      sets.push(`target_products = $${idx++}`);
      vals.push(body.targetProducts ? JSON.stringify(body.targetProducts) : null);
    }
    if (body.targetGrades !== undefined) {
      sets.push(`target_grades = $${idx++}`);
      vals.push(body.targetGrades ? JSON.stringify(body.targetGrades) : null);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 });
    }

    vals.push(id);
    await dbRun(`UPDATE coupons SET ${sets.join(', ')} WHERE id = $${idx}`, vals);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[coupons PUT] error:', error);
    return NextResponse.json({ error: '쿠폰 수정 중 오류가 발생했습니다' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (auth.role !== 'admin') return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 파라미터가 필요합니다' }, { status: 400 });

    // Soft-delete: deactivate
    await dbRun(`UPDATE coupons SET is_active = FALSE WHERE id = $1`, [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[coupons DELETE] error:', error);
    return NextResponse.json({ error: '쿠폰 삭제 중 오류가 발생했습니다' }, { status: 500 });
  }
}
