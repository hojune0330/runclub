'use client';

import { useEffect, useMemo, useState } from 'react';
import { Shield, RefreshCw, Filter, ChevronDown } from 'lucide-react';
import { api, AuthExpiredError } from '@/lib/api';
import { useAuth } from '@/store/AuthContext';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';

/**
 * PR-5: Admin audit log viewer.
 *
 * Read-only listing of every admin-initiated state change captured by
 * `logAdminAction()`. Rows are returned newest-first with cursor pagination
 * (`nextBefore`).
 *
 * The UI focuses on quick "who did what to whom, and when" answers rather
 * than full forensic detail — heavy fields (before_value/after_value, full
 * UA strings) are intentionally hidden behind an expand control to keep the
 * default view scannable.
 */

interface AuditEntry {
  id: number;
  adminId: string;
  adminName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  summary: string | null;
  beforeValue: any;
  afterValue: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  'member.create': '회원 등록',
  'member.update': '회원 정보 수정',
  'member.delete': '회원 삭제',
  'member.activate': '회원 활성화',
  'member.deactivate': '회원 비활성화',
  'member.reset_password': '비밀번호 초기화',
  'member.role_change': '권한 변경',
  'session.create': '세션 생성',
  'session.update': '세션 수정',
  'session.delete': '세션 삭제',
  'pass.issue': '수강권 발급',
  'pass.pause': '수강권 일시정지',
  'pass.resume': '수강권 재개',
  'pass.refund': '수강권 환불',
  'notice.create': '공지 등록',
  'notice.delete': '공지 삭제',
  'reservation.update_status': '예약 상태 변경',
  'qr.generate': 'QR 발급',
};

const TARGET_LABEL: Record<string, string> = {
  member: '회원',
  session: '세션',
  pass: '수강권',
  notice: '공지',
  reservation: '예약',
  qr: 'QR',
};

function actionTone(action: string): 'success' | 'warning' | 'danger' | 'default' {
  if (action.endsWith('.delete') || action === 'member.deactivate') return 'danger';
  if (
    action === 'member.reset_password' ||
    action === 'member.role_change' ||
    action === 'pass.refund' ||
    action === 'pass.pause'
  )
    return 'warning';
  if (action.endsWith('.create') || action === 'pass.issue' || action === 'member.activate')
    return 'success';
  return 'default';
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AuditLog() {
  const { user, logout } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  // Filters
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterTargetType, setFilterTargetType] = useState<string>('');

  const isAdmin = user?.role === 'admin';

  const load = async (reset: boolean) => {
    if (!isAdmin) return;
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api.audit.list({
        limit: 100,
        before: reset ? undefined : nextBefore ?? undefined,
        action: filterAction || undefined,
        targetType: filterTargetType || undefined,
      });
      setEntries(prev => (reset ? res.entries : [...prev, ...res.entries]));
      setNextBefore(res.nextBefore);
    } catch (e: any) {
      if (e instanceof AuthExpiredError) {
        logout();
        return;
      }
      setError(e?.message ?? '감사 로그를 불러오지 못했습니다');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAction, filterTargetType]);

  const actionOptions = useMemo(
    () => Object.entries(ACTION_LABEL).sort((a, b) => a[1].localeCompare(b[1])),
    []
  );

  if (!isAdmin) {
    return (
      <div className="max-w-[1400px] py-12 text-center text-[13px] text-[var(--color-text-muted)]">
        관리자 권한이 필요합니다.
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield size={18} className="text-[var(--color-primary)]" />
            관리자 감사 로그
          </h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
            관리자가 수행한 모든 변경 사항이 기록됩니다 · 최근 {entries.length}건 표시
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="h-9 inline-flex items-center gap-1.5 px-3 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[var(--color-border)] rounded-md px-3 md:px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3 md:flex-wrap">
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)] shrink-0">
          <Filter size={12} />
          필터
        </div>

        <div className="relative">
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="appearance-none h-9 pl-3 pr-8 text-[13px] border border-[var(--color-border)] rounded bg-white focus:outline-none focus:border-[var(--color-primary)]"
          >
            <option value="">전체 행동</option>
            {actionOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none"
          />
        </div>

        <div className="relative">
          <select
            value={filterTargetType}
            onChange={e => setFilterTargetType(e.target.value)}
            className="appearance-none h-9 pl-3 pr-8 text-[13px] border border-[var(--color-border)] rounded bg-white focus:outline-none focus:border-[var(--color-primary)]"
          >
            <option value="">전체 대상</option>
            {Object.entries(TARGET_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none"
          />
        </div>

        {(filterAction || filterTargetType) && (
          <button
            onClick={() => {
              setFilterAction('');
              setFilterTargetType('');
            }}
            className="h-9 px-3 text-[12.5px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            필터 해제
          </button>
        )}

        <div className="flex-1" />
      </div>

      {/* Table */}
      <div className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="scroll-x">
        <table className="responsive-table" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
              <th className="text-left font-medium px-3 py-2.5 w-[150px]">시각</th>
              <th className="text-left font-medium px-3 py-2.5 w-[140px]">관리자</th>
              <th className="text-left font-medium px-3 py-2.5 w-[150px]">행동</th>
              <th className="text-left font-medium px-3 py-2.5 w-[180px]">대상</th>
              <th className="text-left font-medium px-3 py-2.5">요약</th>
              <th className="text-left font-medium px-3 py-2.5 w-[120px]">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-14 text-center text-[13px] text-[var(--color-text-muted)]">
                  불러오는 중...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="py-14 text-center text-[13px] text-[var(--color-danger)]">
                  {error}
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-14 text-center text-[13px] text-[var(--color-text-muted)]">
                  기록된 감사 로그가 없습니다.
                </td>
              </tr>
            ) : (
              entries.map(e => {
                const isExp = !!expanded[e.id];
                const tLabel = e.targetType ? TARGET_LABEL[e.targetType] ?? e.targetType : '';
                return (
                  <>
                    <tr
                      key={e.id}
                      onClick={() => setExpanded(prev => ({ ...prev, [e.id]: !prev[e.id] }))}
                      className={cn(
                        'border-b border-[var(--color-border-subtle)] last:border-0 cursor-pointer transition-colors',
                        isExp ? 'bg-[var(--color-bg-subtle)]' : 'hover:bg-[var(--color-bg-subtle)]'
                      )}
                    >
                      <td className="px-3 py-2.5 text-[var(--color-text-secondary)] tabular-nums text-[12px]">
                        {formatTime(e.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-text)]">
                        {e.adminName || (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                        <p className="text-[11px] text-[var(--color-text-muted)] tabular-nums truncate">
                          {e.adminId}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={actionTone(e.action)}>
                          {ACTION_LABEL[e.action] ?? e.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                        {tLabel && (
                          <span className="text-[11.5px] text-[var(--color-text-muted)] mr-1">
                            [{tLabel}]
                          </span>
                        )}
                        {e.targetName || (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                        {e.summary || (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-text-muted)] tabular-nums text-[12px]">
                        {e.ipAddress || '—'}
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`${e.id}-detail`} className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border-subtle)]">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
                            <div>
                              <p className="text-[11px] text-[var(--color-text-muted)] mb-1 font-semibold">변경 전</p>
                              <pre className="bg-white border border-[var(--color-border)] rounded p-2 overflow-x-auto text-[var(--color-text-secondary)] whitespace-pre-wrap">
                                {e.beforeValue ? JSON.stringify(e.beforeValue, null, 2) : '—'}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[11px] text-[var(--color-text-muted)] mb-1 font-semibold">변경 후</p>
                              <pre className="bg-white border border-[var(--color-border)] rounded p-2 overflow-x-auto text-[var(--color-text-secondary)] whitespace-pre-wrap">
                                {e.afterValue ? JSON.stringify(e.afterValue, null, 2) : '—'}
                              </pre>
                            </div>
                            {e.userAgent && (
                              <div className="md:col-span-2">
                                <p className="text-[11px] text-[var(--color-text-muted)] mb-1 font-semibold">User-Agent</p>
                                <p className="text-[var(--color-text-secondary)] break-all">{e.userAgent}</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {nextBefore && !loading && (
        <div className="flex justify-center">
          <button
            onClick={() => load(false)}
            disabled={loadingMore}
            className="h-10 px-5 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
          >
            {loadingMore ? '불러오는 중...' : '이전 100건 더 보기'}
          </button>
        </div>
      )}
    </div>
  );
}
