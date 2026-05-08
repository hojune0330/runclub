'use client';

/**
 * PR-A: 세션 태그 마스터 CRUD UI.
 *
 * 어드민이 코드 변경 없이 세션 카테고리를 추가/수정/비활성화/삭제 할 수
 * 있게 한다. 시드 태그 (ebw / slowrun / marathon) 도 여기서 라벨·색상·표시
 * 순서를 바꿀 수 있다. 사용 중인 태그는 서버에서 삭제를 차단하므로
 * 관리자는 비활성화(isActive=false) 후 매핑 정리 → 삭제 순으로 운영한다.
 *
 * 보안:
 *  - 모든 mutating 호출은 서버 /api/tags 에서 어드민으로 강제됨
 *  - 입력값(id, label) 은 서버측에서 길이/패턴 다시 검증
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Tag as TagIcon, AlertCircle, RefreshCw, Power } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import type { SessionTag } from '@/types';
import { cn } from '@/lib/utils';

// 색상 프리셋 (Tailwind palette 와 통일감)
const COLOR_PRESETS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#64748b', // slate
];

const TAG_ID_REGEX = /^[a-z0-9][a-z0-9_-]{0,31}$/;

interface FormState {
  id: string;
  label: string;
  color: string;
  displayOrder: number;
  isActive: boolean;
}

const emptyForm: FormState = {
  id: '',
  label: '',
  color: COLOR_PRESETS[7], // blue
  displayOrder: 100,
  isActive: true,
};

export default function TagManagement() {
  const { sessionTags, refreshSessionTags, createSessionTag, updateSessionTag, deleteSessionTag } = useApp();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SessionTag | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 활성 태그 → 표시 순서, 비활성 태그 → 분리해서 맨 아래
  const sortedActive = useMemo(
    () =>
      [...sessionTags]
        .filter(t => t.isActive)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.label.localeCompare(b.label)),
    [sessionTags]
  );
  const sortedInactive = useMemo(
    () =>
      [...sessionTags]
        .filter(t => !t.isActive)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [sessionTags]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (tag: SessionTag) => {
    setEditing(tag);
    setForm({
      id: tag.id,
      label: tag.label,
      color: tag.color ?? COLOR_PRESETS[7],
      displayOrder: tag.displayOrder ?? 100,
      isActive: tag.isActive,
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
    setEditing(null);
    setFormError(null);
  };

  const validate = (f: FormState, isCreate: boolean): string | null => {
    const id = f.id.trim().toLowerCase();
    const label = f.label.trim();
    if (isCreate) {
      if (!id) return '태그 ID 를 입력해주세요';
      if (!TAG_ID_REGEX.test(id)) {
        return '태그 ID 는 소문자·숫자·하이픈(-)·언더스코어(_) 1~32자만 사용할 수 있습니다';
      }
      if (id === '*') return "'*' 는 예약된 태그입니다";
    }
    if (!label) return '라벨을 입력해주세요';
    if (label.length > 32) return '라벨은 32자 이하여야 합니다';
    if (!Number.isFinite(f.displayOrder)) return '표시 순서가 숫자가 아닙니다';
    return null;
  };

  const submit = async () => {
    const err = validate(form, !editing);
    if (err) {
      setFormError(err);
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        const ok = await updateSessionTag({
          id: editing.id,
          label: form.label.trim(),
          color: form.color || null,
          displayOrder: form.displayOrder,
          isActive: form.isActive,
        });
        if (ok) closeModal();
      } else {
        const ok = await createSessionTag({
          id: form.id.trim().toLowerCase(),
          label: form.label.trim(),
          color: form.color,
          displayOrder: form.displayOrder,
        });
        if (ok) closeModal();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (tag: SessionTag) => {
    const msg = `'${tag.label}' (${tag.id}) 태그를 삭제하시겠습니까?\n\n` +
      `사용 중인 세션·수강권 상품에 매핑되어 있다면 서버가 거절합니다.\n` +
      `먼저 비활성화한 뒤 매핑을 정리하는 것을 권장합니다.`;
    if (!confirm(msg)) return;
    await deleteSessionTag(tag.id);
  };

  const handleToggleActive = async (tag: SessionTag) => {
    await updateSessionTag({ id: tag.id, isActive: !tag.isActive });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshSessionTags();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">세션 태그 관리</h1>
          <p className="text-sm text-slate-500 mt-1">
            세션 종류와 수강권 적용 범위를 매칭하는 태그를 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            새로고침
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
            새 태그
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 md:p-4 text-sm text-blue-900 flex gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">태그 매칭 규칙</p>
          <ul className="list-disc pl-5 text-blue-800 space-y-0.5">
            <li>세션과 수강권에 같은 태그가 하나라도 겹치면 그 수강권으로 예약 가능합니다.</li>
            <li>수강권 편집에서 <span className="font-semibold">옴니패스</span>로 설정하면 모든 세션에 사용 가능합니다.</li>
            <li>태그 ID 는 영문 소문자·숫자·-·_ 만 가능하며 한 번 만든 후에는 라벨/색상만 수정할 수 있습니다.</li>
            <li>사용 중인 태그는 삭제할 수 없습니다. 비활성화 → 매핑 정리 → 삭제 순으로 진행하세요.</li>
          </ul>
        </div>
      </div>

      {/* Active Tags */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">활성 태그 ({sortedActive.length})</h2>
        {sortedActive.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            활성 태그가 없습니다. 위 “새 태그” 버튼으로 추가해주세요.
          </div>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {sortedActive.map(tag => (
              <TagRow
                key={tag.id}
                tag={tag}
                onEdit={() => openEdit(tag)}
                onDelete={() => handleDelete(tag)}
                onToggle={() => handleToggleActive(tag)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Inactive Tags */}
      {sortedInactive.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 mb-2">비활성 태그 ({sortedInactive.length})</h2>
          <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 opacity-70">
            {sortedInactive.map(tag => (
              <TagRow
                key={tag.id}
                tag={tag}
                onEdit={() => openEdit(tag)}
                onDelete={() => handleDelete(tag)}
                onToggle={() => handleToggleActive(tag)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-lg font-semibold text-slate-900">
                {editing ? `태그 수정 — ${editing.id}` : '새 태그'}
              </h3>
              <button
                onClick={closeModal}
                disabled={submitting}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                닫기
              </button>
            </header>

            <div className="px-5 py-4 space-y-4">
              {/* Tag ID (생성 시에만 입력 가능) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  태그 ID {!editing && <span className="text-red-500">*</span>}
                </label>
                {editing ? (
                  <div className="px-3 py-2 bg-slate-100 rounded-lg text-slate-600 text-sm font-mono">
                    {editing.id}
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={form.id}
                      onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                      placeholder="예: friday-free, morning, slowrun"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
                      maxLength={32}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      영문 소문자·숫자·하이픈(-)·언더스코어(_), 1~32자.
                      한 번 만든 후에는 변경할 수 없습니다.
                    </p>
                  </>
                )}
              </div>

              {/* Label */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  라벨 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="예: 슬로우 롱런, 금요 무료세션"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  maxLength={32}
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">색상</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={cn(
                        'w-8 h-8 rounded-full border-2 transition',
                        form.color === c ? 'border-slate-900 scale-110' : 'border-transparent'
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
                <input
                  type="text"
                  value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  placeholder="#3b82f6"
                  className="mt-2 w-32 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
                  maxLength={16}
                />
              </div>

              {/* Display Order */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">표시 순서</label>
                <input
                  type="number"
                  value={form.displayOrder}
                  onChange={e => setForm(f => ({ ...f, displayOrder: Number(e.target.value) }))}
                  min={0}
                  max={9999}
                  className="w-32 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <p className="text-xs text-slate-500 mt-1">숫자가 작을수록 먼저 표시됩니다 (기본 100).</p>
              </div>

              {/* Active toggle (수정 시에만) */}
              {editing && (
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  활성 태그 (체크 해제 시 새 세션·수강권 편집 화면에서 숨김)
                </label>
              )}

              {/* Preview */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">미리보기</label>
                <TagChip
                  tag={{
                    id: form.id || 'new',
                    label: form.label || '라벨',
                    color: form.color,
                    isActive: true,
                  }}
                />
              </div>

              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {formError}
                </div>
              )}
            </div>

            <footer className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? '저장 중…' : editing ? '저장' : '추가'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

interface TagRowProps {
  tag: SessionTag;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

function TagRow({ tag, onEdit, onDelete, onToggle }: TagRowProps) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 transition">
      <div className="flex items-center gap-3 min-w-0">
        <TagChip tag={tag} />
        <span className="text-xs text-slate-400 font-mono truncate">{tag.id}</span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onToggle}
          title={tag.isActive ? '비활성화' : '활성화'}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
        >
          <Power className="w-4 h-4" />
        </button>
        <button
          onClick={onEdit}
          title="수정"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          title="삭제"
          className="p-1.5 rounded hover:bg-red-50 text-red-600"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}

interface TagChipProps {
  tag: Pick<SessionTag, 'id' | 'label' | 'color' | 'isActive'>;
}

function TagChip({ tag }: TagChipProps) {
  const color = tag.color ?? '#64748b';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{
        backgroundColor: `${color}1a`, // ~10% alpha
        color,
        borderColor: `${color}55`,
      }}
    >
      <TagIcon className="w-3 h-3" />
      {tag.label}
    </span>
  );
}
