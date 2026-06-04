import { NextRequest, NextResponse } from 'next/server';
import { dbAll, ensureSchema } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { getProductTagsMap } from '@/lib/tags';

/**
 * Public (no-auth) endpoint returning active pass products for marketing pages.
 *
 * Non-logged-in visitors can browse the product catalog to understand pricing
 * and options before signing up. Only is_active=true products are returned.
 *
 * Query params:
 *   feature (optional) — if "true" returns only is_featured=true products
 *   limit   (default 20) — max number of products to return
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'public-products', { windowMs: 60_000, max: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  const featuredOnly = req.nextUrl.searchParams.get('featured') === 'true';
  const limit = Math.min(
    50,
    Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10) || 20)
  );

  try {
    // 스키마 + 카탈로그 동기화 보장. 이 엔드포인트는 무인증이라 미들웨어에
    // 막히지 않고 항상 도달하므로, 1회성 카탈로그 리셋(app_meta 마커)을
    // 확실히 트리거하는 진입점 역할도 한다.
    await ensureSchema();

    const where = featuredOnly
      ? 'WHERE is_active = TRUE AND is_featured = TRUE'
      : 'WHERE is_active = TRUE';

    const rows = await dbAll<any>(
      `SELECT * FROM pass_products
        ${where}
        ORDER BY is_featured DESC NULLS LAST, display_order ASC NULLS LAST, price ASC
        LIMIT $1`,
      [limit]
    );

    const tagsMap = await getProductTagsMap(rows.map((r: any) => r.id));

    const products = rows.map((p: any) => {
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
        tags: tagsMap[p.id] ?? [],
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
      };
    });

    return NextResponse.json(
      { products, count: products.length },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
        },
      }
    );
  } catch (err: any) {
    console.error('[public/products] error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
