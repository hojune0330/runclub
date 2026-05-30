'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Search, X, Check, AlertCircle, Ticket, Calendar, CheckCircle2,
  Edit3, EyeOff, Eye, Trash2, Sparkles, ChevronRight, Wallet, FileText,
  Star, Clock, Pencil, Save, Coins, RotateCcw, ArrowRightCircle, Info,
  CreditCard, RefreshCw, TrendingUp, AlertTriangle, Loader2, ExternalLink,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig, passStatusConfig } from '@/lib/config';
import { formatKoreanDate, formatPrice, cn, getDaysUntilExpiry, isPassExpiringSoon } from '@/lib/utils';
import { Tabs, Badge, Modal, FormField, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import type { Member, PassProduct, MemberPass, SessionType } from '@/types';

// ─────────────────────────────────────────────────────────────────────
// PR-6: PassManagement
//
// Two tabs:
//   1) "수강권 상품" — full catalog CRUD (admin) with rich detail
//   2) "발급 내역"   — issued passes with extend/adjust/refund/payment/memo
//
// All list states are derived from useApp() which already polls the API.
// Mutations call AppContext actions (which call api.ts).
// ─────────────────────────────────────────────────────────────────────

const passCategoryLabel = (c: PassProduct['category']) =>
  c === 'count' ? '횟수권' : c === 'season' ? '시즌권' : '월권';

const passCategoryHelp = (c: PassProduct['category']) =>
  c === 'count'
    ? '예약·출석 1회당 1회 차감되며, 횟수가 모두 소진되거나 이용 기간이 끝나면 만료됩니다.'
    : c === 'season'
    ? '이용 기간 동안 횟수 제한 없이 자유롭게 예약할 수 있습니다.'
    : '한 달 단위로 갱신되는 정기권입니다.';

const paymentStatusLabel: Record<string, string> = {
  unpaid: '미결제', paid: '결제완료', refunded: '환불', partial_refund: '부분환불',
};
const paymentStatusTone: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  unpaid: 'warning', paid: 'success', refunded: 'danger', partial_refund: 'danger',
};
const paymentMethodLabel: Record<string, string> = {
  cash: '현금', transfer: '계좌이체', card: '수기 카드',
  kakaopay: '카카오페이', tosspay: '토스페이', naverpay: '네이버페이',
  toss: '토스페이먼츠', manual: '외부결제', free: '무료',
};

type Tab = 'products' | 'issued' | 'payments';

export default function PassManagement() {
  const {
    passProducts, memberPasses, members,
    issueMemberPass, pauseMemberPass, resumeMemberPass, refundMemberPass,
    extendMemberPass, adjustMemberPass, setMemberPassPayment, setMemberPassMemo,
    createPassProduct, updatePassProduct, deactivatePassProduct, deletePassProduct,
  } = useApp();
  const notify = useToast();

  const [tab, setTab] = useState<Tab>('products');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'expiring' | 'unpaid'>('all');
  const [search, setSearch] = useState('');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [productEdit, setProductEdit] = useState<PassProduct | null>(null);
  const [productCreate, setProductCreate] = useState(false);
  const [productDetail, setProductDetail] = useState<PassProduct | null>(null);
  const [passDetail, setPassDetail] = useState<MemberPass | null>(null);
  const [refundTarget, setRefundTarget] = useState<MemberPass | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const filteredPasses = useMemo(() => {
    return memberPasses
      .filter(p => {
        if (statusFilter === 'active') return p.status === 'active';
        if (statusFilter === 'expired') return p.status === 'expired';
        if (statusFilter === 'expiring') return p.status === 'active' && isPassExpiringSoon(p, 7);
        if (statusFilter === 'unpaid') return p.paymentStatus === 'unpaid' || !p.paymentStatus;
        return true;
      })
      .filter(p => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (p.memberName || '').toLowerCase().includes(q) ||
          (p.productName || '').toLowerCase().includes(q) ||
          (p.transactionId || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.issuedDate.localeCompare(a.issuedDate));
  }, [memberPasses, statusFilter, search]);

  // Live, fresh references from context whenever the lists change.
  const refreshedDetail: PassProduct | null = useMemo(() => {
    if (!productDetail) return null;
    return passProducts.find(p => p.id === productDetail.id) ?? null;
  }, [productDetail, passProducts]);
  const refreshedPass: MemberPass | null = useMemo(() => {
    if (!passDetail) return null;
    return memberPasses.find(p => p.id === passDetail.id) ?? null;
  }, [passDetail, memberPasses]);

  return (
    <div className="max-w-[1400px] space-y-5">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="page-title">수강권 관리</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
            수강권 상품과 회원별 발급 내역을 관리합니다.
          </p>
        </div>
        <button
          onClick={() => {
            if (tab === 'issued') setShowIssueModal(true);
            else setProductCreate(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <Plus size={15} />
          {tab === 'products' ? '상품 추가' : '수강권 발급'}
        </button>
      </div>

      <div className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <Tabs<Tab>
          tabs={[
            { id: 'products', label: '수강권 상품', count: passProducts.length },
            { id: 'issued', label: '발급 내역', count: memberPasses.length },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'payments' ? (
          <PaymentsMonitorPanel />
        ) : tab === 'products' ? (
          <ProductsTable
            products={passProducts}
            memberPasses={memberPasses}
            onSelect={p => setProductDetail(p)}
            onEdit={p => setProductEdit(p)}
            onToggleActive={async (p) => {
              if (p.isActive) {
                if (confirm(`'${p.name}'을(를) 판매 중단하시겠습니까?\n이미 발급된 수강권은 그대로 유지됩니다.`)) {
                  await deactivatePassProduct(p.id);
                  setToast('판매가 중단되었습니다.');
                }
              } else {
                await updatePassProduct(p.id, { isActive: true });
                setToast('판매가 재개되었습니다.');
              }
            }}
            onDelete={async (p) => {
              const issuedCount = memberPasses.filter(mp => mp.productId === p.id).length;
              if (issuedCount > 0) {
                notify.warning(
                  `발급 이력이 ${issuedCount}건 있어 영구 삭제할 수 없어요`,
                  '대신 "판매 중단"을 사용해주세요.'
                );
                return;
              }
              if (confirm(`'${p.name}'을(를) 영구 삭제하시겠습니까?`)) {
                const ok = await deletePassProduct(p.id, true);
                if (ok) setToast('상품이 영구 삭제되었습니다.');
              }
            }}
          />
        ) : (
          <>
            {/* Filter bar */}
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-3 flex-wrap bg-white">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="회원명, 수강권, 거래ID"
                  className="pl-8 pr-3 py-1.5 text-[13px] border border-[var(--color-border)] rounded w-[260px] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <div className="h-4 w-px bg-[var(--color-border)]" />
              <div className="flex items-center gap-1">
                <span className="text-[12px] text-[var(--color-text-muted)] mr-1">상태</span>
                {([
                  { id: 'all', label: '전체' },
                  { id: 'active', label: '사용중' },
                  { id: 'expiring', label: '만료 임박' },
                  { id: 'expired', label: '만료' },
                  { id: 'unpaid', label: '미결제' },
                ] as const).map(f => (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    className={cn(
                      "px-2.5 py-1 text-[12px] rounded border transition-colors",
                      statusFilter === f.id
                        ? "bg-[var(--color-text)] text-white border-[var(--color-text)]"
                        : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <span className="text-[12px] text-[var(--color-text-muted)]">{filteredPasses.length}건</span>
            </div>

            <PassesTable
              passes={filteredPasses}
              total={memberPasses.length}
              onIssueClick={() => setShowIssueModal(true)}
              onSelect={p => setPassDetail(p)}
              onPause={async (id) => { if (confirm('정지 처리하시겠습니까?')) { await pauseMemberPass(id); setToast('수강권이 일시정지되었습니다.'); } }}
              onResume={async (id) => { await resumeMemberPass(id); setToast('수강권이 재개되었습니다.'); }}
              onRefund={(id) => {
                const target = memberPasses.find(p => p.id === id) ?? null;
                if (target) setRefundTarget(target);
              }}
            />
          </>
        )}
      </div>

      {/* Issue modal */}
      {showIssueModal && (
        <IssuePassModal
          members={members}
          products={passProducts}
          existingPasses={memberPasses}
          onClose={() => setShowIssueModal(false)}
          onIssue={async (memberId, productId, opts) => {
            const r = await issueMemberPass(memberId, productId, opts);
            if (r) {
              setShowIssueModal(false);
              setTab('issued');
              const m = members.find(x => x.id === memberId);
              const p = passProducts.find(x => x.id === productId);
              setToast(`${m?.name ?? '회원'}님에게 ${p?.name ?? '수강권'}을(를) 발급했습니다.`);
            }
          }}
        />
      )}

      {/* Create / edit product modal */}
      {(productCreate || productEdit) && (
        <ProductFormModal
          product={productEdit}
          onClose={() => { setProductCreate(false); setProductEdit(null); }}
          onSubmit={async (data) => {
            if (productEdit) {
              const ok = await updatePassProduct(productEdit.id, data);
              if (ok) { setToast('상품이 수정되었습니다.'); setProductEdit(null); }
            } else {
              const r = await createPassProduct(data);
              if (r) { setToast('상품이 추가되었습니다.'); setProductCreate(false); }
            }
          }}
        />
      )}

      {/* Product detail */}
      {refreshedDetail && (
        <ProductDetailModal
          product={refreshedDetail}
          memberPasses={memberPasses}
          onClose={() => setProductDetail(null)}
          onEdit={() => { setProductEdit(refreshedDetail); setProductDetail(null); }}
        />
      )}

      {/* Pass detail */}
      {refreshedPass && (
        <PassDetailModal
          pass={refreshedPass}
          onClose={() => setPassDetail(null)}
          onExtend={async (params) => { const ok = await extendMemberPass(refreshedPass.id, params); if (ok) setToast('만료일이 변경되었습니다.'); return ok; }}
          onAdjust={async (params) => { const ok = await adjustMemberPass(refreshedPass.id, params); if (ok) setToast('횟수가 조정되었습니다.'); return ok; }}
          onPayment={async (params) => { const ok = await setMemberPassPayment(refreshedPass.id, params); if (ok) setToast('결제 정보가 변경되었습니다.'); return ok; }}
          onMemo={async (memo) => { const ok = await setMemberPassMemo(refreshedPass.id, memo); if (ok) setToast('관리자 메모가 저장되었습니다.'); return ok; }}
          onPause={async () => { await pauseMemberPass(refreshedPass.id); setToast('수강권이 일시정지되었습니다.'); }}
          onResume={async () => { await resumeMemberPass(refreshedPass.id); setToast('수강권이 재개되었습니다.'); }}
          onRefund={() => { setRefundTarget(refreshedPass); }}
        />
      )}

      {/* PR-6 STEP 5: Refund modal — Toss cancel + partial refund */}
      {refundTarget && (
        <RefundModal
          pass={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSubmit={async (params) => {
            const ok = await refundMemberPass(refundTarget.id, params);
            if (ok) {
              const isPartial = params.cancelAmount != null && params.cancelAmount > 0 &&
                refundTarget.paymentAmount != null && params.cancelAmount < refundTarget.paymentAmount;
              setToast(isPartial ? '부분 환불이 처리되었습니다.' : '수강권이 환불 처리되었습니다.');
              setRefundTarget(null);
              setPassDetail(null);
            }
            return ok;
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 -translate-x-1/2 bottom-[88px] md:bottom-6 z-[70] flex items-center gap-2 px-4 py-2.5 bg-[var(--color-text)] text-white text-[13px] rounded-full shadow-lg animate-fade-in"
        >
          <CheckCircle2 size={15} />
          <span className="max-w-[80vw] truncate">{toast}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ProductsTable — admin view of pass_products with action buttons.
// ─────────────────────────────────────────────────────────────────────
function ProductsTable({
  products, memberPasses, onSelect, onEdit, onToggleActive, onDelete,
}: {
  products: PassProduct[];
  memberPasses: MemberPass[];
  onSelect: (p: PassProduct) => void;
  onEdit: (p: PassProduct) => void;
  onToggleActive: (p: PassProduct) => void | Promise<void>;
  onDelete: (p: PassProduct) => void | Promise<void>;
}) {
  // 9컬럼 테이블을 모바일에서 가로 스크롤만 강제하면 셀 안 단어가 글자 단위로
  // 줄바꿈돼 행 높이가 폭발한다. 모바일은 카드, sm 이상은 테이블로 분기.
  if (products.length === 0) {
    return (
      <div className="py-12 px-6 text-center text-[13px] text-[var(--color-text-muted)]">
        등록된 상품이 없습니다. 상단의 “상품 추가” 버튼을 눌러 첫 상품을 추가하세요.
      </div>
    );
  }

  return (
    <>
      {/* ── Mobile: 카드 리스트 ── */}
      <ul className="sm:hidden divide-y divide-[var(--color-border-subtle)]">
        {products.map(p => {
          const applicableLabels = p.applicableSessions === 'all'
            ? '전체 세션'
            : (p.applicableSessions as SessionType[]).map(s => sessionTypeConfig[s]?.label ?? s).join(', ');
          const activeCount = memberPasses.filter(mp => mp.productId === p.id && mp.status === 'active').length;
          const totalIssued = memberPasses.filter(mp => mp.productId === p.id).length;
          const hasDiscount = p.originalPrice && p.originalPrice > p.price;
          return (
            <li key={p.id} className="px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.isFeatured && (
                      <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                        <Star size={9} /> 추천
                      </span>
                    )}
                    <span className="text-[14px] font-semibold text-[var(--color-text)] truncate">{p.name}</span>
                  </div>
                  {p.description && (
                    <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5 truncate">{p.description}</p>
                  )}
                </button>
                {p.isActive
                  ? <Badge tone="success" className="shrink-0">판매중</Badge>
                  : <Badge tone="muted" className="shrink-0">중단</Badge>}
              </div>

              {/* 메타 한 줄 — 분류 · 대상 · 수량/기간 */}
              <p className="text-[12px] text-[var(--color-text-secondary)] mt-1.5 truncate">
                {passCategoryLabel(p.category)} · {applicableLabels} · {p.totalCount ? `${p.totalCount}회` : `${p.durationDays}일`}
              </p>

              {/* 가격/사용중 + 액션 — 같은 줄에 우측 정렬 */}
              <div className="flex items-center justify-between gap-2 mt-2">
                <div className="min-w-0">
                  {hasDiscount && (
                    <span className="text-[11px] text-[var(--color-text-muted)] line-through tabular-nums mr-1.5">
                      {formatPrice(p.originalPrice!)}
                    </span>
                  )}
                  <span className="text-[14px] font-semibold text-[var(--color-text)] tabular-nums">{formatPrice(p.price)}</span>
                  <span className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums ml-1.5">· 사용 {activeCount}/{totalIssued}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onEdit(p)}
                    aria-label="수정"
                    className="inline-flex items-center justify-center w-8 h-8 text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-subtle)]"
                  ><Pencil size={13} /></button>
                  <button
                    onClick={() => onToggleActive(p)}
                    aria-label={p.isActive ? '판매 중단' : '판매 재개'}
                    className="inline-flex items-center justify-center w-8 h-8 text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-subtle)]"
                  >
                    {p.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  {totalIssued === 0 && (
                    <button
                      onClick={() => onDelete(p)}
                      aria-label="삭제"
                      className="inline-flex items-center justify-center w-8 h-8 text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded hover:bg-[var(--color-danger-bg)]"
                    ><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ── Desktop (sm+): 테이블 ── */}
      <div className="hidden sm:block scroll-x">
        <table className="responsive-table" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
              <th className="text-left font-medium px-4 py-2.5 w-[60px]">정렬</th>
              <th className="text-left font-medium px-4 py-2.5 w-[200px]">상품명</th>
              <th className="text-left font-medium px-4 py-2.5 w-[100px]">분류</th>
              <th className="text-left font-medium px-4 py-2.5 w-[160px]">이용 가능 세션</th>
              <th className="text-center font-medium px-4 py-2.5 w-[90px]">횟수/기간</th>
              <th className="text-right font-medium px-4 py-2.5 w-[130px]">가격</th>
              <th className="text-center font-medium px-4 py-2.5 w-[90px]">사용중</th>
              <th className="text-center font-medium px-4 py-2.5 w-[90px]">상태</th>
              <th className="text-right font-medium px-4 py-2.5 w-[180px]">관리</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => {
              const applicableLabels = p.applicableSessions === 'all'
                ? '전체 세션'
                : (p.applicableSessions as SessionType[]).map(s => sessionTypeConfig[s]?.label ?? s).join(', ');
              const activeCount = memberPasses.filter(mp => mp.productId === p.id && mp.status === 'active').length;
              const totalIssued = memberPasses.filter(mp => mp.productId === p.id).length;
              const hasDiscount = p.originalPrice && p.originalPrice > p.price;
              return (
                <tr key={p.id} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)]">
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)] tabular-nums">{p.displayOrder ?? 0}</td>
                  <td className="px-4 py-2.5 max-w-[200px]">
                    <button
                      type="button"
                      onClick={() => onSelect(p)}
                      className="text-left text-[var(--color-text)] font-medium hover:underline truncate block max-w-full"
                      title={p.name}
                    >
                      {p.name}
                    </button>
                    <div className="flex items-center gap-1 mt-0.5">
                      {p.isFeatured && (
                        <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          <Star size={9} /> 추천
                        </span>
                      )}
                      {p.description && (
                        <span className="text-[11px] text-[var(--color-text-muted)] truncate max-w-[260px]">{p.description}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{passCategoryLabel(p.category)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-secondary)] max-w-[160px] truncate" title={applicableLabels}>{applicableLabels}</td>
                  <td className="px-4 py-2.5 text-center text-[var(--color-text-secondary)] tabular-nums">
                    {p.totalCount ? `${p.totalCount}회` : `${p.durationDays}일`}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {hasDiscount && (
                      <div className="text-[11px] text-[var(--color-text-muted)] line-through">{formatPrice(p.originalPrice!)}</div>
                    )}
                    <div className="text-[var(--color-text)] font-medium">{formatPrice(p.price)}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-[var(--color-text-secondary)] tabular-nums">
                    {activeCount} <span className="text-[var(--color-text-muted)]">/ {totalIssued}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {p.isActive ? <Badge tone="success">판매중</Badge> : <Badge tone="muted">중단</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(p)}
                        className="px-2 py-0.5 text-[11.5px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-subtle)]"
                      ><Pencil size={11} className="inline mr-0.5" />수정</button>
                      <button
                        onClick={() => onToggleActive(p)}
                        className="px-2 py-0.5 text-[11.5px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-subtle)]"
                      >
                        {p.isActive ? <><EyeOff size={11} className="inline mr-0.5" />중단</> : <><Eye size={11} className="inline mr-0.5" />재개</>}
                      </button>
                      {totalIssued === 0 && (
                        <button
                          onClick={() => onDelete(p)}
                          className="px-2 py-0.5 text-[11.5px] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded hover:bg-[var(--color-danger-bg)]"
                        ><Trash2 size={11} className="inline mr-0.5" />삭제</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PassesTable — issued passes view.
// ─────────────────────────────────────────────────────────────────────
function PassesTable({
  passes, total, onIssueClick, onSelect, onPause, onResume, onRefund,
}: {
  passes: MemberPass[];
  total: number;
  onIssueClick: () => void;
  onSelect: (p: MemberPass) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRefund: (id: string) => void;
}) {
  // 8컬럼 테이블도 모바일에선 가로 스크롤로 강제하면 셀이 글자단위로 줄바꿈된다.
  // 모바일은 카드 / sm 이상은 테이블로 분기.
  if (passes.length === 0) {
    return (
      <div className="py-12 px-6 text-center">
        <p className="text-[13px] text-[var(--color-text-muted)]">조건에 맞는 수강권이 없습니다.</p>
        {total === 0 && (
          <button
            onClick={onIssueClick}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-primary)] border border-[var(--color-primary)]/30 rounded hover:bg-[var(--color-primary)]/10"
          >
            <Plus size={13} /> 첫 수강권 발급하기
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {/* ── Mobile: 카드 리스트 ── */}
      <ul className="sm:hidden divide-y divide-[var(--color-border-subtle)]">
        {passes.map(p => {
          const daysLeft = getDaysUntilExpiry(p);
          const expiring = isPassExpiringSoon(p, 7);
          const ps = p.paymentStatus ?? 'unpaid';
          return (
            <li key={p.id} className="px-3 py-3" onClick={() => onSelect(p)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[14px] font-semibold text-[var(--color-text)] truncate">{p.memberName}</span>
                    {p.status === 'active' ? (
                      expiring
                        ? <Badge tone="warning" className="shrink-0">D-{daysLeft}</Badge>
                        : <Badge tone="success" className="shrink-0">사용중</Badge>
                    ) : (
                      <Badge tone="muted" className="shrink-0">{passStatusConfig[p.status]?.label ?? p.status}</Badge>
                    )}
                  </div>
                  <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5 truncate">{p.productName}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge tone={paymentStatusTone[ps] ?? 'muted'}>{paymentStatusLabel[ps] ?? ps}</Badge>
                  {p.paymentMethod && (
                    <div className="text-[10.5px] text-[var(--color-text-muted)] mt-0.5">
                      {paymentMethodLabel[p.paymentMethod] ?? p.paymentMethod}
                    </div>
                  )}
                </div>
              </div>

              {/* 메타 — 잔여 / 기간 / 가격 */}
              <p className="text-[12px] text-[var(--color-text-muted)] mt-1.5 tabular-nums truncate">
                {p.category === 'count' && `${p.remainingCount}/${p.totalCount}회 · `}
                {formatKoreanDate(p.startDate, 'yy.M.d')} — {formatKoreanDate(p.expiryDate, 'yy.M.d')}
                {' · '}
                <span className="text-[var(--color-text)] font-medium">{formatPrice(p.paymentAmount ?? p.price ?? 0)}</span>
              </p>

              {/* 액션 — 같은 줄에 우측 정렬 */}
              {(p.status === 'active' || p.status === 'paused') && (
                <div className="flex items-center justify-end gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                  {p.status === 'active' ? (
                    <>
                      <button
                        onClick={() => onPause(p.id)}
                        className="px-2.5 py-1 text-[12px] text-[var(--color-warning)] border border-[var(--color-warning-border)] rounded hover:bg-[var(--color-warning-bg)]"
                      >정지</button>
                      <button
                        onClick={() => onRefund(p.id)}
                        className="px-2.5 py-1 text-[12px] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded hover:bg-[var(--color-danger-bg)]"
                      >환불</button>
                    </>
                  ) : (
                    <button
                      onClick={() => onResume(p.id)}
                      className="px-2.5 py-1 text-[12px] text-[var(--color-primary)] border border-[var(--color-primary)]/30 rounded hover:bg-[var(--color-primary)]/10"
                    >재개</button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* ── Desktop (sm+): 테이블 ── */}
      <div className="hidden sm:block scroll-x">
        <table className="responsive-table" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
              <th className="text-left font-medium px-4 py-2.5 w-[110px]">회원명</th>
              <th className="text-left font-medium px-4 py-2.5 w-[180px]">수강권</th>
              <th className="text-left font-medium px-4 py-2.5 w-[100px]">잔여</th>
              <th className="text-left font-medium px-4 py-2.5 w-[180px]">이용 기간</th>
              <th className="text-right font-medium px-4 py-2.5 w-[100px]">가격</th>
              <th className="text-center font-medium px-4 py-2.5 w-[110px]">결제</th>
              <th className="text-center font-medium px-4 py-2.5 w-[100px]">상태</th>
              <th className="text-right font-medium px-4 py-2.5 w-[160px]">처리</th>
            </tr>
          </thead>
          <tbody>
            {passes.map(p => {
              const daysLeft = getDaysUntilExpiry(p);
              const expiring = isPassExpiringSoon(p, 7);
              const ps = p.paymentStatus ?? 'unpaid';
              return (
                <tr key={p.id} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)] cursor-pointer" onClick={() => onSelect(p)}>
                  <td className="px-4 py-2.5 text-[var(--color-text)] font-medium">{p.memberName}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-secondary)] max-w-[180px] truncate" title={p.productName}>{p.productName}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-secondary)] tabular-nums">
                    {p.category === 'count' ? `${p.remainingCount} / ${p.totalCount}회` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-secondary)] tabular-nums">
                    {formatKoreanDate(p.startDate, 'yyyy.M.d')} — {formatKoreanDate(p.expiryDate, 'yyyy.M.d')}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-text)] tabular-nums">
                    {formatPrice(p.paymentAmount ?? p.price ?? 0)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge tone={paymentStatusTone[ps] ?? 'muted'}>{paymentStatusLabel[ps] ?? ps}</Badge>
                    {p.paymentMethod && (
                      <div className="text-[10.5px] text-[var(--color-text-muted)] mt-0.5">
                        {paymentMethodLabel[p.paymentMethod] ?? p.paymentMethod}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {p.status === 'active' ? (
                      expiring ? <Badge tone="warning">D-{daysLeft}</Badge> : <Badge tone="success">사용중</Badge>
                    ) : (
                      <Badge tone="muted">{passStatusConfig[p.status]?.label ?? p.status}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    {p.status === 'active' ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onPause(p.id)}
                          className="px-2 py-0.5 text-[11.5px] text-[var(--color-warning)] border border-[var(--color-warning-border)] rounded hover:bg-[var(--color-warning-bg)] transition-colors"
                        >정지</button>
                        <button
                          onClick={() => onRefund(p.id)}
                          className="px-2 py-0.5 text-[11.5px] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded hover:bg-[var(--color-danger-bg)] transition-colors"
                        >환불</button>
                      </div>
                    ) : p.status === 'paused' ? (
                      <button
                        onClick={() => onResume(p.id)}
                        className="px-2 py-0.5 text-[11.5px] text-[var(--color-primary)] border border-[var(--color-primary)]/30 rounded hover:bg-[var(--color-primary)]/10"
                      >재개</button>
                    ) : (
                      <span className="text-[var(--color-text-disabled)] text-[11.5px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// IssuePassModal — admin issues a pass with optional payment envelope.
// ─────────────────────────────────────────────────────────────────────
function IssuePassModal({
  members, products, existingPasses, onClose, onIssue,
}: {
  members: Member[];
  products: PassProduct[];
  existingPasses: MemberPass[];
  onClose: () => void;
  onIssue: (memberId: string, productId: string, opts?: any) => Promise<void>;
}) {
  const [memberQuery, setMemberQuery] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'paid'>('unpaid');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [discountAmount, setDiscountAmount] = useState<string>('0');
  const [discountReason, setDiscountReason] = useState<string>('');
  const [adminMemo, setAdminMemo] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const eligibleMembers = useMemo(
    () => members.filter(m => m.role !== 'admin').filter(m => m.isActive !== false),
    [members]
  );
  const memberOptions = useMemo(() => {
    const q = memberQuery.trim();
    const list = !q
      ? eligibleMembers
      : eligibleMembers.filter(m =>
          m.name.includes(q) || m.phone.replace(/-/g, '').includes(q.replace(/-/g, ''))
        );
    return list.slice(0, 50);
  }, [eligibleMembers, memberQuery]);

  const groupedProducts = useMemo(() => {
    const onSale = products.filter(p => p.isActive);
    const buckets: Record<PassProduct['category'], PassProduct[]> = { count: [], season: [], monthly: [] };
    for (const p of onSale) buckets[p.category].push(p);
    (Object.keys(buckets) as PassProduct['category'][]).forEach(k => {
      buckets[k].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.price - b.price);
    });
    return buckets;
  }, [products]);

  const totalProductCount = groupedProducts.count.length + groupedProducts.season.length + groupedProducts.monthly.length;
  const selectedMember = memberId ? members.find(m => m.id === memberId) ?? null : null;
  const selectedProduct = productId ? products.find(p => p.id === productId) ?? null : null;

  const discountNum = Math.max(0, Number(discountAmount) || 0);
  const finalPrice = selectedProduct ? Math.max(0, selectedProduct.price - discountNum) : 0;

  const duplicateActive = useMemo(() => {
    if (!memberId || !productId) return false;
    return existingPasses.some(p => p.memberId === memberId && p.productId === productId && p.status === 'active');
  }, [existingPasses, memberId, productId]);

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const startStr = `${yyyy}-${mm}-${dd}`;
  const expiryDate = selectedProduct ? new Date(today.getTime() + selectedProduct.durationDays * 86400000) : null;
  const expiryStr = expiryDate
    ? `${expiryDate.getFullYear()}-${String(expiryDate.getMonth() + 1).padStart(2, '0')}-${String(expiryDate.getDate()).padStart(2, '0')}`
    : null;

  const handleSubmit = async () => {
    if (!memberId || !productId || !selectedProduct) return;
    if (duplicateActive) {
      const ok = confirm('이 회원은 이미 같은 상품의 사용중 수강권을 보유하고 있습니다.\n그래도 추가로 발급하시겠습니까?');
      if (!ok) return;
    }
    setError(null); setSubmitting(true);
    try {
      await onIssue(memberId, productId, {
        paymentStatus,
        paymentMethod: paymentStatus === 'paid' ? paymentMethod : undefined,
        paymentAmount: finalPrice,
        discountAmount: discountNum,
        discountReason: discountReason.trim() || undefined,
        adminMemo: adminMemo.trim() || undefined,
      });
    } catch (e: any) {
      setError(e?.message || '수강권 발급에 실패했습니다');
    } finally { setSubmitting(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center md:items-center justify-center p-0 md:p-4"
      onClick={onClose} role="dialog" aria-modal="true"
    >
      <div
        className="w-full md:max-w-[640px] max-h-[100dvh] md:max-h-[92vh] bg-white md:rounded-lg shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-[16px] font-semibold text-[var(--color-text)]">수강권 발급</h2>
          <button type="button" onClick={onClose} className="w-9 h-9 inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4 space-y-4">
          {/* Step 1: member */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[13px] font-medium text-[var(--color-text)]">1. 회원 선택</label>
              {selectedMember && (
                <button type="button" onClick={() => { setMemberId(null); setMemberQuery(''); }} className="text-[12px] text-[var(--color-text-muted)] hover:underline">변경</button>
              )}
            </div>
            {selectedMember ? (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded">
                <span className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] inline-flex items-center justify-center text-[13px] font-semibold">{selectedMember.name[0]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-[var(--color-text)] truncate">{selectedMember.name}</p>
                  <p className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums">{selectedMember.phone}</p>
                </div>
                <Check size={16} className="text-[var(--color-success)]" />
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    type="text" value={memberQuery} onChange={e => setMemberQuery(e.target.value)}
                    placeholder="이름 또는 전화번호로 검색" autoFocus
                    className="w-full pl-8 pr-3 h-10 text-[16px] md:text-[13.5px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div className="mt-2 max-h-[200px] overflow-y-auto border border-[var(--color-border)] rounded">
                  {memberOptions.length === 0 ? (
                    <p className="py-6 text-center text-[12.5px] text-[var(--color-text-muted)]">회원이 없습니다.</p>
                  ) : (
                    memberOptions.map(m => (
                      <button key={m.id} type="button" onClick={() => setMemberId(m.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-bg-subtle)] border-b border-[var(--color-border-subtle)] last:border-0">
                        <span className="w-7 h-7 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] inline-flex items-center justify-center text-[12px] font-semibold">{m.name[0]}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-medium text-[var(--color-text)] truncate">{m.name}</span>
                          <span className="block text-[11.5px] text-[var(--color-text-muted)] tabular-nums">{m.phone}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Step 2: product */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-text)] mb-1.5">2. 수강권 상품</label>
            {totalProductCount === 0 ? (
              <p className="px-3 py-3 text-[12.5px] text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] rounded">판매중인 상품이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {(['count', 'season', 'monthly'] as const).map(cat => {
                  const list = groupedProducts[cat];
                  if (list.length === 0) return null;
                  return (
                    <div key={cat}>
                      <p className="text-[11px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider mb-1">{passCategoryLabel(cat)}</p>
                      <div className="space-y-1.5">
                        {list.map(p => {
                          const selected = productId === p.id;
                          const apply = p.applicableSessions === 'all'
                            ? '전체 세션'
                            : (p.applicableSessions as SessionType[]).map(s => sessionTypeConfig[s]?.label).filter(Boolean).join(' · ');
                          const perUse = p.totalCount && p.totalCount > 0 ? Math.round(p.price / p.totalCount) : null;
                          return (
                            <button key={p.id} type="button" onClick={() => setProductId(p.id)}
                              className={cn(
                                'w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left rounded border transition-colors',
                                selected ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]/20' : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
                              )}>
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-medium text-[var(--color-text)] truncate">
                                  {p.isFeatured && <Star size={11} className="inline mr-1 text-amber-500" />}
                                  {p.name}
                                </p>
                                <p className="text-[11.5px] text-[var(--color-text-muted)] truncate">
                                  {apply} · {p.totalCount ? `${p.totalCount}회` : `${p.durationDays}일`}{perUse && ` · 회당 ${formatPrice(perUse)}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[13px] font-semibold text-[var(--color-text)] tabular-nums">{formatPrice(p.price)}</span>
                                {selected && <Check size={14} className="text-[var(--color-primary)]" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3: payment */}
          {selectedProduct && (
            <div className="space-y-3 border-t border-[var(--color-border)] pt-3">
              <label className="block text-[13px] font-medium text-[var(--color-text)]">3. 결제 정보</label>
              <div className="flex items-center gap-2">
                {(['unpaid', 'paid'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setPaymentStatus(s)}
                    className={cn(
                      'flex-1 px-3 py-2 text-[12.5px] font-medium rounded border',
                      paymentStatus === s ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
                    )}>
                    {s === 'unpaid' ? '미결제 (추후 결제)' : '결제 완료'}
                  </button>
                ))}
              </div>
              {paymentStatus === 'paid' && (
                <FormField label="결제 수단">
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]">
                    <option value="cash">현금</option>
                    <option value="transfer">계좌이체</option>
                    <option value="card">수기 카드</option>
                    <option value="kakaopay">카카오페이</option>
                    <option value="tosspay">토스페이</option>
                    <option value="naverpay">네이버페이</option>
                    <option value="manual">기타 외부결제</option>
                    <option value="free">무료 발급</option>
                  </select>
                </FormField>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="할인 금액">
                  <input type="number" min="0" max={selectedProduct.price} value={discountAmount}
                    onChange={e => setDiscountAmount(e.target.value)}
                    className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded tabular-nums focus:outline-none focus:border-[var(--color-primary)]" />
                </FormField>
                <FormField label="할인 사유 (선택)">
                  <input type="text" value={discountReason} onChange={e => setDiscountReason(e.target.value)}
                    placeholder="예: 신규회원 10%"
                    className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]" />
                </FormField>
              </div>
              <FormField label="관리자 메모 (선택)">
                <textarea value={adminMemo} onChange={e => setAdminMemo(e.target.value)} rows={2}
                  placeholder="회원에게는 보이지 않는 내부 메모"
                  className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)] resize-none" />
              </FormField>
            </div>
          )}

          {/* Preview */}
          {selectedProduct && expiryStr && (
            <div className="bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded px-3 py-2.5 space-y-1.5">
              <p className="text-[12px] text-[var(--color-text-muted)] flex items-center gap-1"><Calendar size={11} /> 발급 후 정보</p>
              <p className="text-[12.5px] text-[var(--color-text)] tabular-nums">
                <span className="text-[var(--color-text-muted)]">이용 기간: </span>{startStr} → {expiryStr}
                <span className="text-[var(--color-text-muted)]"> ({selectedProduct.durationDays}일)</span>
              </p>
              <p className="text-[12.5px] text-[var(--color-text)]">
                <span className="text-[var(--color-text-muted)]">정가: </span><span className="tabular-nums">{formatPrice(selectedProduct.price)}</span>
                {discountNum > 0 && (
                  <>
                    <span className="text-[var(--color-text-muted)]"> · 할인: </span>
                    <span className="text-[var(--color-danger)] tabular-nums">-{formatPrice(discountNum)}</span>
                  </>
                )}
                <span className="text-[var(--color-text-muted)]"> · 청구: </span>
                <span className="tabular-nums font-semibold text-[var(--color-primary)]">{formatPrice(finalPrice)}</span>
              </p>
              <p className="text-[11.5px] text-[var(--color-text-muted)] leading-relaxed">{passCategoryHelp(selectedProduct.category)}</p>
            </div>
          )}

          {duplicateActive && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded">
              <AlertCircle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-[12.5px] text-amber-900">이 회원은 이미 같은 상품의 <b>사용중</b> 수강권을 보유하고 있습니다.</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded">
              <AlertCircle size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-[12.5px] text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 md:px-5 py-3 border-t border-[var(--color-border)]">
          <button type="button" onClick={onClose} disabled={submitting}
            className="flex-1 md:flex-initial md:px-5 h-11 inline-flex items-center justify-center text-[13.5px] font-medium text-[var(--color-text)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-subtle)] disabled:opacity-50">취소</button>
          <button type="button" onClick={handleSubmit} disabled={!memberId || !productId || submitting}
            className="flex-1 md:flex-initial md:px-5 h-11 inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-muted)]">
            {submitting ? '발급 중…' : (<><Plus size={15} />발급하기</>)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ProductFormModal — create or edit a pass product (full detail).
// ─────────────────────────────────────────────────────────────────────
const SESSION_TYPES: SessionType[] = ['ebw', 'slowrun', 'marathon'];

function ProductFormModal({
  product, onClose, onSubmit,
}: {
  product: PassProduct | null;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}) {
  // PR-A: 태그 마스터를 컨텍스트에서 가져온다.
  const { sessionTags } = useApp();
  const isEdit = !!product;
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState<PassProduct['category']>(product?.category ?? 'count');
  const [applicableMode, setApplicableMode] = useState<'all' | 'select'>(
    product?.applicableSessions === 'all' || !product?.applicableSessions ? 'all' : 'select'
  );
  const [applicableTypes, setApplicableTypes] = useState<SessionType[]>(
    Array.isArray(product?.applicableSessions) ? (product?.applicableSessions as SessionType[]) : []
  );

  // PR-A: 태그 기반 매칭 (PR-C1 인프라). omnipass = '*' 한 개 태그만 들어
  // 있으면 모든 세션에 사용 가능. 그 외에는 세션 태그와 교집합으로 판정.
  // 기존 product 의 tags 가 ['*'] 이면 omnipass=true, 그 외 배열은 selected.
  const initialTags: string[] = Array.isArray(product?.tags) ? (product?.tags as string[]) : [];
  const initialOmnipass = initialTags.length === 1 && initialTags[0] === '*';
  const [omnipass, setOmnipass] = useState<boolean>(initialOmnipass);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialOmnipass ? [] : initialTags.filter(t => t !== '*')
  );
  const [totalCount, setTotalCount] = useState<string>(product?.totalCount?.toString() ?? '');
  const [durationDays, setDurationDays] = useState<string>(product?.durationDays?.toString() ?? '60');
  const [price, setPrice] = useState<string>(product?.price?.toString() ?? '');
  const [originalPrice, setOriginalPrice] = useState<string>(product?.originalPrice?.toString() ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [descriptionLong, setDescriptionLong] = useState(product?.descriptionLong ?? '');
  const [refundPolicy, setRefundPolicy] = useState(product?.refundPolicy ?? '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [displayOrder, setDisplayOrder] = useState<string>(product?.displayOrder?.toString() ?? '0');
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleType = (t: SessionType) =>
    setApplicableTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) return setError('상품명을 입력해주세요');
    const priceN = Number(price);
    if (!Number.isFinite(priceN) || priceN < 0) return setError('가격을 올바르게 입력해주세요');
    const durN = Number(durationDays);
    if (!Number.isFinite(durN) || durN <= 0) return setError('이용 기간(일)을 입력해주세요');
    let totalN: number | null = null;
    if (category === 'count') {
      totalN = Number(totalCount);
      if (!Number.isFinite(totalN) || totalN <= 0) return setError('횟수권의 횟수를 입력해주세요');
    }
    const origN = originalPrice ? Number(originalPrice) : null;
    if (origN != null && (!Number.isFinite(origN) || origN < priceN)) {
      return setError('정가는 판매가보다 같거나 커야 합니다');
    }
    if (applicableMode === 'select' && applicableTypes.length === 0) {
      return setError('이용 가능 세션을 1개 이상 선택해주세요');
    }

    // PR-A: 태그 페이로드 결정
    // - omnipass = ['*']  (모든 세션 사용 가능, OMNI_TAG)
    // - 일반    = 선택된 태그 배열 (비어 있으면 legacy applicableSessions 로 fallback)
    const tagsPayload: string[] | undefined = omnipass
      ? ['*']
      : selectedTags.length > 0
      ? selectedTags
      : undefined;

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        category,
        applicableSessions: applicableMode === 'all' ? 'all' : applicableTypes,
        tags: tagsPayload,
        totalCount: totalN,
        durationDays: durN,
        price: priceN,
        originalPrice: origN,
        description: description.trim() || null,
        descriptionLong: descriptionLong.trim() || null,
        refundPolicy: refundPolicy.trim() || null,
        imageUrl: imageUrl.trim() || null,
        displayOrder: Number(displayOrder) || 0,
        isFeatured,
        isActive,
      });
    } catch (e: any) {
      setError(e?.message || '저장 중 오류가 발생했습니다');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal title={isEdit ? '수강권 상품 수정' : '수강권 상품 추가'} onClose={onClose} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <FormField label="상품명" required>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="예: EBW 10회권"
            className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]" />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="분류" required>
            <select value={category} onChange={e => setCategory(e.target.value as any)}
              className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]">
              <option value="count">횟수권</option>
              <option value="season">시즌권</option>
              <option value="monthly">월권</option>
            </select>
          </FormField>
          <FormField label="이용 기간 (일)" required>
            <input type="number" min="1" value={durationDays} onChange={e => setDurationDays(e.target.value)}
              className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded tabular-nums focus:outline-none focus:border-[var(--color-primary)]" />
          </FormField>
        </div>

        {category === 'count' && (
          <FormField label="총 횟수" required>
            <input type="number" min="1" value={totalCount} onChange={e => setTotalCount(e.target.value)}
              className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded tabular-nums focus:outline-none focus:border-[var(--color-primary)]" />
          </FormField>
        )}

        <FormField label="이용 가능 세션 (Legacy fallback)" hint="아래 태그가 비어 있을 때만 사용됩니다">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-[12.5px] cursor-pointer">
                <input type="radio" checked={applicableMode === 'all'} onChange={() => setApplicableMode('all')} />
                전체 세션
              </label>
              <label className="inline-flex items-center gap-1.5 text-[12.5px] cursor-pointer">
                <input type="radio" checked={applicableMode === 'select'} onChange={() => setApplicableMode('select')} />
                선택
              </label>
            </div>
            {applicableMode === 'select' && (
              <div className="flex flex-wrap gap-2">
                {SESSION_TYPES.map(t => (
                  <label key={t}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded border cursor-pointer',
                      applicableTypes.includes(t) ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
                    )}>
                    <input type="checkbox" checked={applicableTypes.includes(t)} onChange={() => toggleType(t)} className="hidden" />
                    {sessionTypeConfig[t].label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </FormField>

        {/* ── PR-A: 태그 매칭 (단일 진실 공급원) ── */}
        {/* omnipass=true 면 모든 세션에 사용 가능. false 면 아래 선택된 */}
        {/* 태그와 세션 태그의 교집합으로 사용 가능 여부 판정. */}
        <FormField
          label="태그 매칭 (권장)"
          hint="omnipass 또는 선택된 태그와 매칭되는 세션에서만 사용 가능"
        >
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-[12.5px] cursor-pointer p-2 border border-[var(--color-border)] rounded bg-amber-50/40">
              <input
                type="checkbox"
                checked={omnipass}
                onChange={e => {
                  setOmnipass(e.target.checked);
                  if (e.target.checked) setSelectedTags([]);
                }}
              />
              <Sparkles size={13} className="text-amber-500" />
              <span className="font-medium">옴니패스 (모든 세션 사용 가능)</span>
            </label>
            {!omnipass && (
              <div className="flex flex-wrap gap-1.5">
                {sessionTags.filter(t => t.isActive && t.id !== '*').length === 0 ? (
                  <span className="text-[12px] text-[var(--color-text-muted)]">
                    등록된 태그가 없습니다 — 어드민 → 태그 마스터에서 먼저 추가하세요.
                  </span>
                ) : (
                  sessionTags
                    .filter(t => t.isActive && t.id !== '*')
                    .map(t => {
                      const checked = selectedTags.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            setSelectedTags(prev =>
                              checked ? prev.filter(x => x !== t.id) : [...prev, t.id]
                            )
                          }
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[12px] transition-colors',
                            checked
                              ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                              : 'bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/40'
                          )}
                          style={
                            checked && t.color
                              ? { backgroundColor: t.color, borderColor: t.color }
                              : undefined
                          }
                        >
                          {t.icon && <span>{t.icon}</span>}
                          {t.label}
                        </button>
                      );
                    })
                )}
              </div>
            )}
          </div>
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="판매가 (원)" required>
            <input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="예: 200000"
              className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded tabular-nums focus:outline-none focus:border-[var(--color-primary)]" />
          </FormField>
          <FormField label="정가 (선택, 할인 표시용)">
            <input type="number" min="0" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)}
              className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded tabular-nums focus:outline-none focus:border-[var(--color-primary)]" />
          </FormField>
        </div>

        <FormField label="짧은 설명 (카드에 노출)">
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} maxLength={120}
            placeholder="한 줄 요약. 회원 카탈로그 카드에 표시됩니다."
            className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]" />
        </FormField>

        <FormField label="상세 설명 (상품 상세 페이지에 노출)">
          <textarea value={descriptionLong} onChange={e => setDescriptionLong(e.target.value)} rows={4}
            placeholder="상품의 자세한 안내 문구. 줄바꿈을 사용할 수 있습니다."
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)] resize-y" />
        </FormField>

        <FormField label="환불 정책 (구매 버튼 옆에 노출)">
          <textarea value={refundPolicy} onChange={e => setRefundPolicy(e.target.value)} rows={3}
            placeholder="예: 결제일로부터 7일 이내, 첫 사용 전에는 100% 환불…"
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)] resize-y" />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="이미지 URL (선택)">
            <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…"
              className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]" />
          </FormField>
          <FormField label="정렬 순서 (작을수록 먼저)">
            <input type="number" value={displayOrder} onChange={e => setDisplayOrder(e.target.value)}
              className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded tabular-nums focus:outline-none focus:border-[var(--color-primary)]" />
          </FormField>
        </div>

        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-1.5 text-[12.5px] cursor-pointer">
            <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} />
            <Star size={13} className="text-amber-500" /> 추천 상품
          </label>
          <label className="inline-flex items-center gap-1.5 text-[12.5px] cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            판매중 (체크 해제 시 회원 카탈로그에서 숨김)
          </label>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded">
            <AlertCircle size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-[12.5px] text-red-700">{error}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
        <button type="button" onClick={onClose} disabled={submitting}
          className="flex-1 h-10 text-[13.5px] font-medium text-[var(--color-text)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-subtle)] disabled:opacity-50">취소</button>
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-border)]">
          {submitting ? '저장 중…' : (<><Save size={14} /> {isEdit ? '수정 저장' : '상품 추가'}</>)}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ProductDetailModal — read-only product spec preview.
// ─────────────────────────────────────────────────────────────────────
function ProductDetailModal({
  product, memberPasses, onClose, onEdit,
}: {
  product: PassProduct;
  memberPasses: MemberPass[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const issued = memberPasses.filter(p => p.productId === product.id);
  const active = issued.filter(p => p.status === 'active').length;
  const apply = product.applicableSessions === 'all'
    ? '전체 세션'
    : (product.applicableSessions as SessionType[]).map(s => sessionTypeConfig[s]?.label).filter(Boolean).join(', ');

  return (
    <Modal title="수강권 상품 상세" onClose={onClose} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {product.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={product.imageUrl} alt={product.name} className="w-full max-h-[260px] object-cover rounded border border-[var(--color-border)]" />
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[18px] font-semibold text-[var(--color-text)]">{product.name}</h3>
              {product.isFeatured && <Badge tone="warning"><Star size={10} className="inline mr-0.5" />추천</Badge>}
              {product.isActive ? <Badge tone="success">판매중</Badge> : <Badge tone="muted">중단</Badge>}
            </div>
            {product.description && <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">{product.description}</p>}
          </div>
          <div className="text-right shrink-0">
            {product.originalPrice && product.originalPrice > product.price && (
              <div className="text-[12px] text-[var(--color-text-muted)] line-through tabular-nums">{formatPrice(product.originalPrice)}</div>
            )}
            <div className="price-num">{formatPrice(product.price)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12.5px]">
          <Info_ label="분류" value={passCategoryLabel(product.category)} />
          <Info_ label="이용 기간" value={`${product.durationDays}일`} />
          {product.totalCount && <Info_ label="총 횟수" value={`${product.totalCount}회`} />}
          <Info_ label="이용 가능 세션" value={apply} />
          <Info_ label="발급 누적" value={`${issued.length}건 (사용중 ${active}건)`} />
          <Info_ label="정렬 순서" value={`${product.displayOrder ?? 0}`} />
        </div>

        {product.descriptionLong && (
          <div>
            <h4 className="text-[12.5px] font-semibold text-[var(--color-text-secondary)] mb-1">상세 설명</h4>
            <p className="text-[13px] text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">{product.descriptionLong}</p>
          </div>
        )}
        {product.refundPolicy && (
          <div>
            <h4 className="text-[12.5px] font-semibold text-[var(--color-text-secondary)] mb-1">환불 정책</h4>
            <p className="text-[13px] text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">{product.refundPolicy}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
        <button type="button" onClick={onClose}
          className="flex-1 h-10 text-[13.5px] font-medium text-[var(--color-text)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-subtle)]">닫기</button>
        <button type="button" onClick={onEdit}
          className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)]">
          <Pencil size={14} /> 수정
        </button>
      </div>
    </Modal>
  );
}

function Info_({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--color-text-muted)] mb-0.5">{label}</p>
      <p className="text-[13px] text-[var(--color-text)]">{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PassDetailModal — issued pass detail with all admin tools.
// ─────────────────────────────────────────────────────────────────────
function PassDetailModal({
  pass, onClose, onExtend, onAdjust, onPayment, onMemo, onPause, onResume, onRefund,
}: {
  pass: MemberPass;
  onClose: () => void;
  onExtend: (params: { days?: number; expiryDate?: string }) => Promise<boolean>;
  onAdjust: (params: { totalCount?: number; remainingCount?: number }) => Promise<boolean>;
  onPayment: (params: { paymentStatus: any; paymentMethod?: string; paymentAmount?: number; transactionId?: string }) => Promise<boolean>;
  onMemo: (memo: string) => Promise<boolean>;
  onPause: () => void; onResume: () => void; onRefund: () => void;
}) {
  const [section, setSection] = useState<'overview' | 'extend' | 'adjust' | 'payment' | 'memo'>('overview');
  const [extendDays, setExtendDays] = useState<string>('30');
  const [extendDate, setExtendDate] = useState<string>(pass.expiryDate);
  const [extendMode, setExtendMode] = useState<'days' | 'date'>('days');
  const [adjTotal, setAdjTotal] = useState<string>(String(pass.totalCount ?? ''));
  const [adjRemaining, setAdjRemaining] = useState<string>(String(pass.remainingCount ?? ''));
  const [pStatus, setPStatus] = useState<string>(pass.paymentStatus ?? 'unpaid');
  const [pMethod, setPMethod] = useState<string>(pass.paymentMethod ?? 'cash');
  const [pAmount, setPAmount] = useState<string>(String(pass.paymentAmount ?? pass.price ?? 0));
  const [pTxn, setPTxn] = useState<string>(pass.transactionId ?? '');
  const [memo, setMemo] = useState<string>(pass.adminMemo ?? '');
  const [busy, setBusy] = useState(false);

  const ps = pass.paymentStatus ?? 'unpaid';
  const daysLeft = getDaysUntilExpiry(pass);

  return (
    <Modal title={`${pass.memberName}님의 수강권`} onClose={onClose} size="lg">
      {/* Header summary */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[var(--color-text)]">{pass.productName}</p>
            <p className="text-[12px] text-[var(--color-text-muted)] tabular-nums mt-0.5">
              {formatKoreanDate(pass.startDate, 'yyyy.M.d')} → {formatKoreanDate(pass.expiryDate, 'yyyy.M.d')} (D-{daysLeft})
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge tone={pass.status === 'active' ? 'success' : pass.status === 'paused' ? 'warning' : pass.status === 'refunded' ? 'danger' : 'muted'}>
              {passStatusConfig[pass.status]?.label ?? pass.status}
            </Badge>
            <Badge tone={paymentStatusTone[ps] ?? 'muted'}>{paymentStatusLabel[ps] ?? ps}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12.5px]">
          {pass.category === 'count' && (
            <Info_ label="잔여" value={`${pass.remainingCount ?? 0} / ${pass.totalCount ?? 0}회`} />
          )}
          <Info_ label="결제 금액" value={pass.paymentAmount != null ? formatPrice(pass.paymentAmount) : '—'} />
          <Info_ label="결제 수단" value={pass.paymentMethod ? (paymentMethodLabel[pass.paymentMethod] ?? pass.paymentMethod) : '—'} />
        </div>
      </div>

      {/* Section nav */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] mb-3 overflow-x-auto">
        {([
          { id: 'overview', label: '개요', icon: Info },
          { id: 'extend', label: '기간 연장', icon: ArrowRightCircle },
          ...(pass.category === 'count' ? [{ id: 'adjust' as const, label: '횟수 조정', icon: Coins }] : []),
          { id: 'payment', label: '결제 정보', icon: Wallet },
          { id: 'memo', label: '메모', icon: FileText },
        ] as const).map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={cn(
              'flex items-center gap-1 px-3 py-2 text-[12.5px] border-b-2 -mb-px',
              section === s.id ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-medium' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            )}>
            <s.icon size={12} />{s.label}
          </button>
        ))}
      </div>

      <div className="max-h-[44vh] overflow-y-auto pr-1">
        {section === 'overview' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {pass.status === 'active' && (
                <>
                  <button onClick={() => { setBusy(true); Promise.resolve(onPause()).finally(() => setBusy(false)); }} disabled={busy}
                    className="px-3 py-1.5 text-[12.5px] text-[var(--color-warning)] border border-[var(--color-warning-border)] rounded hover:bg-[var(--color-warning-bg)]">일시정지</button>
                  <button onClick={() => { setBusy(true); Promise.resolve(onRefund()).finally(() => setBusy(false)); }} disabled={busy}
                    className="px-3 py-1.5 text-[12.5px] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded hover:bg-[var(--color-danger-bg)]">환불</button>
                </>
              )}
              {pass.status === 'paused' && (
                <button onClick={() => { setBusy(true); Promise.resolve(onResume()).finally(() => setBusy(false)); }} disabled={busy}
                  className="px-3 py-1.5 text-[12.5px] text-[var(--color-primary)] border border-[var(--color-primary)]/30 rounded hover:bg-[var(--color-primary)]/10">재개</button>
              )}
            </div>
            {pass.discountAmount && pass.discountAmount > 0 && (
              <div className="bg-[var(--color-bg-subtle)] p-3 rounded text-[12.5px]">
                <p className="text-[var(--color-text-muted)] mb-1">할인 적용</p>
                <p className="tabular-nums">-{formatPrice(pass.discountAmount)} {pass.discountReason && <span className="text-[var(--color-text-muted)]">({pass.discountReason})</span>}</p>
              </div>
            )}
            {pass.transactionId && (
              <Info_ label="거래 ID" value={pass.transactionId} />
            )}
            {pass.adminMemo && (
              <div>
                <p className="text-[11px] text-[var(--color-text-muted)] mb-0.5">관리자 메모</p>
                <p className="text-[13px] text-[var(--color-text)] whitespace-pre-wrap">{pass.adminMemo}</p>
              </div>
            )}
          </div>
        )}

        {section === 'extend' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {(['days', 'date'] as const).map(m => (
                <button key={m} onClick={() => setExtendMode(m)}
                  className={cn('flex-1 px-3 py-2 text-[12.5px] rounded border', extendMode === m ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]')}>
                  {m === 'days' ? '상대 일수' : '특정 날짜'}
                </button>
              ))}
            </div>
            {extendMode === 'days' ? (
              <FormField label="만료일에 더할 일수 (음수 가능)">
                <input type="number" value={extendDays} onChange={e => setExtendDays(e.target.value)}
                  className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded tabular-nums" />
              </FormField>
            ) : (
              <FormField label="새 만료일">
                <input type="date" value={extendDate} onChange={e => setExtendDate(e.target.value)}
                  className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded" />
              </FormField>
            )}
            <button onClick={async () => {
              setBusy(true);
              const ok = extendMode === 'days'
                ? await onExtend({ days: Number(extendDays) })
                : await onExtend({ expiryDate: extendDate });
              setBusy(false);
              if (ok) onClose();
            }} disabled={busy}
              className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-border)]">
              <Save size={14} /> 만료일 변경
            </button>
          </div>
        )}

        {section === 'adjust' && pass.category === 'count' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="총 횟수">
                <input type="number" min="0" value={adjTotal} onChange={e => setAdjTotal(e.target.value)}
                  className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded tabular-nums" />
              </FormField>
              <FormField label="잔여 횟수">
                <input type="number" min="0" value={adjRemaining} onChange={e => setAdjRemaining(e.target.value)}
                  className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded tabular-nums" />
              </FormField>
            </div>
            <button onClick={async () => {
              setBusy(true);
              const ok = await onAdjust({ totalCount: Number(adjTotal), remainingCount: Number(adjRemaining) });
              setBusy(false);
              if (ok) onClose();
            }} disabled={busy}
              className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-border)]">
              <Save size={14} /> 횟수 저장
            </button>
          </div>
        )}

        {section === 'payment' && (
          <div className="space-y-3">
            <FormField label="결제 상태" required>
              <select value={pStatus} onChange={e => setPStatus(e.target.value)}
                className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded">
                <option value="unpaid">미결제</option>
                <option value="paid">결제완료</option>
                <option value="refunded">환불</option>
                <option value="partial_refund">부분환불</option>
              </select>
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="결제 수단">
                <select value={pMethod} onChange={e => setPMethod(e.target.value)}
                  className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded">
                  <option value="cash">현금</option>
                  <option value="transfer">계좌이체</option>
                  <option value="card">수기 카드</option>
                  <option value="kakaopay">카카오페이</option>
                  <option value="tosspay">토스페이</option>
                  <option value="naverpay">네이버페이</option>
                  <option value="toss">토스페이먼츠</option>
                  <option value="manual">기타 외부결제</option>
                  <option value="free">무료</option>
                </select>
              </FormField>
              <FormField label="결제 금액">
                <input type="number" min="0" value={pAmount} onChange={e => setPAmount(e.target.value)}
                  className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded tabular-nums" />
              </FormField>
            </div>
            <FormField label="거래 ID (선택)">
              <input type="text" value={pTxn} onChange={e => setPTxn(e.target.value)}
                placeholder="입금자명, 카드 승인번호, Toss 주문번호 등"
                className="w-full px-3 h-9 text-[13px] border border-[var(--color-border)] rounded" />
            </FormField>
            <button onClick={async () => {
              setBusy(true);
              const ok = await onPayment({
                paymentStatus: pStatus as any,
                paymentMethod: pMethod,
                paymentAmount: Number(pAmount) || 0,
                transactionId: pTxn || undefined,
              });
              setBusy(false);
              if (ok) onClose();
            }} disabled={busy}
              className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-border)]">
              <Save size={14} /> 결제 정보 저장
            </button>
          </div>
        )}

        {section === 'memo' && (
          <div className="space-y-3">
            <FormField label="관리자 메모">
              <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={5}
                placeholder="회원에게는 보이지 않는 내부 메모"
                className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded resize-y" />
            </FormField>
            <button onClick={async () => {
              setBusy(true);
              const ok = await onMemo(memo);
              setBusy(false);
              if (ok) onClose();
            }} disabled={busy}
              className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-border)]">
              <Save size={14} /> 메모 저장
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PR-6 STEP 5: RefundModal — Toss cancel automation + partial refund
//
// 토스로 결제된 수강권은 transaction_id(=paymentKey)와 payment_method가
// 'toss'/'card'로 기록되며, 이 모달에서 사유와 (선택) 부분환불 금액을
// 입력하면 서버가 /v1/payments/{paymentKey}/cancel을 호출합니다.
// 수기 결제(현금/계좌이체 등)는 "Toss 호출 없이 환불" 토글이 자동으로
// 켜져 DB만 업데이트합니다.
// ─────────────────────────────────────────────────────────────────────
function RefundModal({
  pass, onClose, onSubmit,
}: {
  pass: MemberPass;
  onClose: () => void;
  onSubmit: (params: { cancelReason: string; cancelAmount?: number; skipToss?: boolean }) => Promise<boolean>;
}) {
  const paidAmount = pass.paymentAmount ?? pass.price ?? 0;
  const canAutoCancel =
    pass.paymentStatus === 'paid' &&
    !!pass.transactionId &&
    (pass.paymentMethod === 'toss' || pass.paymentMethod === 'card' ||
     pass.paymentMethod === 'easyPay' || !pass.paymentMethod);

  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [skipToss, setSkipToss] = useState<boolean>(!canAutoCancel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const partialNum = Number(partialAmount.replace(/[^\d]/g, '')) || 0;
  const isPartial = mode === 'partial';
  const valid =
    reason.trim().length >= 2 &&
    reason.trim().length <= 200 &&
    (!isPartial || (partialNum > 0 && partialNum < paidAmount));

  const submit = async () => {
    if (!valid) return;
    setError(null);
    setBusy(true);
    const ok = await onSubmit({
      cancelReason: reason.trim(),
      cancelAmount: isPartial ? partialNum : undefined,
      skipToss,
    });
    setBusy(false);
    if (!ok) setError('환불 처리에 실패했습니다. 다시 시도해주세요.');
  };

  return (
    <Modal title="수강권 환불" onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded p-3 text-[12.5px] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-muted)]">회원</span>
            <span className="text-[var(--color-text)] font-medium">{pass.memberName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-muted)]">수강권</span>
            <span className="text-[var(--color-text)]">{pass.productName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-muted)]">결제 금액</span>
            <span className="text-[var(--color-text)] tabular-nums font-semibold">{formatPrice(paidAmount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-muted)]">결제 수단</span>
            <span className="text-[var(--color-text)]">
              {pass.paymentMethod ? (paymentMethodLabel[pass.paymentMethod] ?? pass.paymentMethod) : '—'}
            </span>
          </div>
          {pass.transactionId && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">거래 ID</span>
              <span className="text-[var(--color-text)] tabular-nums text-[11px] truncate max-w-[60%]">{pass.transactionId}</span>
            </div>
          )}
        </div>

        {canAutoCancel ? (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded">
            <CreditCard size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-[12px] text-blue-800">
              <p className="font-medium">토스 결제 자동 환불 가능</p>
              <p className="text-blue-700 mt-0.5">서버가 Toss /v1/payments/.../cancel을 호출하여 자동으로 환불을 진행합니다.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded">
            <AlertTriangle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-[12px] text-amber-800">
              <p className="font-medium">수기 결제 / 외부 결제건</p>
              <p className="text-amber-700 mt-0.5">Toss API 호출 없이 DB 상태만 환불로 변경합니다. 실제 환불은 외부 채널에서 처리해주세요.</p>
            </div>
          </div>
        )}

        <FormField label="환불 방식" required>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('full')}
              className={cn(
                'flex-1 h-10 px-3 text-[13px] border rounded transition-colors',
                mode === 'full'
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                  : 'bg-white text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
              )}
            >
              전액 환불 ({formatPrice(paidAmount)})
            </button>
            <button
              type="button"
              onClick={() => setMode('partial')}
              className={cn(
                'flex-1 h-10 px-3 text-[13px] border rounded transition-colors',
                mode === 'partial'
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                  : 'bg-white text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
              )}
            >
              부분 환불
            </button>
          </div>
        </FormField>

        {isPartial && (
          <FormField label="환불 금액 (원)" required>
            <input
              type="text"
              inputMode="numeric"
              value={partialAmount}
              onChange={e => setPartialAmount(e.target.value.replace(/[^\d]/g, ''))}
              placeholder={`최대 ${(paidAmount - 1).toLocaleString()}원`}
              className="w-full h-10 px-3 text-[13px] border border-[var(--color-border)] rounded tabular-nums"
            />
            <p className="text-[11.5px] text-[var(--color-text-muted)] mt-1">
              전액보다 작은 금액을 입력하세요. (전액 = {formatPrice(paidAmount)})
              {partialNum > 0 && partialNum < paidAmount && (
                <span className="text-[var(--color-text-secondary)]"> · 잔액 {formatPrice(paidAmount - partialNum)}</span>
              )}
            </p>
          </FormField>
        )}

        <FormField label="환불 사유" required>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="예: 회원 요청, 일정 변경, 서비스 불만족 등 (2~200자)"
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded resize-y"
          />
          <p className="text-[11.5px] text-[var(--color-text-muted)] mt-1 text-right">{reason.length} / 200</p>
        </FormField>

        {canAutoCancel && (
          <label className="flex items-start gap-2 text-[12.5px] text-[var(--color-text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={skipToss}
              onChange={e => setSkipToss(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong>Toss 호출 없이 DB만 환불 처리</strong>
              <span className="block text-[11.5px] text-[var(--color-text-muted)] mt-0.5">
                이미 토스 콘솔에서 직접 취소했거나, 외부 채널로 환불한 경우에 체크하세요.
              </span>
            </span>
          </label>
        )}

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded">
            <AlertCircle size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-[12.5px] text-red-700">{error}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-5 pt-4 border-t border-[var(--color-border)]">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="flex-1 h-10 text-[13px] font-medium text-[var(--color-text)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || busy}
          className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-white bg-[var(--color-danger)] rounded hover:opacity-90 disabled:bg-[var(--color-border)]"
        >
          {busy ? <><Loader2 size={14} className="animate-spin" /> 처리 중…</> : (
            <>{isPartial ? `${formatPrice(partialNum || 0)} 부분 환불` : `${formatPrice(paidAmount)} 환불`}{!skipToss && canAutoCancel && ' (Toss)'}</>
          )}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PR-6 STEP 4: PaymentsMonitorPanel — admin payment monitoring tab
//
// 결제 시도 내역을 한눈에 보여줍니다.
//   - 상단: 오늘/이번달 결제건수·금액, 대기/실패 건수, 실패율 카드
//   - 하단: 최근 50건 테이블 (상태 필터: 전체/완료/실패/대기/만료)
//   - 실패 건은 빨간 배경 + 에러 메시지 표시
// ─────────────────────────────────────────────────────────────────────
type PaymentItem = {
  orderId: string; memberId: string; memberName: string; memberPhone: string | null;
  productId: string; productName: string; amount: number;
  status: 'pending' | 'confirmed' | 'failed' | 'expired';
  method: string | null; paymentKey: string | null; passId: string | null;
  passPaymentStatus: string | null; errorMessage: string | null;
  confirmedAt: string | null; createdAt: string; updatedAt: string;
};
type PaymentStats = {
  today: { count: number; amount: number };
  month: { count: number; amount: number };
  pendingCount: number; failed7d: number; total7d: number; failureRate: number;
};

function PaymentsMonitorPanel() {
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'failed' | 'expired'>('all');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.payments.list({ status: statusFilter === 'all' ? undefined : statusFilter, limit: 50 }),
        api.payments.stats(),
      ]);
      setItems(listRes.items);
      setStats(statsRes);
    } catch (e: any) {
      setErr(e?.message ?? '결제 내역을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  const statusBadge = (s: PaymentItem['status']) => {
    if (s === 'confirmed') return <Badge tone="success">결제완료</Badge>;
    if (s === 'pending') return <Badge tone="warning">결제 대기</Badge>;
    if (s === 'failed') return <Badge tone="danger">실패</Badge>;
    return <Badge tone="muted">만료</Badge>;
  };

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
        <StatCard icon={<TrendingUp size={14} />} label="오늘 결제"
          value={stats ? `${stats.today.count}건` : '—'}
          sub={stats ? formatPrice(stats.today.amount) : ''} tone="primary" />
        <StatCard icon={<Calendar size={14} />} label="이번달 결제"
          value={stats ? `${stats.month.count}건` : '—'}
          sub={stats ? formatPrice(stats.month.amount) : ''} tone="success" />
        <StatCard icon={<Clock size={14} />} label="결제 대기"
          value={stats ? `${stats.pendingCount}건` : '—'}
          sub="확인 미완료" tone="warning" />
        <StatCard icon={<AlertTriangle size={14} />} label="7일 실패율"
          value={stats ? `${stats.failureRate}%` : '—'}
          sub={stats ? `${stats.failed7d}/${stats.total7d}` : ''}
          tone={stats && stats.failureRate > 20 ? 'danger' : 'muted'} />
      </div>

      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-3 flex-wrap bg-white">
        <span className="text-[12px] text-[var(--color-text-muted)]">상태</span>
        {([
          { id: 'all', label: '전체' },
          { id: 'confirmed', label: '완료' },
          { id: 'pending', label: '대기' },
          { id: 'failed', label: '실패' },
          { id: 'expired', label: '만료' },
        ] as const).map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={cn(
              'px-2.5 py-1 text-[12px] rounded border transition-colors',
              statusFilter === f.id
                ? 'bg-[var(--color-text)] text-white border-[var(--color-text)]'
                : 'bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 새로고침
        </button>
      </div>

      {err && (
        <div className="py-12 text-center text-[13px] text-[var(--color-danger)]">{err}</div>
      )}
      {!err && items.length === 0 && !loading && (
        <div className="py-12 text-center text-[13px] text-[var(--color-text-muted)]">결제 시도 내역이 없습니다.</div>
      )}
      {!err && loading && items.length === 0 && (
        <div className="py-12 text-center text-[13px] text-[var(--color-text-muted)]">
          <Loader2 size={16} className="inline animate-spin mr-1" /> 불러오는 중…
        </div>
      )}

      {!err && items.length > 0 && (
        <>
          {/* ── Mobile: 카드 리스트 ── */}
          <ul className="sm:hidden divide-y divide-[var(--color-border-subtle)]">
            {items.map(it => {
              const isFailed = it.status === 'failed';
              const isPending = it.status === 'pending';
              return (
                <li
                  key={it.orderId}
                  className={cn(
                    'px-3 py-3',
                    isFailed && 'bg-red-50/40',
                    isPending && 'bg-amber-50/40'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[14px] font-semibold text-[var(--color-text)] truncate">{it.memberName}</span>
                        {statusBadge(it.status)}
                      </div>
                      <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5 truncate">{it.productName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-semibold text-[var(--color-text)] tabular-nums">{formatPrice(it.amount)}</div>
                      {it.method && (
                        <div className="text-[10.5px] text-[var(--color-text-muted)] mt-0.5">
                          {paymentMethodLabel[it.method] ?? it.method}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-[11.5px] text-[var(--color-text-muted)] mt-1.5 tabular-nums">
                    {new Date(it.createdAt).toLocaleString('ko-KR', {
                      month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                    {' · '}
                    <span className="truncate inline-block max-w-[180px] align-bottom" title={it.orderId}>{it.orderId}</span>
                  </p>
                  {isFailed && it.errorMessage && (
                    <p className="text-[11px] text-red-700 mt-1 truncate" title={it.errorMessage}>
                      실패 사유: {it.errorMessage}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {/* ── Desktop (sm+): 테이블 ── */}
          <div className="hidden sm:block scroll-x">
            <table className="responsive-table" style={{ minWidth: 720 }}>
              <thead>
                <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                  <th className="text-left font-medium px-4 py-2.5 w-[150px]">시각</th>
                  <th className="text-left font-medium px-4 py-2.5 w-[110px]">회원</th>
                  <th className="text-left font-medium px-4 py-2.5 w-[180px]">상품</th>
                  <th className="text-right font-medium px-4 py-2.5 w-[110px]">금액</th>
                  <th className="text-center font-medium px-4 py-2.5 w-[110px]">상태</th>
                  <th className="text-left font-medium px-4 py-2.5 w-[200px]">주문/거래 ID</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const isFailed = it.status === 'failed';
                  const isPending = it.status === 'pending';
                  return (
                    <tr
                      key={it.orderId}
                      className={cn(
                        'border-b border-[var(--color-border-subtle)] last:border-0',
                        isFailed ? 'bg-red-50/40 hover:bg-red-50/70' :
                        isPending ? 'bg-amber-50/40 hover:bg-amber-50/70' :
                        'hover:bg-[var(--color-bg-subtle)]'
                      )}
                    >
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)] tabular-nums text-[12px]">
                        {new Date(it.createdAt).toLocaleString('ko-KR', {
                          month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-text)] font-medium">{it.memberName}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)] max-w-[180px] truncate" title={it.productName}>
                        {it.productName}
                        {isFailed && it.errorMessage && (
                          <p className="text-[11px] text-red-700 mt-0.5 truncate max-w-[400px]" title={it.errorMessage}>
                            실패 사유: {it.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[var(--color-text)] tabular-nums">{formatPrice(it.amount)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {statusBadge(it.status)}
                        {it.method && (
                          <div className="text-[10.5px] text-[var(--color-text-muted)] mt-0.5">
                            {paymentMethodLabel[it.method] ?? it.method}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[11.5px] text-[var(--color-text-muted)] tabular-nums">
                        <div className="truncate max-w-[200px]" title={it.orderId}>{it.orderId}</div>
                        {it.paymentKey && (
                          <div className="truncate max-w-[200px] text-[10.5px]" title={it.paymentKey}>
                            {it.paymentKey.slice(0, 16)}…
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="px-4 py-2.5 border-t border-[var(--color-border)] text-[11.5px] text-[var(--color-text-muted)] flex items-center gap-1.5">
        <Info size={11} />
        결제 시도 → 완료/실패 모든 단계가 기록됩니다. 실패 건은 회원에게 별도 안내가 필요할 수 있습니다.
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, sub, tone = 'muted',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'muted';
}) {
  const toneClasses: Record<string, string> = {
    primary: 'border-[var(--color-primary)]/30 bg-white',
    success: 'border-emerald-200 bg-white',
    warning: 'border-amber-200 bg-white',
    danger: 'border-red-200 bg-red-50/40',
    muted: 'border-[var(--color-border)] bg-white',
  };
  const iconTone: Record<string, string> = {
    primary: 'text-[var(--color-primary)]',
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
    muted: 'text-[var(--color-text-muted)]',
  };
  return (
    <div className={cn('rounded-md border px-2.5 sm:px-3 py-2 sm:py-2.5', toneClasses[tone])}>
      <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-[11.5px] text-[var(--color-text-muted)]">
        <span className={iconTone[tone]}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-[16px] sm:text-[18px] font-semibold text-[var(--color-text)] tabular-nums leading-none truncate">{value}</div>
      {sub && <div className="mt-1 text-[11px] sm:text-[11.5px] text-[var(--color-text-muted)] tabular-nums truncate">{sub}</div>}
    </div>
  );
}

