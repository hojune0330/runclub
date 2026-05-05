'use client';

import { useState } from 'react';
import { Plus, Edit3, Trash2, Send } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig } from '@/lib/config';
import { formatKoreanDate, cn } from '@/lib/utils';
import { Modal, FormField, Badge } from '@/components/ui';
import type { SessionType } from '@/types';

export default function NoticeManagement() {
  const { notices, createNotice, deleteNotice } = useApp();
  const [showCreate, setShowCreate] = useState(false);

  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTargets, setFormTargets] = useState<SessionType[]>([]);

  const toggleTarget = (type: SessionType) => {
    setFormTargets(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const handleCreate = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    await createNotice({
      title: formTitle.trim(),
      content: formContent.trim(),
      targetSessions: formTargets.length > 0 ? formTargets : undefined,
    });
    setShowCreate(false);
    setFormTitle('');
    setFormContent('');
    setFormTargets([]);
  };

  const handleDelete = async (noticeId: string) => {
    if (confirm('이 공지를 삭제하시겠습니까?')) {
      await deleteNotice(noticeId);
    }
  };

  return (
    <div className="max-w-[1400px] space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--color-text)]">공지사항</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">전체 {notices.length}건</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <Plus size={15} />
          공지 작성
        </button>
      </div>

      <div className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
              <th className="text-left font-medium px-4 py-2.5 w-[60px]">번호</th>
              <th className="text-left font-medium px-4 py-2.5">제목</th>
              <th className="text-left font-medium px-4 py-2.5 w-[240px]">대상</th>
              <th className="text-left font-medium px-4 py-2.5 w-[150px]">작성일</th>
              <th className="text-right font-medium px-4 py-2.5 w-[110px]">관리</th>
            </tr>
          </thead>
          <tbody>
            {notices.length === 0 ? (
              <tr><td colSpan={5} className="py-14 text-center text-[13px] text-[var(--color-text-muted)]">등록된 공지사항이 없습니다.</td></tr>
            ) : (
              notices.map((n, i) => (
                <tr key={n.id} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)]">
                  <td className="px-4 py-3 text-[var(--color-text-muted)] tabular-nums">{notices.length - i}</td>
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-[var(--color-text)] mb-0.5">{n.title}</p>
                    <p className="text-[12px] text-[var(--color-text-muted)] line-clamp-1">{n.content}</p>
                  </td>
                  <td className="px-4 py-3">
                    {n.targetSessions && n.targetSessions.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {n.targetSessions.map(s => {
                          const cfg = sessionTypeConfig[s];
                          return (
                            <span
                              key={s}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
                              style={{ backgroundColor: cfg.bgColor, color: cfg.textColor }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                              {cfg.label}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <Badge tone="muted">전체</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)] tabular-nums">
                    {formatKoreanDate(n.createdAt, 'yyyy.M.d HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] rounded transition-colors">
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(n.id)}
                        className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] rounded transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <Modal title="공지 작성" onClose={() => setShowCreate(false)} size="lg">
          <div className="space-y-4">
            <FormField label="제목" required>
              <input
                type="text"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="공지 제목을 입력하세요"
                className="form-input"
              />
            </FormField>
            <FormField label="내용" required>
              <textarea
                rows={6}
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                placeholder="공지 내용을 입력하세요"
                className="form-input resize-none"
              />
            </FormField>
            <FormField label="대상 세션" hint="미선택시 전체 공지">
              <div className="flex gap-2">
                {(Object.entries(sessionTypeConfig) as [SessionType, typeof sessionTypeConfig.ebw][]).map(([k, cfg]) => {
                  const checked = formTargets.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleTarget(k)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded border text-[13px] transition-colors",
                        checked
                          ? "bg-[var(--color-primary-bg)] border-[var(--color-primary-border)] text-[var(--color-primary)]"
                          : "bg-white border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </FormField>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)]">
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={!formTitle.trim() || !formContent.trim()}
                className={cn(
                  "flex-1 py-2 text-[13px] rounded flex items-center justify-center gap-1.5 transition-colors",
                  formTitle.trim() && formContent.trim()
                    ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                    : "bg-[var(--color-bg-hover)] text-[var(--color-text-disabled)] cursor-not-allowed"
                )}
              >
                <Send size={13} />
                발송
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
