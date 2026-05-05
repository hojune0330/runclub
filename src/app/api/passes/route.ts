import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

// GET /api/passes?memberId=xxx (admin) or own passes (member)
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  // EXT-I2: Validate the optional memberId query param. Defence in depth —
  // it goes through a pg parameter, but we never want unbounded user input
  // hitting the DB and the role gating below relies on this being a string.
  const memberIdRaw = req.nextUrl.searchParams.get('memberId');
  const memberId =
    typeof memberIdRaw === 'string' && memberIdRaw.length > 0 && memberIdRaw.length <= 64
      ? memberIdRaw
      : null;

  let query = `
    SELECT mp.*, pp.name as product_name, pp.category, pp.applicable_sessions, pp.total_count as product_total_count,
           m.name as member_name
    FROM member_passes mp
    JOIN pass_products pp ON mp.product_id = pp.id
    JOIN members m ON mp.member_id = m.id
  `;
  const params: any[] = [];

  // EXT-I2: A non-admin must NEVER be able to query someone else's passes by
  // passing memberId. The previous implementation already filtered on the
  // caller's own member_id for non-admins, but we make that intent explicit
  // and reject the spoof attempt with 403 so it's auditable in logs.
  if (auth.role !== 'admin') {
    if (memberId && memberId !== auth.memberId) {
      return forbiddenResponse('다른 회원의 수강권은 조회할 수 없습니다');
    }
    query += ' WHERE mp.member_id = $1';
    params.push(auth.memberId);
  } else if (memberId) {
    query += ' WHERE mp.member_id = $1';
    params.push(memberId);
  }

  query += ' ORDER BY mp.issued_date DESC';

  const passes = await dbAll(query, params);

  return NextResponse.json(passes.map(p => {
    let applicableSessions: any;
    try {
      applicableSessions = p.applicable_sessions === 'all' ? 'all' : JSON.parse(p.applicable_sessions);
    } catch {
      applicableSessions = 'all';
    }

    return {
      id: p.id,
      memberId: p.member_id,
      memberName: p.member_name,
      productId: p.product_id,
      productName: p.product_name,
      category: p.category,
      applicableSessions,
      totalCount: p.total_count || p.product_total_count,
      remainingCount: p.remaining_count,
      startDate: p.start_date,
      expiryDate: p.expiry_date,
      issuedDate: p.issued_date,
      // EXT-I2: Hide the unit price from non-admins. A member only needs to
      // know how much remaining count/days they have; the original purchase
      // price is admin/operations data and was leaking via this endpoint.
      price: auth.role === 'admin' ? p.price : undefined,
      status: p.status,
      pausedAt: p.paused_at,
    };
  }));
}

// POST /api/passes - Issue a pass (admin only)
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const { memberId, productId } = await req.json();
    if (!memberId || !productId) {
      return NextResponse.json({ error: 'memberId와 productId가 필요합니다' }, { status: 400 });
    }

    // Verify member exists and is active
    const member = await dbGet<{ id: string; is_active: boolean }>(
      'SELECT id, is_active FROM members WHERE id = $1',
      [memberId]
    );
    if (!member) return NextResponse.json({ error: '회원을 찾을 수 없습니다' }, { status: 404 });
    if (!member.is_active) return NextResponse.json({ error: '비활성 회원에게는 발급할 수 없습니다' }, { status: 400 });

    const product = await dbGet<{ total_count: number; duration_days: number; price: number; is_active: boolean }>(
      'SELECT * FROM pass_products WHERE id = $1',
      [productId]
    );
    if (!product) return NextResponse.json({ error: '수강권 상품을 찾을 수 없습니다' }, { status: 404 });
    if (product.is_active === false) {
      return NextResponse.json({ error: '비활성 상품은 발급할 수 없습니다' }, { status: 400 });
    }

    const id = genId('mp');
    const startDate = new Date().toISOString().split('T')[0];
    const expiryDate = new Date(Date.now() + product.duration_days * 86400000).toISOString().split('T')[0];

    await dbRun(`
      INSERT INTO member_passes (id, member_id, product_id, total_count, remaining_count, start_date, expiry_date, issued_date, price, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
    `, [id, memberId, productId, product.total_count, product.total_count, startDate, expiryDate, startDate, product.price]);

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error: any) {
    console.error('[passes POST] error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}

// PUT /api/passes - Update pass status (admin: pause/refund)
export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const { passId, action } = await req.json();
    if (!passId || !action) {
      return NextResponse.json({ error: 'passId와 action이 필요합니다' }, { status: 400 });
    }

    const allowedActions = ['pause', 'refund', 'resume'] as const;
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ error: '허용되지 않는 action 값입니다' }, { status: 400 });
    }

    // Verify pass exists before updating
    const existing = await dbGet<{ id: string }>(
      'SELECT id FROM member_passes WHERE id = $1',
      [passId]
    );
    if (!existing) {
      return NextResponse.json({ error: '수강권을 찾을 수 없습니다' }, { status: 404 });
    }

    if (action === 'pause') {
      await dbRun("UPDATE member_passes SET status = 'paused', paused_at = NOW() WHERE id = $1", [passId]);
    } else if (action === 'refund') {
      await dbRun("UPDATE member_passes SET status = 'refunded' WHERE id = $1", [passId]);
    } else if (action === 'resume') {
      await dbRun("UPDATE member_passes SET status = 'active', paused_at = NULL WHERE id = $1", [passId]);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[passes PUT] error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
