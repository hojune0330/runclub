'use client';

import { useCallback, useState } from 'react';
import {
  Sparkles, RefreshCw, CheckCircle2, AlertTriangle, UserX, Copy, Loader2, X,
} from 'lucide-react';
import { Modal, Badge } from '@/components/ui';
import { cn, formatPrice } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────
// SpringPassImportModal — 봄 시즌 장부(40건) 이용권 일괄 발급 화면
//
// 서브 에이전트(현지 매니저 운영 보조) 산출물.
//   · 백엔드: GET/POST /api/admin/pass-import (lib/spring-pass-import 공유)
//   · 안전절차: 먼저 dry-run(미리보기) → 매니저 확인 → 실제 발급(멱등·트랜잭션)
//   · DB 비밀번호 없이, 관리자 로그인 쿠키로만 동작한다.
// ─────────────────────────────────────────────────────────────────────

type ImportStatus = 'ready' | 'unmatched' | 'ambiguous' | 'already_issued';

interface ImportRow {
  index: number;
  name: string;
  paymentDate: string;
  startDate: string;
  expiryDate: string;
  months: number;
  amount: number;
  openingWaitlist: boolean;
  status: ImportStatus;
  memberId?: string;
  memberPhone?: string;
  candidateCount?: number;
  existingPassId?: string;
  reason?: string;
}

interface ImportStats {
  ready: number;
  unmatched: number;
  ambiguous: number;
  alreadyIssued: number;
}

interface ImportPreview {
  generatedAt: string;
  ledger: { count: number; totalAmount: number; openingWaitlistCount: number; regularCount: number };
  stats: ImportStats;
  rows: ImportRow[];
}

interface ApplyResult extends ImportPreview {
  issued: number;
  issuedPassIds: string[];
}

const statusConfig: Record<ImportStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'default'; icon: typeof CheckCircle2 }> = {
  ready: { label: '발급 준비', tone: 'success', icon: CheckCircle2 },
  already_issued: { label: '이미 발급됨', tone: 'default', icon: Copy },
  ambiguous: { label: '동명이인', tone: 'warning', icon: AlertTriangle },
  unmatched: { label: '회원 없음', tone: 'danger', icon: UserX },
};

async function callImport(method: 'GET' | 'POST'): Promise<ImportPreview | ApplyResult> {
  const res = await fetch('/api/admin/pass-import', {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify({}) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `요청 실패 (${res.status})`);
  }
  return data;
}

export default function SpringPassImportModal({ onClose }: { onClose: () => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<ApplyResult | null>(null);

  const runPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setApplied(null);
    try {
      const data = (await callImport('GET')) as ImportPreview;
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '미리보기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const runApply = useCallback(async () => {
    if (!preview) return;
    if (preview.stats.ready === 0) return;
    const ok = window.confirm(
      `발급 준비된 ${preview.stats.ready}건을 실제로 발급합니다.\n` +
        `(이미 발급된 건은 자동으로 건너뜁니다 — 여러 번 눌러도 안전합니다)\n\n진행할까요?`,
    );
    if (!ok) return;
    setApplying(true);
    setError(null);
    try {
      const data = (await callImport('POST')) as ApplyResult;
      setApplied(data);
      setPreview(data); // 결과로 표 갱신(이제 ready→already_issued 로 바뀜)
    } catch (e) {
      setError(e instanceof Error ? e.message : '발급에 실패했습니다.');
    } finally {
      setApplying(false);
    }
  }, [preview]);

  const stats = preview?.stats;
  const blocked = (stats?.unmatched ?? 0) + (stats?.ambiguous ?? 0);

  return (
    <Modal title="봄 시즌 장부 일괄 발급 (40건)" onClose={onClose} size="lg">
      <div className="space-y-4">
        {/* 안내 */}
        <div className="rounded-md bg-[var(--color-primary-soft,#f1f5ff)] border border-[var(--color-border)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
          <p className="font-medium text-[var(--color-text)] mb-1 flex items-center gap-1.5">
            <Sparkles size={14} className="text-[var(--color-primary)]" />
            확정 장부를 회원 DB와 매칭해 이용권을 발급합니다.
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>먼저 <b>미리보기</b>로 누가 발급되고 누가 보류되는지 확인하세요.</li>
            <li>4월 결제(개강대기)는 시작 5/6 고정, 그 외는 결제일=시작입니다.</li>
            <li>이미 발급된 건은 자동으로 건너뜁니다 — <b>여러 번 눌러도 중복 발급되지 않아요.</b></li>
          </ul>
        </div>

        {error && (
          <div className="rounded-md bg-[var(--color-danger-soft,#fef2f2)] border border-[var(--color-danger,#ef4444)]/30 px-3.5 py-2.5 text-[12.5px] text-[var(--color-danger,#ef4444)] flex items-start gap-2">
            <X size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={runPreview}
            disabled={loading || applying}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover,#f9fafb)] transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {preview ? '미리보기 새로고침' : '미리보기 (dry-run)'}
          </button>

          <button
            onClick={runApply}
            disabled={!preview || applying || loading || (stats?.ready ?? 0) === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50"
          >
            {applying ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {applying ? '발급 중…' : `발급 실행${stats ? ` (${stats.ready}건)` : ''}`}
          </button>
        </div>

        {/* 결과 배너 */}
        {applied && (
          <div className="rounded-md bg-[var(--color-success-soft,#f0fdf4)] border border-[var(--color-success,#22c55e)]/30 px-3.5 py-2.5 text-[12.5px] text-[var(--color-text)] flex items-center gap-2">
            <CheckCircle2 size={16} className="text-[var(--color-success,#22c55e)] shrink-0" />
            <span>
              <b>{applied.issued}건</b> 발급 완료
              {blocked > 0 && <> · 보류 {blocked}건(회원없음/동명이인)은 발급되지 않았습니다.</>}
            </span>
          </div>
        )}

        {/* 통계 요약 */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatCard label="발급 준비" value={stats.ready} tone="success" />
            <StatCard label="이미 발급" value={stats.alreadyIssued} tone="default" />
            <StatCard label="동명이인" value={stats.ambiguous} tone="warning" />
            <StatCard label="회원 없음" value={stats.unmatched} tone="danger" />
          </div>
        )}

        {/* 장부 합계 */}
        {preview && (
          <p className="text-[12px] text-[var(--color-text-muted)]">
            장부 합계: 총 {preview.ledger.count}건 · {formatPrice(preview.ledger.totalAmount)} ·
            개강대기 {preview.ledger.openingWaitlistCount} / 일반 {preview.ledger.regularCount}
          </p>
        )}

        {/* 상세 표 */}
        {preview && (
          <div className="border border-[var(--color-border)] rounded-md overflow-hidden">
            <div className="max-h-[42vh] overflow-y-auto">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-[var(--color-surface,#f9fafb)] border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">이름</th>
                    <th className="text-left font-medium px-2 py-2">기간</th>
                    <th className="text-right font-medium px-2 py-2">개월/금액</th>
                    <th className="text-left font-medium px-3 py-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => {
                    const sc = statusConfig[r.status];
                    const Icon = sc.icon;
                    return (
                      <tr key={`${r.name}#${r.index}`} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="px-3 py-2">
                          <span className="font-medium text-[var(--color-text)]">{r.name}</span>
                          {r.openingWaitlist && (
                            <span className="ml-1.5 text-[10.5px] text-[var(--color-text-muted)]">개강대기</span>
                          )}
                          {r.memberPhone && (
                            <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">{r.memberPhone}</div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-[var(--color-text-secondary)] tabular-nums whitespace-nowrap">
                          {r.startDate.slice(5)} ~ {r.expiryDate.slice(5)}
                        </td>
                        <td className="px-2 py-2 text-right text-[var(--color-text-secondary)] tabular-nums whitespace-nowrap">
                          {r.months}개월 · {formatPrice(r.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1">
                            <Icon size={13} className={cn(
                              sc.tone === 'success' && 'text-[var(--color-success,#22c55e)]',
                              sc.tone === 'danger' && 'text-[var(--color-danger,#ef4444)]',
                              sc.tone === 'warning' && 'text-[var(--color-warning,#f59e0b)]',
                              sc.tone === 'default' && 'text-[var(--color-text-muted)]',
                            )} />
                            <Badge tone={sc.tone}>{sc.label}</Badge>
                          </span>
                          {r.reason && (
                            <div className="text-[10.5px] text-[var(--color-text-muted)] mt-0.5">{r.reason}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 보류 안내 */}
        {stats && blocked > 0 && (
          <div className="rounded-md bg-[var(--color-warning-soft,#fffbeb)] border border-[var(--color-warning,#f59e0b)]/30 px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            <b className="text-[var(--color-text)]">보류 {blocked}건이 있어요.</b>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              {stats.unmatched > 0 && <li><b>회원 없음 {stats.unmatched}건</b>: 해당 이름이 회원 DB에 없습니다. 웹에서 먼저 가입해야 발급됩니다.</li>}
              {stats.ambiguous > 0 && <li><b>동명이인 {stats.ambiguous}건</b>: 같은 이름이 여러 명이라 자동 매칭이 안 됩니다. 휴대폰 번호로 지정이 필요해요(개발자에게 요청).</li>}
            </ul>
          </div>
        )}

        {!preview && !loading && (
          <p className="text-center text-[12.5px] text-[var(--color-text-muted)] py-6">
            먼저 <b>미리보기 (dry-run)</b> 를 눌러 매칭 결과를 확인하세요. 이 단계에서는 DB에 아무것도 저장되지 않습니다.
          </p>
        )}
      </div>
    </Modal>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'danger' | 'default' }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] px-3 py-2.5 bg-white">
      <div className={cn(
        'text-[20px] font-semibold tabular-nums',
        tone === 'success' && 'text-[var(--color-success,#22c55e)]',
        tone === 'danger' && value > 0 && 'text-[var(--color-danger,#ef4444)]',
        tone === 'warning' && value > 0 && 'text-[var(--color-warning,#f59e0b)]',
        (tone === 'default' || ((tone === 'danger' || tone === 'warning') && value === 0)) && 'text-[var(--color-text)]',
      )}>
        {value}
      </div>
      <div className="text-[11.5px] text-[var(--color-text-muted)]">{label}</div>
    </div>
  );
}
