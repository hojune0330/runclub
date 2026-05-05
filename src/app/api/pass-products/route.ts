import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

// GET /api/pass-products
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  const products = await dbAll('SELECT * FROM pass_products ORDER BY price ASC', []);

  return NextResponse.json(products.map(p => {
    let applicableSessions: any;
    try {
      applicableSessions = p.applicable_sessions === 'all' ? 'all' : JSON.parse(p.applicable_sessions);
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
      description: p.description,
      isActive: !!p.is_active,
    };
  }));
}

// POST /api/pass-products - Admin only
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const body = await req.json();
    const id = genId('pp');

    const applicableSessions = body.applicableSessions === 'all' ? 'all' : JSON.stringify(body.applicableSessions);

    await dbRun(`
      INSERT INTO pass_products (id, name, category, applicable_sessions, total_count, duration_days, price, description, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [id, body.name, body.category, applicableSessions,
      body.totalCount || null, body.durationDays, body.price,
      body.description || null, body.isActive !== false]);

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
