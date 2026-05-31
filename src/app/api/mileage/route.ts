import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';

// ─────────────────────────────────────────────────────────────────────
// PR-DISCOUNT: Member mileage & grade API
//
// GET /api/mileage          — get my mileage balance, grade, and history
// GET /api/mileage?admin=1  — list all members' mileage (admin only)
// ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  const isAdmin = auth.role === 'admin' && req.nextUrl.searchParams.get('admin') === '1';

  if (isAdmin) {
    const members = await dbAll<any>(`
      SELECT m.id, m.name, m.phone, m.grade_id, m.mileage_balance, m.total_purchased,
             g.label AS grade_label, g.discount_rate, g.mileage_rate
        FROM members m
        LEFT JOIN member_grades g ON m.grade_id = g.id
       WHERE m.is_active = TRUE
       ORDER BY m.mileage_balance DESC
    `);
    return NextResponse.json({
      items: members.map(m => ({
        memberId: m.id,
        memberName: m.name,
        memberPhone: m.phone,
        gradeId: m.grade_id,
        gradeLabel: m.grade_label ?? '일반',
        gradeDiscountRate: Number(m.discount_rate ?? 0),
        gradeMileageRate: Number(m.mileage_rate ?? 0.10),
        mileageBalance: m.mileage_balance ?? 0,
        totalPurchased: m.total_purchased ?? 0,
      })),
    });
  }

  // Regular member: their own mileage
  const member = await dbGet<any>(`
    SELECT m.id, m.mileage_balance, m.total_purchased, m.grade_id,
           g.label AS grade_label, g.discount_rate, g.mileage_rate
      FROM members m
      LEFT JOIN member_grades g ON m.grade_id = g.id
     WHERE m.id = $1
  `, [auth.memberId]);

  if (!member) {
    return NextResponse.json({ error: '회원 정보를 찾을 수 없습니다' }, { status: 404 });
  }

  // Also fetch usage history (last 50 entries)
  const history = await dbAll<any>(`
    SELECT id, amount, reason, reference_id, balance_after, created_at
      FROM mileage_log
     WHERE member_id = $1
     ORDER BY created_at DESC
     LIMIT 50
  `, [auth.memberId]);

  // Active coupons this member has
  const activeCoupons = await dbAll<any>(`
    SELECT mc.id, mc.coupon_id, c.code, c.name, c.discount_type, c.discount_value,
           c.min_order, c.max_discount, c.expires_at, mc.created_at AS issued_at
      FROM member_coupons mc
      JOIN coupons c ON mc.coupon_id = c.id
     WHERE mc.member_id = $1 AND mc.status = 'issued' AND c.is_active = TRUE
     ORDER BY c.expires_at ASC
  `, [auth.memberId]);

  return NextResponse.json({
    memberId: member.id,
    mileageBalance: member.mileage_balance ?? 0,
    totalPurchased: member.total_purchased ?? 0,
    grade: {
      id: member.grade_id ?? 'grade_default',
      label: member.grade_label ?? '일반',
      discountRate: Number(member.discount_rate ?? 0),
      mileageRate: Number(member.mileage_rate ?? 0.10),
    },
    history: history.map(h => ({
      id: h.id,
      amount: h.amount,
      reason: h.reason,
      referenceId: h.reference_id,
      balanceAfter: h.balance_after,
      createdAt: h.created_at,
    })),
    activeCoupons: activeCoupons.map(c => ({
      id: c.id,
      couponId: c.coupon_id,
      code: c.code,
      name: c.name,
      discountType: c.discount_type,
      discountValue: c.discount_value,
      minOrder: c.min_order,
      maxDiscount: c.max_discount,
      expiresAt: c.expires_at,
      issuedAt: c.issued_at,
    })),
  });
}
