'use client';

import { Fragment, useState } from 'react';
import { Bell } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig } from '@/lib/config';
import { formatKoreanDate, cn } from '@/lib/utils';
import type { Notice } from '@/types';

export default function Notices() {
  const { notices, markNoticeRead } = useApp();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const unreadCount = notices.filter(n => !n.isRead).length;

  const handleToggle = (notice: Notice) => {
    if (expandedId === notice.id) {
      setExpandedId(null);
    } else {
      setExpandedId(notice.id);
      if (!notice.isRead) markNoticeRead(notice.id);
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Page heading */}
      <div>
        <h1 className="page-title">공지사항</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          {unreadCount > 0 ? (
            <>
              <span className="text-[var(--color-primary)] font-medium">{unreadCount}건</span>의 읽지 않은 공지 · 전체 {notices.length}건
            </>
          ) : (
            <>전체 공지 {notices.length}건</>
          )}
        </p>
      </div>

      {/* List */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        {notices.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
              <Bell size={18} className="text-[var(--color-text-muted)]" />
            </div>
            <p className="text-[13.5px] text-[var(--color-text)] font-medium mb-1">새 공지가 없어요</p>
            <p className="text-[12.5px] text-[var(--color-text-muted)] max-w-[400px] mx-auto leading-relaxed">
              운영진이 공지를 올리면 여기에 표시되고, 첫 줄은 위 알림에서도 볼 수 있어요.
            </p>
          </div>
        ) : (
          <div className="scroll-x">
          <table className="responsive-table" style={{ minWidth: 560 }}>
            <thead>
              <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                <th className="text-left font-medium px-4 py-2.5 w-[60px]">상태</th>
                <th className="text-left font-medium px-4 py-2.5">제목</th>
                <th className="text-left font-medium px-4 py-2.5 w-[200px]">대상</th>
                <th className="text-right font-medium px-4 py-2.5 w-[120px]">등록일</th>
              </tr>
            </thead>
            <tbody>
              {notices.map(notice => {
                const isExpanded = expandedId === notice.id;
                return (
                  <Fragment key={notice.id}>
                    <tr
                      onClick={() => handleToggle(notice)}
                      className={cn(
                        'border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-subtle)] transition-colors cursor-pointer',
                        isExpanded && 'bg-[var(--color-bg-subtle)]'
                      )}
                    >
                      <td className="px-4 py-3">
                        {notice.isRead ? (
                          <span className="text-[11px] text-[var(--color-text-muted)] border border-[var(--color-border)] rounded px-1.5 py-0.5">
                            읽음
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium bg-[var(--color-primary-bg)] text-[var(--color-primary)] border border-[var(--color-primary-border)] rounded px-1.5 py-0.5">
                            NEW
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p
                          className={cn(
                            'text-[13px] truncate',
                            notice.isRead
                              ? 'text-[var(--color-text-secondary)]'
                              : 'text-[var(--color-text)] font-medium'
                          )}
                        >
                          {notice.title}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {notice.targetSessions && notice.targetSessions.length > 0 ? (
                            notice.targetSessions.map(s => {
                              const config = sessionTypeConfig[s];
                              return (
                                <span
                                  key={s}
                                  className="text-[11px] px-1.5 py-0.5 rounded font-medium"
                                  style={{ backgroundColor: config.bgColor, color: config.textColor }}
                                >
                                  {config.label}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-[12px] text-[var(--color-text-muted)]">전체</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)] tabular-nums">
                        {formatKoreanDate(notice.createdAt, 'yyyy.M.d')}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr
                        className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]"
                      >
                        <td colSpan={4} className="px-4 py-4">
                          <div className="bg-white border border-[var(--color-border)] rounded p-4">
                            <h3 className="text-[14px] font-semibold text-[var(--color-text)] mb-2">
                              {notice.title}
                            </h3>
                            <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-line">
                              {notice.content}
                            </p>
                            <p className="text-[12px] text-[var(--color-text-muted)] mt-3 pt-3 border-t border-[var(--color-border-subtle)] tabular-nums">
                              등록일 {formatKoreanDate(notice.createdAt, 'yyyy년 M월 d일')}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
