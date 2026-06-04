'use client';

import { useState, useMemo } from 'react';
import { Star, ShoppingBag, AlertCircle, Loader2, Tag, FlaskConical, Ticket, Coins } from 'lucide-react';
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
//
// PR-DISCOUNT: 멤버십 할인 표시, 쿠폰 코드 입력, 적립금 사용, 할인 요약.
// ─────────────────────────────────────────────────────────────────────

const passCategoryLabel = (c: PassProduct['category']) =>
  c === 'count' ? '횟수권' : c === 'season' ? '시즌권' : '월권';

/** SKILL:slowrun-catalog-filter
 *  런클럽 멤버십 안내 페이지의 CTA → 이쪽으로 이동할 때 sessionStorage 에
 *  저장된 태그를 읽어 해당 태그 상품만 보여준다. 읽자마자 삭제하므로
 *  다른 경로로 진입할 때는 영향을 주지 않는다.
 */
const CATALOG_FILTER_KEY = 'slowrun:catalogFilter';

// 태그 id → 필터 배너에 표시할 사람이 읽는 이름.
const TAG_FILTER_LABEL: Record<string, string> = {
  runclub: '런클럽 멤버십',
  ebw: 'EBW',
  slowrun: '슬로우 롱런',
  marathon: '마라톤',
  special: '특화 클래스',
  pt: '1:1 PT',
  product: '제작/굿즈',
};

export default function PassCatalog() {
  const { passProducts } = useApp();
  const [detail, setDetail] = useState<PassProduct | null>(null);
  // slowrun CTA 필터: 마운트 시 sessionStorage 읽고 즉시 제거
  const [tagFilter, setTagFilter] = useState<string | null>(() => {
    try {
      const v = sessionStorage.getItem(CATALOG_FILTER_KEY);
      if (v) sessionStorage.removeItem(CATALOG_FILTER_KEY);
      return v;
    } catch { return null; }
  });

  const onSale = useMemo(() => {
    const active = passProducts.filter(p => p.isActive);
    if (tagFilter) return active.filter(p => p.tags && p.tags.includes(tagFilter));
    return active;
  }, [passProducts, tagFilter]);

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
        <h1 className="page-title">수강권 구매</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          판매중인 상품 {total}건 — 카드를 눌러 상세 정보를 확인하고 결제할 수 있습니다.
        </p>
      </div>

      {/* ── Tag filter indicator ── */}
      {tagFilter && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-slowrun-bg)] border border-[var(--color-slowrun)]/20 rounded text-[13px] text-[var(--color-text)] animate-slide-up">
          <Tag size={14} className="text-[var(--color-slowrun)] shrink-0" />
          <span className="flex-1">
            <strong>{TAG_FILTER_LABEL[tagFilter] ?? tagFilter}</strong> 관련 상품만 표시 중입니다.
          </span>
          <button
            onClick={() => setTagFilter(null)}
            className="text-[12px] text-[var(--color-primary)] font-medium hover:underline shrink-0"
          >
            전체 보기
          </button>
        </div>
      )}

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
// PassProductDetail — full description + buy with discount UI.
// ─────────────────────────────────────────────────────────────────────
function PassProductDetail({ product, onClose }: { product: PassProduct; onClose: () => void }) {
  const { sessionTags } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [useMileage, setUseMileage] = useState<number>(0);

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
      // 1. Ask the server to create a pending_payments row, compute discounts,
      //    and return the Toss params we need to open the SDK widget.
      const checkout = await api.payments.checkout(product.id, {
        couponCode: couponCode.trim() || undefined,
        useMileage: useMileage > 0 ? useMileage : undefined,
      });

      // PR-C3: 0원 무료 패스는 서버에서 즉시 발급되어 free=true로 응답.
      // Toss SDK를 우회하고 곧장 success 페이지로 이동한다.
      if (checkout.free) {
        const base = window.location.origin;
        window.location.href = `${base}/payments/success?orderId=${encodeURIComponent(
          checkout.orderId
        )}&free=1`;
        return;
      }

      if (!checkout.tossClientKey) {
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

      // 3. Open the standard payment widget. Uses the already-discounted amount.
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
          <span className="price-num">{formatPrice(product.price)}</span>
          <span className="text-[12px] text-[var(--color-text-muted)]">
            · {product.totalCount ? `${product.totalCount}회` : `${product.durationDays}일`}
          </span>
        </div>

        {/* ── PR-DISCOUNT: 멤버십 할인 안내 ── */}
        <MembershipDiscountBanner />

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

        {/* ── PR-DISCOUNT: 쿠폰 코드 입력 ── */}
        <div className="border border-[var(--color-border)] rounded p-3">
          <h3 className="text-[12.5px] font-semibold text-[var(--color-text-secondary)] mb-2 flex items-center gap-1.5">
            <Ticket size={14} /> 쿠폰 코드
          </h3>
          <input
            type="text"
            value={couponCode}
            onChange={e => setCouponCode(e.target.value)}
            placeholder="쿠폰 코드를 입력하세요"
            className="w-full h-9 px-3 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]"
            disabled={busy}
          />
        </div>

        {/* ── PR-DISCOUNT: 적립금 사용 ── */}
        <div className="border border-[var(--color-border)] rounded p-3">
          <h3 className="text-[12.5px] font-semibold text-[var(--color-text-secondary)] mb-2 flex items-center gap-1.5">
            <Coins size={14} /> 적립금 사용
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={useMileage || ''}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                setUseMileage(isNaN(v) || v < 0 ? 0 : Math.floor(v / 1000) * 1000);
              }}
              placeholder="0"
              step={1000}
              min={0}
              className="flex-1 h-9 px-3 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]"
              disabled={busy}
            />
            <span className="text-[12px] text-[var(--color-text-muted)] shrink-0">원 (1,000원 단위)</span>
          </div>
        </div>

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
          {busy ? (
            <><Loader2 size={14} className="animate-spin" /> {product.price === 0 ? '발급 중…' : '결제창 여는 중…'}</>
          ) : product.price === 0 ? (
            <><ShoppingBag size={14} /> 무료로 발급받기</>
          ) : (
            <><ShoppingBag size={14} /> {formatPrice(product.price)} 결제하기</>
          )}
        </button>
      </div>
    </Modal>
  );
}

// ── PR-DISCOUNT: 멤버십 할인 안내 배너 ──
// 멤버십(활성/일시정지 수강권) 보유자에게 10% 할인 혜택 안내.
function MembershipDiscountBanner() {
  const { memberPasses } = useApp();
  const hasMembership = useMemo(
    () => memberPasses.some(p => p.status === 'active' || p.status === 'paused'),
    [memberPasses]
  );
  if (hasMembership) {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded">
        <Tag size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
        <div className="text-[12.5px] text-green-800">
          <p className="font-semibold">멤버십 10% 할인 적용 중</p>
          <p className="text-green-700 mt-0.5">
            현재 멤버십이 활성 상태입니다. 아래 모든 전문 클래스를 결제 시 10% 자동 할인된 가격으로 구매하실 수 있습니다.
          </p>
        </div>
      </div>
    );
  }
  // 미보유자에게는 "런클럽 가입 → 전 상품 10% 할인" funnel 안내.
  return (
    <button
      onClick={() => {
        try { sessionStorage.setItem('slowrun:catalogFilter', 'runclub'); } catch { /* noop */ }
        window.dispatchEvent(new CustomEvent('member:navigate', { detail: 'membership' }));
      }}
      className="w-full flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded text-left transition-colors hover:bg-amber-100"
    >
      <Tag size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
      <div className="text-[12.5px] text-amber-900 flex-1">
        <p className="font-semibold">월 10,000원 런클럽 멤버십으로 모든 클래스 10% 할인받기 →</p>
        <p className="text-amber-800 mt-0.5">
          런클럽 멤버십(월 10,000원) 하나만 보유하면, 아래 모든 전문 클래스를 결제 시 상시 10% 할인된 가격으로 수강할 수 있습니다.
        </p>
      </div>
    </button>
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
