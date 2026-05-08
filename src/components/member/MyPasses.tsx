'use client';

import { useApp } from '@/store/AppContext';
import { sessionTypeConfig, passStatusConfig } from '@/lib/config';
import { getDaysUntilExpiry, isPassExpiringSoon, formatKoreanDate, cn } from '@/lib/utils';
import { Ticket, HelpCircle, ShoppingBag } from 'lucide-react';
import type { MemberPass } from '@/types';

export default function MyPasses() {
  const { memberPasses, currentMember, sessionTags } = useApp();
  const myPasses = memberPasses.filter(p => p.memberId === currentMember.id);
  const activePasses = myPasses.filter(p => p.status === 'active');
  const inactivePasses = myPasses.filter(p => p.status !== 'active');

  // PR-A: 수강권에 부착된 tags 가 있으면 그 라벨을, 없으면 legacy
  // applicableSessions 로 fallback. ['*'] 한 개면 옴니패스로 표시.
  const formatTagLabel = (pass: MemberPass): string | null => {
    if (!pass.tags || pass.tags.length === 0) return null;
    if (pass.tags.length === 1 && pass.tags[0] === '*') return '전체 세션';
    const labels = pass.tags
      .map(id => sessionTags.find(t => t.id === id)?.label)
      .filter((l): l is string => !!l);
    return labels.length > 0 ? labels.join(', ') : null;
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Page heading */}
      <div>
        <h1 className="page-title">내 수강권</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          활성 수강권 {activePasses.length}건 · 전체 {myPasses.length}건
        </p>
      </div>

      {/* Active passes */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">사용 중인 수강권</h2>
          <span className="text-[12px] text-[var(--color-text-muted)]">{activePasses.length}건</span>
        </div>

        {activePasses.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
              <Ticket size={18} className="text-[var(--color-text-muted)]" />
            </div>
            <p className="text-[13.5px] text-[var(--color-text)] font-medium mb-1">보유 중인 수강권이 없습니다</p>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mb-4 max-w-[400px] mx-auto leading-relaxed">
              세션을 예약하려면 수강권이 필요합니다. 아래에서 바로 구매하거나 현장에서 코치에게 문의해주세요.
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('member:navigate', { detail: 'catalog' }))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded transition-colors"
              >
                <ShoppingBag size={13} />
                수강권 구매
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('member:navigate', { detail: 'help' }))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] bg-white border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] rounded transition-colors"
              >
                <HelpCircle size={13} />
                도움말
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {activePasses.map((pass, idx) => {
              const daysLeft = getDaysUntilExpiry(pass);
              const expiringSoon = isPassExpiringSoon(pass);
              const isCount = pass.category === 'count';
              const used = isCount && pass.totalCount ? pass.totalCount - (pass.remainingCount || 0) : 0;
              const progress = isCount && pass.totalCount ? (used / pass.totalCount) * 100 : 0;

              const tagLabel = formatTagLabel(pass);
              const applicableLabels =
                tagLabel ??
                (pass.applicableSessions === 'all'
                  ? '전체 세션'
                  : pass.applicableSessions.map(s => sessionTypeConfig[s].label).join(', '));

              const passColor =
                pass.applicableSessions === 'all'
                  ? 'var(--color-primary)'
                  : sessionTypeConfig[pass.applicableSessions[0]]?.color || 'var(--color-text-muted)';

              const borderRight = idx % 2 === 0 ? 'md:border-r' : '';

              return (
                <div
                  key={pass.id}
                  className={cn(
                    'p-4 border-b border-[var(--color-border-subtle)]',
                    borderRight
                  )}
                  style={{ borderRightColor: 'var(--color-border-subtle)' }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-1 h-10 rounded-sm shrink-0"
                        style={{ backgroundColor: passColor }}
                      />
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-[var(--color-text)] truncate">
                          {pass.productName}
                        </p>
                        <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                          {applicableLabels}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {isCount && pass.remainingCount !== undefined && pass.remainingCount <= 3 && pass.remainingCount > 0 && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded border bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]">
                          잔여 {pass.remainingCount}회
                        </span>
                      )}
                      <span
                        className={cn(
                          'text-[11px] font-medium px-2 py-0.5 rounded border',
                          expiringSoon
                            ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]'
                            : 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]'
                        )}
                      >
                        {expiringSoon ? `D-${daysLeft}` : '사용 중'}
                      </span>
                    </div>
                  </div>

                  {isCount && pass.totalCount ? (
                    <div>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <div className="flex items-baseline gap-1">
                          <span className="kpi-num">
                            {pass.remainingCount}
                          </span>
                          <span className="text-[12px] text-[var(--color-text-muted)]">
                            / {pass.totalCount}회 남음
                          </span>
                        </div>
                        <span className="text-[12px] text-[var(--color-text-muted)] tabular-nums">
                          {used}회 사용
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[var(--color-bg-hover)] rounded overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{ width: `${100 - progress}%`, backgroundColor: passColor }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="page-title leading-none">
                        무제한
                      </span>
                      <span className="text-[12px] text-[var(--color-text-muted)]">
                        {pass.category === 'season' ? '시즌권' : '월권'}
                      </span>
                    </div>
                  )}

                  <dl className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] grid grid-cols-2 gap-y-1.5 text-[12px]">
                    <dt className="text-[var(--color-text-muted)]">시작일</dt>
                    <dd className="text-[var(--color-text)] text-right tabular-nums">
                      {formatKoreanDate(pass.startDate, 'yyyy.M.d')}
                    </dd>
                    <dt className="text-[var(--color-text-muted)]">만료일</dt>
                    <dd
                      className={cn(
                        'text-right tabular-nums',
                        daysLeft <= 7
                          ? 'text-[var(--color-danger)]'
                          : daysLeft <= 14
                          ? 'text-[var(--color-warning)]'
                          : 'text-[var(--color-text)]'
                      )}
                    >
                      {formatKoreanDate(pass.expiryDate, 'yyyy.M.d')} ({daysLeft > 0 ? `D-${daysLeft}` : '오늘'})
                    </dd>
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Inactive passes */}
      {inactivePasses.length > 0 && (
        <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">만료 / 정지</h2>
            <span className="text-[12px] text-[var(--color-text-muted)]">{inactivePasses.length}건</span>
          </div>
          <div className="scroll-x">
          <table className="responsive-table" style={{ minWidth: 640 }}>
            <thead>
              <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                <th className="text-left font-medium px-4 py-2.5">수강권</th>
                <th className="text-left font-medium px-4 py-2.5 w-[160px]">적용 세션</th>
                <th className="text-left font-medium px-4 py-2.5 w-[140px]">만료일</th>
                <th className="text-right font-medium px-4 py-2.5 w-[100px]">상태</th>
              </tr>
            </thead>
            <tbody>
              {inactivePasses.map(pass => {
                const tagLabel = formatTagLabel(pass);
                const applicableLabels =
                  tagLabel ??
                  (pass.applicableSessions === 'all'
                    ? '전체 세션'
                    : pass.applicableSessions.map(s => sessionTypeConfig[s].label).join(', '));
                const statusConf = passStatusConfig[pass.status];
                return (
                  <tr
                    key={pass.id}
                    className="border-b border-[var(--color-border-subtle)] last:border-0"
                  >
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{pass.productName}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{applicableLabels}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] tabular-nums">
                      {formatKoreanDate(pass.expiryDate, 'yyyy.M.d')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium"
                        style={{ backgroundColor: statusConf.bgColor, color: statusConf.color }}
                      >
                        {statusConf.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </section>
      )}
    </div>
  );
}
