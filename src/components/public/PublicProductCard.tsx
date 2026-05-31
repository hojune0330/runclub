'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Ticket, Clock, Check, Lock, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ──────────────────────────────────────────────────────────────────────────────
   PublicProductCard — 비로그인 방문자에게 수강권 상품을 보여주는 유틸 컴포넌트.

   로그인 전 공개 페이지(홈, 세션, About)에서 상품 카탈로그를 노출해 가입을 유도.
   패턴: fetch → card list → "가입하고 구매하기" CTA

   props:
     variant  : 'card'   — 개별 카드 (홈 3종 미리보기)
              : 'strip'  — 가로 줄무늬 (세션 페이지 하단)
              : 'featured' — 추천 상품 강조 (About 페이지)
     compact  : true → description 숨기고 타이틀+가격만 표시 (홈)
     featuredOnly : true → isFeatured 상품만 fetch (About)
     max      : 최대 표시 개수
────────────────────────────────────────────────────────────────────────────── */

interface PublicProduct {
  id: string;
  name: string;
  category: 'count' | 'season' | 'monthly';
  applicableSessions: string[] | 'all';
  tags?: string[];
  totalCount?: number;
  durationDays: number;
  price: number;
  originalPrice?: number;
  description?: string;
  isFeatured: boolean;
}

const CATEGORY_KO: Record<string, string> = {
  count: '횟수권',
  season: '기간권',
  monthly: '월정액',
};

const koPrice = (n: number) =>
  new Intl.NumberFormat('ko-KR').format(n) + '원';

// ─── Public API fetch ────────────────────────────────────────────────────────

async function fetchPublicProducts(
  featuredOnly: boolean,
  limit: number
): Promise<PublicProduct[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || '';
  const url = new URL('/api/public/products', base || window.location.origin);
  if (featuredOnly) url.searchParams.set('featured', 'true');
  url.searchParams.set('limit', String(limit));
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    return data.products || [];
  } catch {
    return [];
  }
}

// ─── Duration helper ─────────────────────────────────────────────────────────

function durationLabel(days: number): string {
  if (days === 30 || days === 31) return '30일';
  if (days === 60 || days === 61 || days === 62) return '2개월';
  if (days === 90 || days === 91 || days === 92) return '3개월';
  if (days === 180 || days === 181 || days === 182 || days === 183) return '6개월';
  if (days === 365 || days === 366) return '12개월';
  if (days < 30) return `${days}일`;
  const months = Math.round(days / 30);
  return `${months}개월`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PublicProductCard({
  variant = 'card',
  compact = false,
  featuredOnly = false,
  max = 4,
}: {
  variant?: 'card' | 'strip' | 'featured';
  compact?: boolean;
  featuredOnly?: boolean;
  max?: number;
}) {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPublicProducts(featuredOnly, max).then(data => {
      if (!cancelled) {
        setProducts(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [featuredOnly, max]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: compact ? 3 : max }).map((_, i) => (
          <div
            key={i}
            className="border border-[var(--color-border)] rounded-md bg-white p-4 animate-pulse"
          >
            <div className="h-4 bg-[var(--color-bg-hover)] rounded w-1/3 mb-3" />
            <div className="h-5 bg-[var(--color-bg-hover)] rounded w-2/3 mb-2" />
            <div className="h-4 bg-[var(--color-bg-hover)] rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) return null; // 상품이 없으면 아무것도 렌더하지 않음

  if (variant === 'strip') return <ProductStrip products={products} />;
  if (variant === 'featured') return <ProductFeatured products={products} />;

  // default: 'card' variant (홈)
  return (
    <div className={cn(
      'grid gap-3',
      compact
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
    )}>
      {products.slice(0, max).map(p => (
        <CompactCard key={p.id} product={p} compact={compact} />
      ))}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * CompactCard — 홈 페이지 "이런 상품이 있어요" 섹션용.
 * 가격 투명성을 보여주면서도 공간을 많이 차지하지 않는다.
 */
function CompactCard({ product, compact }: { product: PublicProduct; compact: boolean }) {
  return (
    <div className="border border-[var(--color-border)] bg-white rounded-md p-3.5 sm:hover:border-[var(--color-primary-border)] sm:hover:shadow-sm transition-all">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
          {CATEGORY_KO[product.category] ?? product.category}
        </span>
        {product.isFeatured && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--color-warning)]">
            <Sparkles size={10} /> 추천
          </span>
        )}
      </div>
      <h4 className="text-[14px] font-semibold text-[var(--color-text)] leading-tight mb-1.5">
        {product.name}
      </h4>
      {!compact && product.description && (
        <p className="text-[12px] text-[var(--color-text-secondary)] mb-2.5 line-clamp-2">
          {product.description}
        </p>
      )}
      <div className="flex items-baseline gap-1.5">
        {product.originalPrice && product.originalPrice > product.price ? (
          <>
            <span className="text-[15px] font-bold text-[var(--color-text)] tabular-nums">
              {koPrice(product.price)}
            </span>
            <span className="text-[11.5px] text-[var(--color-text-muted)] line-through tabular-nums">
              {koPrice(product.originalPrice)}
            </span>
          </>
        ) : (
          <span className="text-[15px] font-bold text-[var(--color-text)] tabular-nums">
            {koPrice(product.price)}
          </span>
        )}
        <span className="text-[11px] text-[var(--color-text-muted)]">
          / {durationLabel(product.durationDays)}
        </span>
      </div>
      {product.totalCount && (
        <p className="mt-1 text-[11.5px] text-[var(--color-text-muted)]">
          총 {product.totalCount}회 사용 가능
        </p>
      )}
    </div>
  );
}

/**
 * ProductStrip — 세션 목록 페이지 하단 "마음에 드는 세션을 찾으셨나요?" 영역.
 * 가로로 펼쳐지는 카드 + 큰 "가입하고 구매하기" CTA. 전환율 최고 지점.
 */
function ProductStrip({ products }: { products: PublicProduct[] }) {
  return (
    <div className="border border-[var(--color-border)] bg-white rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-[var(--color-primary-bg)] border-b border-[var(--color-primary-border)] px-4 md:px-5 py-3 md:py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket size={15} className="text-[var(--color-primary)]" />
          <span className="text-[13px] md:text-[13.5px] font-semibold text-[var(--color-primary)]">
            수강권 안내
          </span>
        </div>
        <Link
          href="/login?mode=register"
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-white bg-[var(--color-primary)] px-3 py-1.5 rounded-md active:opacity-90 sm:hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <Lock size={11} /> 가입하고 구매하기
        </Link>
      </div>

      {/* Product rows */}
      <ul className="divide-y divide-[var(--color-border-subtle)]">
        {products.map(p => (
          <li
            key={p.id}
            className="flex items-center justify-between px-4 md:px-5 py-3 sm:hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <h4 className="text-[13.5px] md:text-[14px] font-semibold text-[var(--color-text)] truncate">
                  {p.name}
                </h4>
                {p.isFeatured && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--color-warning)] bg-[var(--color-warning-bg)] px-1 py-0.5 rounded">
                    <Sparkles size={9} /> 추천
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11.5px] md:text-[12px] text-[var(--color-text-muted)]">
                <span>{CATEGORY_KO[p.category]}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={10.5} /> {durationLabel(p.durationDays)}
                </span>
                {p.totalCount && <span>총 {p.totalCount}회</span>}
              </div>
            </div>
            <div className="shrink-0 ml-4 text-right">
              {p.originalPrice && p.originalPrice > p.price ? (
                <div className="flex flex-col items-end">
                  <span className="text-[12px] text-[var(--color-text-muted)] line-through tabular-nums">
                    {koPrice(p.originalPrice)}
                  </span>
                  <span className="text-[16px] md:text-[17px] font-bold text-[var(--color-primary)] tabular-nums">
                    {koPrice(p.price)}
                  </span>
                </div>
              ) : (
                <span className="text-[16px] md:text-[17px] font-bold text-[var(--color-text)] tabular-nums">
                  {koPrice(p.price)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Footer CTA */}
      <div className="border-t border-[var(--color-border-subtle)] px-4 md:px-5 py-3 bg-[var(--color-bg-subtle)]">
        <Link
          href="/login?mode=register"
          className="flex items-center justify-center gap-1.5 h-11 rounded-md text-[13.5px] font-semibold bg-[var(--color-primary)] text-white active:bg-[var(--color-primary-active)] sm:hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <Lock size={12} /> 가입하고 수강권 구매하기
        </Link>
      </div>
    </div>
  );
}

/**
 * ProductFeatured — About 페이지 하단용.
 * Featured 상품만 골라서 큰 카드로 보여준다. 설명문 + 특장점 리스트 포함.
 */
function ProductFeatured({ products }: { products: PublicProduct[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
      {products.map(p => (
        <div
          key={p.id}
          className="border border-[var(--color-border)] bg-white rounded-lg p-4 md:p-5 flex flex-col"
        >
          {/* Badge row */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
              {CATEGORY_KO[p.category] ?? p.category}
            </span>
            {p.isFeatured && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--color-warning)] bg-[var(--color-warning-bg)] px-1.5 py-0.5 rounded">
                <Sparkles size={10} /> 인기 상품
              </span>
            )}
          </div>

          {/* Name + description */}
          <h4 className="text-[16px] md:text-[17px] font-bold text-[var(--color-text)] mb-1.5">
            {p.name}
          </h4>
          {p.description && (
            <p className="text-[12.5px] md:text-[13px] text-[var(--color-text-secondary)] leading-relaxed mb-3">
              {p.description}
            </p>
          )}

          {/* Feature checklist */}
          <ul className="space-y-1.5 mb-4 flex-1">
            <FeatureItem label={durationLabel(p.durationDays) + ' 동안 사용 가능'} />
            {p.totalCount && <FeatureItem label={`총 ${p.totalCount}회 수강 가능`} />}
            {p.category === 'monthly' && <FeatureItem label="매월 자동 갱신 가능" />}
            {p.tags && p.tags.includes('*') && <FeatureItem label="모든 세션 타입 이용 가능" />}
            <FeatureItem label="현장 QR 출석 자동 차감" />
          </ul>

          {/* Price + CTA */}
          <div className="pt-3 border-t border-[var(--color-border-subtle)] flex items-end justify-between">
            <div>
              {p.originalPrice && p.originalPrice > p.price ? (
                <>
                  <span className="text-[11.5px] text-[var(--color-text-muted)] line-through block tabular-nums">
                    {koPrice(p.originalPrice)}
                  </span>
                  <span className="text-[20px] font-bold text-[var(--color-primary)] tabular-nums">
                    {koPrice(p.price)}
                  </span>
                </>
              ) : (
                <span className="text-[20px] font-bold text-[var(--color-text)] tabular-nums">
                  {koPrice(p.price)}
                </span>
              )}
            </div>
            <Link
              href="/login?mode=register"
              className="inline-flex items-center gap-1 px-3.5 py-2 rounded-md text-[13px] font-semibold bg-[var(--color-primary)] text-white active:bg-[var(--color-primary-active)] sm:hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              가입하기 <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function FeatureItem({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2 text-[12px] md:text-[12.5px] text-[var(--color-text-secondary)]">
      <Check size={13} className="text-[var(--color-success)] mt-0.5 shrink-0" />
      <span>{label}</span>
    </li>
  );
}
