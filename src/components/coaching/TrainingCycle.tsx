'use client';

import { useEffect, useState, useCallback } from 'react';
import { Repeat, Loader2, Plus, Trash2, X, Sparkles, Target } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { TrainingPlan, BlockIntensity } from '@/types';

const INTENSITY_META: Record<BlockIntensity, { label: string; color: string; bg: string }> = {
  rest:     { label: '휴식',   color: '#64748b', bg: '#f1f5f9' },
  easy:     { label: '가볍게', color: '#0ea5e9', bg: '#e0f2fe' },
  moderate: { label: '보통',   color: '#22c55e', bg: '#dcfce7' },
  hard:     { label: '강하게', color: '#f59e0b', bg: '#fef3c7' },
  peak:     { label: '피크',   color: '#ef4444', bg: '#fee2e2' },
};

// 9.5일 주기 기본 템플릿(코치가 수정 가능). 합 = 9.5일.
const DEFAULT_BLOCKS = [
  { label: '리커버리', daySpan: 1.5, intensity: 'easy' as BlockIntensity, focus: '회복 조깅·스트레칭' },
  { label: '지구력', daySpan: 2, intensity: 'moderate' as BlockIntensity, focus: '편안한 거리 쌓기' },
  { label: '강도', daySpan: 2, intensity: 'hard' as BlockIntensity, focus: '인터벌·템포' },
  { label: '지구력', daySpan: 2, intensity: 'moderate' as BlockIntensity, focus: '롱런 빌드업' },
  { label: '피크/휴식', daySpan: 2, intensity: 'peak' as BlockIntensity, focus: '핵심 세션 후 휴식' },
];

export default function TrainingCycle({ classId, canManage }: { classId?: string; canManage?: boolean }) {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.trainingPlans.get(classId ? { classId } : {});
      setPlan(res.plan);
    } finally { setLoading(false); }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  // 개인 플랜은 본인이 직접 생성 가능. 클래스 플랜은 canManage(코치)만.
  const editable = classId ? !!canManage : true;

  const remove = async () => {
    if (!plan || !confirm('주기화 플랜을 삭제할까요?')) return;
    try { await api.trainingPlans.remove(plan.id); await load(); } catch (e: any) { alert(e?.message ?? '실패'); }
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <section className="bg-white border border-[var(--color-border)] rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-[var(--color-text)] flex items-center gap-1.5">
          <Repeat size={15} className="text-[var(--color-primary)]" /> 주기화 트레이닝
        </h3>
        {editable && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 text-[12.5px] text-[var(--color-primary)] font-medium">
            <Plus size={13} /> {plan ? '새로 설정' : '주기 만들기'}
          </button>
        )}
      </div>

      {!plan ? (
        <div className="text-center py-6">
          <div className="w-11 h-11 rounded-full bg-[var(--color-primary-bg)] grid place-items-center mx-auto mb-2.5">
            <Repeat size={18} className="text-[var(--color-primary)]" />
          </div>
          <p className="text-[13px] text-[var(--color-text)] font-medium mb-1">반복 트레이닝 주기를 만들어 보세요</p>
          <p className="text-[12px] text-[var(--color-text-muted)] max-w-xs mx-auto">
            9.5일 같은 나만의 사이클로 강약을 배분하면, 오늘 무엇을 해야 할지 한눈에 보여요.
          </p>
          {editable && (
            <button onClick={() => setShowForm(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded">
              <Sparkles size={14} /> 9.5일 주기 시작하기
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 오늘 위치 */}
          {plan.todayBlock && (
            <div className="rounded-md border p-3" style={{ background: INTENSITY_META[plan.todayBlock.intensity].bg, borderColor: INTENSITY_META[plan.todayBlock.intensity].color + '40' }}>
              <p className="text-[11.5px] text-[var(--color-text-secondary)]">오늘 ({plan.cycleDays}일 주기 · {((plan.cyclePosition ?? 0) + 1).toFixed(1)}일째)</p>
              <p className="text-[15px] font-bold mt-0.5" style={{ color: INTENSITY_META[plan.todayBlock.intensity].color }}>
                {plan.todayBlock.label} · {INTENSITY_META[plan.todayBlock.intensity].label}
              </p>
              {plan.todayBlock.focus && <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5">{plan.todayBlock.focus}</p>}
              {plan.todayBlock.targetDistanceM ? (
                <p className="text-[12px] text-[var(--color-text-muted)] mt-1 inline-flex items-center gap-1"><Target size={11} /> 목표 {(plan.todayBlock.targetDistanceM / 1000).toFixed(1)}km</p>
              ) : null}
            </div>
          )}

          {/* 사이클 블록 바 */}
          <div>
            <div className="flex h-2.5 rounded-full overflow-hidden">
              {(plan.blocks ?? []).map(b => (
                <div key={b.id} title={`${b.label} (${b.daySpan}일)`}
                  style={{ flex: b.daySpan, background: INTENSITY_META[b.intensity].color }} />
              ))}
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {(plan.blocks ?? []).map(b => {
                const isToday = plan.todayBlock?.id === b.id;
                return (
                  <li key={b.id} className={cn('flex items-center justify-between text-[12.5px] rounded px-2 py-1', isToday && 'bg-[var(--color-bg-subtle)]')}>
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: INTENSITY_META[b.intensity].color }} />
                      <span className="text-[var(--color-text)]">{b.label}</span>
                      {isToday && <span className="text-[10.5px] text-[var(--color-primary)] font-medium">오늘</span>}
                    </span>
                    <span className="text-[var(--color-text-muted)]">{b.daySpan}일 · {INTENSITY_META[b.intensity].label}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {editable && (
            <button onClick={remove} className="inline-flex items-center gap-1 text-[11.5px] text-[var(--color-text-muted)] hover:text-rose-600">
              <Trash2 size={12} /> 주기 삭제
            </button>
          )}
        </>
      )}

      {showForm && (
        <CycleForm classId={classId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void load(); }} />
      )}
    </section>
  );
}

function CycleForm({ classId, onClose, onSaved }: { classId?: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('9.5일 주기화');
  const [cycleDays, setCycleDays] = useState('9.5');
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [blocks, setBlocks] = useState(DEFAULT_BLOCKS.map(b => ({ ...b })));
  const [busy, setBusy] = useState(false);

  const total = blocks.reduce((s, b) => s + (Number(b.daySpan) || 0), 0);

  const updateBlock = (i: number, patch: Partial<typeof blocks[0]>) =>
    setBlocks(bs => bs.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  const addBlock = () => setBlocks(bs => [...bs, { label: '새 블록', daySpan: 1, intensity: 'moderate' as BlockIntensity, focus: '' }]);
  const removeBlock = (i: number) => setBlocks(bs => bs.filter((_, idx) => idx !== i));

  const submit = async () => {
    setBusy(true);
    try {
      await api.trainingPlans.create({
        classId, name: name.trim() || '주기화', cycleDays: Number(cycleDays) || 9.5, anchorDate,
        blocks: blocks.filter(b => b.label.trim()).map(b => ({
          label: b.label.trim(), daySpan: Number(b.daySpan) || 1, intensity: b.intensity, focus: b.focus?.trim() || undefined,
        })),
      });
      onSaved();
    } catch (e: any) { alert(e?.message ?? '저장 실패'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-lg rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="sticky top-0 bg-white border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[var(--color-text)]">주기화 설정</h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={18} /></button>
        </header>
        <div className="p-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block col-span-2">
              <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">이름</span>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={60}
                className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">주기(일)</span>
              <input type="number" step="0.5" value={cycleDays} onChange={e => setCycleDays(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">시작일</span>
              <input type="date" value={anchorDate} onChange={e => setAnchorDate(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">블록 (합 {total}일 / 주기 {cycleDays}일)</span>
              <button onClick={addBlock} className="text-[12px] text-[var(--color-primary)] inline-flex items-center gap-0.5"><Plus size={12} /> 추가</button>
            </div>
            <ul className="space-y-2">
              {blocks.map((b, i) => (
                <li key={i} className="border border-[var(--color-border-subtle)] rounded p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <input value={b.label} onChange={e => updateBlock(i, { label: e.target.value })} placeholder="블록 이름"
                      className="flex-1 px-2 py-1.5 text-[12.5px] border border-[var(--color-border)] rounded outline-none" />
                    <input type="number" step="0.5" value={b.daySpan} onChange={e => updateBlock(i, { daySpan: Number(e.target.value) })}
                      className="w-16 px-2 py-1.5 text-[12.5px] border border-[var(--color-border)] rounded outline-none" />
                    <span className="text-[11px] text-[var(--color-text-muted)]">일</span>
                    <button onClick={() => removeBlock(i)} className="text-[var(--color-text-muted)] hover:text-rose-600"><Trash2 size={13} /></button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(Object.keys(INTENSITY_META) as BlockIntensity[]).map(k => (
                      <button key={k} onClick={() => updateBlock(i, { intensity: k })}
                        className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium border', b.intensity === k ? 'text-white' : 'text-[var(--color-text-secondary)] bg-white')}
                        style={b.intensity === k ? { background: INTENSITY_META[k].color, borderColor: INTENSITY_META[k].color } : { borderColor: 'var(--color-border)' }}>
                        {INTENSITY_META[k].label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <button onClick={submit} disabled={busy}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-[13.5px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} 주기 저장
          </button>
        </div>
      </div>
    </div>
  );
}
