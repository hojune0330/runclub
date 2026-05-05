'use client';

import { useState, useMemo, useEffect } from 'react';
import { Plus, Search, X, Check, AlertCircle, Ticket, Calendar, CheckCircle2 } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig, passStatusConfig } from '@/lib/config';
import { formatKoreanDate, formatPrice, cn, getDaysUntilExpiry, isPassExpiringSoon } from '@/lib/utils';
import { Tabs, Badge } from '@/components/ui';
import type { Member, PassProduct, MemberPass } from '@/types';

const passCategoryLabel = (c: PassProduct['category']) =>
  c === 'count' ? '횟수권' : c === 'season' ? '시즌권' : '월권';

const passCategoryHelp = (c: PassProduct['category']) =>
  c === 'count'
    ? '예약·출석 1회당 1회 차감되며, 횟수가 모두 소진되거나 이용 기간이 끝나면 만료됩니다.'
    : c === 'season'
    ? '이용 기간 동안 횟수 제한 없이 자유롭게 예약할 수 있습니다.'
    : '한 달 단위로 갱신되는 정기권입니다.';

type Tab = 'products' | 'issued';

export default function PassManagement() {
  const { passProducts, memberPasses, members, issueMemberPass, pauseMemberPass, refundMemberPass } = useApp();
  const [tab, setTab] = useState<Tab>('products');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'expiring'>('all');
  const [search, setSearch] = useState('');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast
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
        return true;
      })
      .filter(p => {
        if (!search) return true;
        return (p.memberName || '').includes(search) || p.productName.includes(search);
      })
      .sort((a, b) => b.issuedDate.localeCompare(a.issuedDate));
  }, [memberPasses, statusFilter, search]);

  const handlePause = async (passId: string) => {
    if (confirm('이 수강권을 정지 처리하시겠습니까?')) {
      await pauseMemberPass(passId);
    }
  };

  const handleRefund = async (passId: string) => {
    if (confirm('이 수강권을 환불 처리하시겠습니까?\n해당 상태는 되돌릴 수 없습니다.')) {
      await refundMemberPass(passId);
    }
  };

  return (
    <div className="max-w-[1400px] space-y-5">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--color-text)]">수강권 관리</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
            수강권 상품과 회원별 발급 내역을 관리합니다.
          </p>
        </div>
        <button
          onClick={() => {
            if (tab === 'issued') setShowIssueModal(true);
            else alert('상품 추가는 추후 지원 예정입니다. 현재는 시드된 6종(EBW/런클럽/시즌/월권)을 사용하세요.');
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

        {tab === 'products' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                  <th className="text-left font-medium px-4 py-2.5">상품명</th>
                  <th className="text-left font-medium px-4 py-2.5 w-[100px]">분류</th>
                  <th className="text-left font-medium px-4 py-2.5">이용 가능 세션</th>
                  <th className="text-center font-medium px-4 py-2.5 w-[90px]">횟수/기간</th>
                  <th className="text-right font-medium px-4 py-2.5 w-[110px]">가격</th>
                  <th className="text-center font-medium px-4 py-2.5 w-[90px]">판매중 건수</th>
                  <th className="text-center font-medium px-4 py-2.5 w-[80px]">상태</th>
                </tr>
              </thead>
              <tbody>
                {passProducts.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-[13px] text-[var(--color-text-muted)]">등록된 상품이 없습니다.</td></tr>
                ) : (
                  passProducts.map(p => {
                    const applicableLabels = p.applicableSessions === 'all'
                      ? '전체 세션'
                      : p.applicableSessions.map(s => sessionTypeConfig[s].label).join(', ');
                    const activeCount = memberPasses.filter(mp => mp.productId === p.id && mp.status === 'active').length;
                    return (
                      <tr key={p.id} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)]">
                        <td className="px-4 py-2.5 text-[var(--color-text)] font-medium">{p.name}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                          {p.category === 'count' ? '횟수권' : p.category === 'season' ? '시즌권' : '월권'}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{applicableLabels}</td>
                        <td className="px-4 py-2.5 text-center text-[var(--color-text-secondary)] tabular-nums">
                          {p.totalCount ? `${p.totalCount}회` : `${p.durationDays}일`}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[var(--color-text)] font-medium tabular-nums">
                          {formatPrice(p.price)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-[var(--color-text-secondary)] tabular-nums">{activeCount}</td>
                        <td className="px-4 py-2.5 text-center">
                          {p.isActive
                            ? <Badge tone="success">판매중</Badge>
                            : <Badge tone="muted">중단</Badge>
                          }
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
                  placeholder="회원명, 수강권 검색"
                  className="pl-8 pr-3 py-1.5 text-[13px] border border-[var(--color-border)] rounded w-[240px] focus:outline-none focus:border-[var(--color-primary)]"
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

            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                    <th className="text-left font-medium px-4 py-2.5 w-[110px]">회원명</th>
                    <th className="text-left font-medium px-4 py-2.5">수강권</th>
                    <th className="text-left font-medium px-4 py-2.5 w-[100px]">잔여</th>
                    <th className="text-left font-medium px-4 py-2.5 w-[180px]">이용 기간</th>
                    <th className="text-right font-medium px-4 py-2.5 w-[100px]">가격</th>
                    <th className="text-center font-medium px-4 py-2.5 w-[100px]">상태</th>
                    <th className="text-right font-medium px-4 py-2.5 w-[130px]">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPasses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <p className="text-[13px] text-[var(--color-text-muted)]">조건에 맞는 수강권이 없습니다.</p>
                        {memberPasses.length === 0 && (
                          <button
                            onClick={() => setShowIssueModal(true)}
                            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-primary)] border border-[var(--color-primary)]/30 rounded hover:bg-[var(--color-primary)]/10"
                          >
                            <Plus size={13} /> 첫 수강권 발급하기
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredPasses.map(p => {
                      const daysLeft = getDaysUntilExpiry(p);
                      const expiring = isPassExpiringSoon(p, 7);
                      return (
                        <tr key={p.id} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)]">
                          <td className="px-4 py-2.5 text-[var(--color-text)] font-medium">{p.memberName}</td>
                          <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{p.productName}</td>
                          <td className="px-4 py-2.5 text-[var(--color-text-secondary)] tabular-nums">
                            {p.category === 'count' ? `${p.remainingCount} / ${p.totalCount}회` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--color-text-secondary)] tabular-nums">
                            {formatKoreanDate(p.startDate, 'yyyy.M.d')} — {formatKoreanDate(p.expiryDate, 'yyyy.M.d')}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--color-text)] tabular-nums">
                            {formatPrice(p.price)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {p.status === 'active' ? (
                              expiring ? <Badge tone="warning">D-{daysLeft}</Badge> : <Badge tone="success">사용중</Badge>
                            ) : (
                              <Badge tone="muted">{passStatusConfig[p.status].label}</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {p.status === 'active' ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handlePause(p.id)}
                                  className="px-2 py-0.5 text-[11.5px] text-[var(--color-warning)] border border-[var(--color-warning-border)] rounded hover:bg-[var(--color-warning-bg)] transition-colors"
                                >정지</button>
                                <button
                                  onClick={() => handleRefund(p.id)}
                                  className="px-2 py-0.5 text-[11.5px] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded hover:bg-[var(--color-danger-bg)] transition-colors"
                                >환불</button>
                              </div>
                            ) : (
                              <span className="text-[var(--color-text-disabled)] text-[11.5px]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showIssueModal && (
        <IssuePassModal
          members={members}
          products={passProducts}
          existingPasses={memberPasses}
          onClose={() => setShowIssueModal(false)}
          onIssue={async (memberId, productId) => {
            await issueMemberPass(memberId, productId);
            setShowIssueModal(false);
            setTab('issued');
            const m = members.find(x => x.id === memberId);
            const p = passProducts.find(x => x.id === productId);
            setToast(`${m?.name ?? '회원'}님에게 ${p?.name ?? '수강권'}을(를) 발급했습니다.`);
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

// ─── Issue-pass modal ──────────────────────────────────────────────
function IssuePassModal({
  members, products, existingPasses, onClose, onIssue,
}: {
  members: Member[];
  products: PassProduct[];
  existingPasses: MemberPass[];
  onClose: () => void;
  onIssue: (memberId: string, productId: string) => Promise<void>;
}) {
  const [memberQuery, setMemberQuery] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Members: real members only (no admins, only active), with active-pass count
  const eligibleMembers = useMemo(
    () => members.filter(m => m.role !== 'admin').filter(m => m.isActive !== false),
    [members]
  );

  const activePassCountByMember = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of existingPasses) {
      if (p.status === 'active') map[p.memberId] = (map[p.memberId] || 0) + 1;
    }
    return map;
  }, [existingPasses]);

  const memberOptions = useMemo(() => {
    const q = memberQuery.trim();
    const list = !q
      ? eligibleMembers
      : eligibleMembers.filter(m =>
          m.name.includes(q) || m.phone.replace(/-/g, '').includes(q.replace(/-/g, ''))
        );
    return list.slice(0, 50);
  }, [eligibleMembers, memberQuery]);

  // ── Products: only on-sale, grouped by category, sorted by price
  const groupedProducts = useMemo(() => {
    const onSale = products.filter(p => p.isActive);
    const buckets: Record<PassProduct['category'], PassProduct[]> = { count: [], season: [], monthly: [] };
    for (const p of onSale) buckets[p.category].push(p);
    (Object.keys(buckets) as PassProduct['category'][]).forEach(k => {
      buckets[k].sort((a, b) => a.price - b.price);
    });
    return buckets;
  }, [products]);

  const totalProductCount = groupedProducts.count.length + groupedProducts.season.length + groupedProducts.monthly.length;

  const selectedMember = memberId ? members.find(m => m.id === memberId) ?? null : null;
  const selectedProduct = productId ? products.find(p => p.id === productId) ?? null : null;

  // Warning: this member already has an *active* pass overlapping with this product
  const duplicateActive = useMemo(() => {
    if (!memberId || !productId) return false;
    return existingPasses.some(
      p => p.memberId === memberId && p.productId === productId && p.status === 'active'
    );
  }, [existingPasses, memberId, productId]);

  // Preview start/expiry dates (UI only — server is the source of truth)
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const startStr = `${yyyy}-${mm}-${dd}`;
  const expiryDate = selectedProduct
    ? new Date(today.getTime() + selectedProduct.durationDays * 86400000)
    : null;
  const expiryStr = expiryDate
    ? `${expiryDate.getFullYear()}-${String(expiryDate.getMonth() + 1).padStart(2, '0')}-${String(expiryDate.getDate()).padStart(2, '0')}`
    : null;

  const handleSubmit = async () => {
    if (!memberId || !productId) return;
    if (duplicateActive) {
      const ok = confirm(
        '이 회원은 이미 같은 상품의 사용중 수강권을 보유하고 있습니다.\n그래도 추가로 발급하시겠습니까?'
      );
      if (!ok) return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onIssue(memberId, productId);
    } catch (e: any) {
      setError(e?.message || '수강권 발급에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-pass-title"
    >
      <div
        className="w-full md:max-w-[560px] max-h-[100dvh] md:max-h-[90vh] bg-white md:rounded-lg shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-[var(--color-border)]">
          <h2 id="issue-pass-title" className="text-[16px] font-semibold text-[var(--color-text)]">수강권 발급</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4 space-y-4">
          {/* Step 1: member */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[13px] font-medium text-[var(--color-text)]">1. 회원 선택</label>
              {selectedMember && (
                <button
                  type="button"
                  onClick={() => { setMemberId(null); setMemberQuery(''); }}
                  className="text-[12px] text-[var(--color-text-muted)] hover:underline"
                >
                  변경
                </button>
              )}
            </div>

            {selectedMember ? (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded">
                <span className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] inline-flex items-center justify-center text-[13px] font-semibold">
                  {selectedMember.name[0]}
                </span>
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
                    type="text"
                    value={memberQuery}
                    onChange={e => setMemberQuery(e.target.value)}
                    placeholder="이름 또는 전화번호로 검색"
                    autoFocus
                    className="w-full pl-8 pr-3 h-10 text-[16px] md:text-[13.5px] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div className="mt-2 max-h-[220px] overflow-y-auto border border-[var(--color-border)] rounded">
                  {eligibleMembers.length === 0 ? (
                    <div className="py-8 px-4 text-center">
                      <p className="text-[12.5px] text-[var(--color-text-muted)]">
                        등록된 활성 회원이 없습니다.
                      </p>
                      <p className="mt-1 text-[11.5px] text-[var(--color-text-muted)]">
                        회원이 가입하거나 <b>회원 관리</b>에서 회원을 활성화한 뒤 다시 시도해주세요.
                      </p>
                    </div>
                  ) : memberOptions.length === 0 ? (
                    <p className="py-6 text-center text-[12.5px] text-[var(--color-text-muted)]">
                      &lsquo;{memberQuery}&rsquo; 와 일치하는 회원이 없습니다
                    </p>
                  ) : (
                    memberOptions.map(m => {
                      const activeCount = activePassCountByMember[m.id] || 0;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMemberId(m.id)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-bg-subtle)] border-b border-[var(--color-border-subtle)] last:border-0"
                        >
                          <span className="w-7 h-7 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] inline-flex items-center justify-center text-[12px] font-semibold flex-shrink-0">
                            {m.name[0]}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13px] font-medium text-[var(--color-text)] truncate">{m.name}</span>
                            <span className="block text-[11.5px] text-[var(--color-text-muted)] tabular-nums">{m.phone}</span>
                          </span>
                          {activeCount > 0 ? (
                            <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                              <Ticket size={10} />
                              사용중 {activeCount}
                            </span>
                          ) : (
                            <span className="flex-shrink-0 text-[10.5px] text-[var(--color-text-muted)]">미보유</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
                {eligibleMembers.length > 0 && memberOptions.length === eligibleMembers.length && memberOptions.length >= 50 && (
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    상위 50명만 표시됩니다. 검색어를 입력해 좁혀보세요.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Step 2: product */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-text)] mb-1.5">
              2. 수강권 상품
            </label>
            {totalProductCount === 0 ? (
              <p className="px-3 py-3 text-[12.5px] text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] rounded">
                판매중인 상품이 없습니다. 상품을 활성화한 뒤 다시 시도해주세요.
              </p>
            ) : (
              <div className="space-y-3">
                {(['count', 'season', 'monthly'] as const).map(cat => {
                  const list = groupedProducts[cat];
                  if (list.length === 0) return null;
                  return (
                    <div key={cat}>
                      <p className="text-[11px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider mb-1">
                        {passCategoryLabel(cat)}
                      </p>
                      <div className="space-y-1.5">
                        {list.map(p => {
                          const selected = productId === p.id;
                          const apply = p.applicableSessions === 'all'
                            ? '전체 세션'
                            : p.applicableSessions
                                .map(s => sessionTypeConfig[s as keyof typeof sessionTypeConfig]?.label)
                                .filter(Boolean)
                                .join(' · ');
                          const perUse = p.totalCount && p.totalCount > 0
                            ? Math.round(p.price / p.totalCount)
                            : null;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setProductId(p.id)}
                              className={cn(
                                'w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left rounded border transition-colors',
                                selected
                                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]/20'
                                  : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
                              )}
                              aria-pressed={selected}
                            >
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-medium text-[var(--color-text)] truncate">{p.name}</p>
                                <p className="text-[11.5px] text-[var(--color-text-muted)] truncate">
                                  {apply} · {p.totalCount ? `${p.totalCount}회` : `${p.durationDays}일`}
                                  {perUse && ` · 회당 ${formatPrice(perUse)}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[13px] font-semibold text-[var(--color-text)] tabular-nums">
                                  {formatPrice(p.price)}
                                </span>
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

          {/* Preview / warnings */}
          {selectedProduct && expiryStr && (
            <div className="bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded px-3 py-2.5 space-y-1.5">
              <p className="text-[12px] text-[var(--color-text-muted)] flex items-center gap-1">
                <Calendar size={11} /> 발급 후 정보
              </p>
              <p className="text-[12.5px] text-[var(--color-text)] tabular-nums">
                <span className="text-[var(--color-text-muted)]">이용 기간: </span>
                {startStr} → {expiryStr}
                <span className="text-[var(--color-text-muted)]"> ({selectedProduct.durationDays}일)</span>
              </p>
              <p className="text-[12.5px] text-[var(--color-text)]">
                <span className="text-[var(--color-text-muted)]">상품: </span>
                {passCategoryLabel(selectedProduct.category)}
                {selectedProduct.totalCount ? ` · ${selectedProduct.totalCount}회` : ' · 기간제'}
                <span className="text-[var(--color-text-muted)]"> · 가격 </span>
                <span className="tabular-nums font-semibold">{formatPrice(selectedProduct.price)}</span>
              </p>
              <p className="text-[11.5px] text-[var(--color-text-muted)] leading-relaxed">
                {passCategoryHelp(selectedProduct.category)}
              </p>
            </div>
          )}

          {duplicateActive && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded">
              <AlertCircle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-[12.5px] text-amber-900">
                이 회원은 이미 같은 상품의 <b>사용중</b> 수강권을 보유하고 있습니다. 그래도 추가 발급하면
                두 장이 동시에 활성 상태가 됩니다.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded">
              <AlertCircle size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-[12.5px] text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 md:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[var(--color-border)] bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 md:flex-initial md:px-5 h-11 inline-flex items-center justify-center text-[13.5px] font-medium text-[var(--color-text)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!memberId || !productId || submitting}
            className="flex-1 md:flex-initial md:px-5 h-11 inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-muted)]"
          >
            {submitting ? '발급 중…' : (
              <>
                <Plus size={15} />
                발급하기
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
