'use client';

import { useState, useMemo, useEffect } from 'react';
import { Star, Check, X, ShoppingBag, AlertCircle, Loader2, Tag, FlaskConical } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig } from '@/lib/config';
import { formatPrice, cn } from '@/lib/utils';
import { Modal, Badge } from '@/components/ui';
import { api } from '@/lib/api';
import type { PassProduct, SessionType } from '@/types';

// ─────────────────────────────────────────────────────────────────────
// PR-6 (member side): PassCatalog
//
// "메뉴판" view: shows all is_active=true products, grouped by category.
// On tap → PassProductDetail modal with full marketing copy + 환불정책.
// "구매하기" triggers Toss Payments via /api/payments/checkout → SDK
// → /api/payments/confirm. We dynamically `import('@tosspayments/payment-sdk')`
// at click time so SSR doesn't choke and unbought sessions don't pay the
// SDK download cost.
// ─────────────────────────────────────────────────────────────────────

const passCategoryLabel = (c: PassProduct['category']) =>
  c === 'count' ? '횟수권' : c === 'season' ? '시즌권' : '월권';

export default function PassCatalog() {
  const { passProducts } = useApp();
  const [detail, setDetail] = useState<PassProduct | null>(null);

  const onSale = useMemo(() => passProducts.filter(p => p.isActive), [passProducts]);

  const grouped = useMemo(() => {
    const buckets: Record<PassProduct['category'], PassProduct[]> = { count: [], season: [], monthly: [] };
    for (const p of onSale) buckets[p.category].push(p);
    (Object.keys(buckets) as PassProduct['category'][]).forEach(k => {
      buckets[k].sort((a, b) =>
        Number(!!b.isFeatured) - Number(!!a.isFeatured) ||
        (a.displayOrder ?? 0) - (b.displayOrder ?? 0) ||
        a.price - b.price
      );
    });
    return buckets;
  }, [onSale]);

  const total = onSale.length;

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-[20px] font-semibold text-[var(--color-text)]">수강권 구매</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          판매중인 상품 {total}건 — 카드를 눌러 상세 정보를 확인하고 결제할 수 있습니다.
        </p>
      </div>

      <TestModeBanner />

      {total === 0 && (
        <div className="bg-white border border-[var(--color-border)] rounded-md py-16 text-center">
          <ShoppingBag size={28} className="mx-auto text-[var(--color-text-muted)] mb-2" />
          <p className="text-[13.5px] text-[var(--color-text)] font-medium">현재 판매중인 상품이 없습니다.</p>
          <p className="text-[12.5px] text-[var(--color-text-muted)] mt-1">새 상품이 등록되면 여기에 표시됩니다.</p>
        </div>
      )}

      {(['count', 'season', 'monthly'] as const).map(cat => {
        const list = grouped[cat];
        if (!list || list.length === 0) return null;
        return (
          <section key={cat}>
            <h2 className="text-[15px] font-semibold text-[var(--color-text)] mb-2.5">
              {passCategoryLabel(cat)}
              <span className="ml-2 text-[12px] text-[var(--color-text-muted)] font-normal">{list.length}종</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map(p => (
                <ProductCard key={p.id} product={p} onClick={() => setDetail(p)} />
              ))}
            </div>
          </section>
        );
      })}

      {detail && (
        <PassProductDetail
          product={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ProductCard — catalog tile.
// ─────────────────────────────────────────────────────────────────────
function ProductCard({ product, onClick }: { product: PassProduct; onClick: () => void }) {
  // PR-A: 태그가 있으면 태그 라벨로, 없으면 legacy applicableSessions 로 fallback.
  const { sessionTags } = useApp();
  const tagLabels = useMemo(() => {
    if (!product.tags || product.tags.length === 0) return null;
    if (product.tags.length === 1 && product.tags[0] === '*') return ['전체 세션'];
    return product.tags
      .map(id => sessionTags.find(t => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map(t => t.label);
  }, [product.tags, sessionTags]);
  const apply = tagLabels && tagLabels.length > 0
    ? tagLabels.join(' · ')
    : product.applicableSessions === 'all'
    ? '전체 세션'
    : (product.applicableSessions as SessionType[])
        .map(s => sessionTypeConfig[s]?.label)
        .filter(Boolean)
        .join(' · ');
  const perUse = product.totalCount && product.totalCount > 0
    ? Math.round(product.price / product.totalCount)
    : null;
  const hasDiscount = product.originalPrice && product.originalPrice > product.price;
  const discountPct = hasDiscount
    ? Math.round((1 - product.price / (product.originalPrice as number)) * 100)
    : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left bg-white border border-[var(--color-border)] rounded-md overflow-hidden hover:border-[var(--color-primary)]/40 hover:shadow-sm transition-all flex flex-col"
    >
      {product.imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={product.imageUrl} alt={product.name} className="w-full aspect-[16/9] object-cover" />
      ) : (
        <div className="w-full aspect-[16/9] bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-bg-subtle)] flex items-center justify-center">
          <ShoppingBag size={28} className="text-[var(--color-primary)]/40" />
        </div>
      )}
      <div className="p-3.5 flex-1 flex flex-col">
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          {product.isFeatured && (
            <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              <Star size={9} /> 추천
            </span>
          )}
          {hasDiscount && (
            <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
              <Tag size={9} /> {discountPct}% 할인
            </span>
          )}
        </div>
        <p className="text-[14.5px] font-semibold text-[var(--color-text)] leading-snug">{product.name}</p>
        {product.description && (
          <p className="text-[12px] text-[var(--color-text-muted)] mt-1 line-clamp-2 leading-relaxed">{product.description}</p>
        )}
        <div className="text-[11.5px] text-[var(--color-text-muted)] mt-2">
          {apply} · {product.totalCount ? `${product.totalCount}회` : `${product.durationDays}일`}
          {perUse && ` · 회당 ${formatPrice(perUse)}`}
        </div>
        <div className="mt-2.5 pt-2.5 border-t border-[var(--color-border-subtle)] flex items-end justify-between gap-2">
          <div>
            {hasDiscount && (
              <div className="text-[11px] text-[var(--color-text-muted)] line-through tabular-nums">
                {formatPrice(product.originalPrice as number)}
              </div>
            )}
            <div className="text-[16px] font-bold text-[var(--color-text)] tabular-nums">{formatPrice(product.price)}</div>
          </div>
          <span className="text-[12px] text-[var(--color-primary)] font-medium group-hover:underline">
            상세보기
          </span>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PassProductDetail — full description + buy button.
// ─────────────────────────────────────────────────────────────────────
function PassProductDetail({ product, onClose }: { product: PassProduct; onClose: () => void }) {
  const { sessionTags } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PR-A: 태그 기반 라벨 (fallback to legacy applicableSessions)
  const tagLabels = useMemo(() => {
    if (!product.tags || product.tags.length === 0) return null;
    if (product.tags.length === 1 && product.tags[0] === '*') return ['전체 세션'];
    return product.tags
      .map(id => sessionTags.find(t => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map(t => t.label);
  }, [product.tags, sessionTags]);
  const apply = tagLabels && tagLabels.length > 0
    ? tagLabels.join(', ')
    : product.applicableSessions === 'all'
    ? '전체 세션'
    : (product.applicableSessions as SessionType[])
        .map(s => sessionTypeConfig[s]?.label)
        .filter(Boolean)
        .join(', ');
  const hasDiscount = product.originalPrice && product.originalPrice > product.price;

  const handleBuy = async () => {
    setError(null);
    setBusy(true);
    try {
      // 1. Ask the server to create a pending_payments row and return the
      //    Toss params we need to open the SDK widget.
      const checkout = await api.payments.checkout(product.id);

      if (!checkout.tossClientKey) {
        // Fallback: server has no Toss client key → tell user to contact
        // the manager. We *don't* try to silently succeed.
        setError('현재 온라인 결제가 준비되지 않았습니다. 운영자에게 문의해주세요.');
        setBusy(false);
        return;
      }

      // 2. Lazy-load Toss SDK (only paid for actual buyers).
      const mod = await import('@tosspayments/payment-sdk').catch(() => null);
      if (!mod) {
        setError('결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        setBusy(false);
        return;
      }
      const tossPayments = await mod.loadTossPayments(checkout.tossClientKey);

      // 3. Open the standard payment widget. Toss redirects to successUrl
      //    with paymentKey/orderId/amount on success.
      await tossPayments.requestPayment('카드', {
        amount: checkout.amount,
        orderId: checkout.orderId,
        orderName: checkout.orderName,
        customerName: checkout.customerName,
        customerEmail: checkout.customerEmail,
        customerMobilePhone: checkout.customerMobilePhone,
        successUrl: checkout.successUrl,
        failUrl: checkout.failUrl,
      });
    } catch (e: any) {
      // The SDK throws on user cancel — show only meaningful errors.
      const msg = e?.message ?? String(e);
      if (msg.includes('cancel') || msg.includes('USER_CANCEL')) {
        setBusy(false);
        return;
      }
      setError(msg || '결제 준비 중 오류가 발생했습니다');
      setBusy(false);
    }
  };

  return (
    <Modal title={product.name} onClose={onClose} size="lg">
      <div className="space-y-4 max-h-[68vh] overflow-y-auto pr-1">
        {product.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={product.imageUrl} alt={product.name} className="w-full max-h-[260px] object-cover rounded border border-[var(--color-border)]" />
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {product.isFeatured && <Badge tone="warning"><Star size={10} className="inline mr-0.5" />추천</Badge>}
          <Badge tone="muted">{passCategoryLabel(product.category)}</Badge>
          <span className="text-[12px] text-[var(--color-text-muted)]">{apply}</span>
        </div>

        <div className="flex items-baseline gap-2">
          {hasDiscount && (
            <span className="text-[14px] text-[var(--color-text-muted)] line-through tabular-nums">
              {formatPrice(product.originalPrice as number)}
            </span>
          )}
          <span className="text-[24px] font-bold text-[var(--color-text)] tabular-nums">{formatPrice(product.price)}</span>
          <span className="text-[12px] text-[var(--color-text-muted)]">
            · {product.totalCount ? `${product.totalCount}회` : `${product.durationDays}일`}
          </span>
        </div>

        {product.description && (
          <p className="text-[13.5px] text-[var(--color-text)] leading-relaxed">{product.description}</p>
        )}

        {product.descriptionLong && (
          <div className="bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded p-3">
            <h3 className="text-[12.5px] font-semibold text-[var(--color-text-secondary)] mb-1.5">상세 설명</h3>
            <p className="text-[13px] text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">{product.descriptionLong}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[12.5px]">
          <Field label="이용 기간" value={`${product.durationDays}일`} />
          {product.totalCount && <Field label="총 횟수" value={`${product.totalCount}회`} />}
          <Field label="이용 가능 세션" value={apply} />
          {product.totalCount && product.totalCount > 0 && (
            <Field label="회당 단가" value={formatPrice(Math.round(product.price / product.totalCount))} />
          )}
        </div>

        {product.refundPolicy && (
          <div className="border border-[var(--color-border)] rounded p-3">
            <h3 className="text-[12.5px] font-semibold text-[var(--color-text-secondary)] mb-1.5">환불 정책</h3>
            <p className="text-[12.5px] text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">{product.refundPolicy}</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded">
            <AlertCircle size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-[12.5px] text-red-700">{error}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
        <button type="button" onClick={onClose} disabled={busy}
          className="flex-1 h-11 text-[13.5px] font-medium text-[var(--color-text)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-subtle)] disabled:opacity-50">
          닫기
        </button>
        <button type="button" onClick={handleBuy} disabled={busy}
          className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-border)]">
          {busy ? <><Loader2 size={14} className="animate-spin" /> 결제창 여는 중…</> : <><ShoppingBag size={14} /> {formatPrice(product.price)} 결제하기</>}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--color-text-muted)] mb-0.5">{label}</p>
      <p className="text-[13px] text-[var(--color-text)]">{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PR-6 STEP 6: TestModeBanner
//
// `NEXT_PUBLIC_TOSS_CLIENT_KEY`가 `test_ck_` 또는 `test_gck_`로 시작하면
// 테스트 모드로 간주하고 회원에게 노란색 배너를 노출합니다.
// 운영 키(live_*)로 교체되면 자동으로 사라집니다.
// ─────────────────────────────────────────────────────────────────────
export function TestModeBanner({ compact = false }: { compact?: boolean }) {
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '';
  const isTest = clientKey.startsWith('test_ck_') || clientKey.startsWith('test_gck_');
  if (!isTest) return null;
  return (
    <div className={cn(
      'flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded',
      compact && 'text-[12px]'
    )}>
      <FlaskConical size={compact ? 13 : 14} className="text-amber-700 mt-0.5 flex-shrink-0" />
      <div className={compact ? 'text-[12px] text-amber-900' : 'text-[12.5px] text-amber-900'}>
        <p className="font-semibold">테스트 결제 모드</p>
        <p className="text-amber-800 mt-0.5">
          현재 토스 테스트 키로 동작 중입니다. 실제 결제는 일어나지 않습니다.
          {!compact && (
            <>
              {' '}테스트 카드 <span className="font-mono">4330-1234-1234-1234</span>, 유효기간 12/30, CVC 123, 비밀번호 00을 사용하세요.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

