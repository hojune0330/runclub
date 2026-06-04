'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, Trash2, SlidersHorizontal, Info } from 'lucide-react';
import { api } from '@/lib/api';

type MetricDef = { id: string; key: string; label: string; unit?: string; valueType: string; sortOrder: number };

const VALUE_TYPES = [
  { value: 'number', label: '숫자' },
  { value: 'percent', label: '퍼센트(%)' },
  { value: 'text', label: '텍스트' },
];

/** 코치/관리자용: 건강 클래스 동적 지표 정의(BaroJaenfit 등). */
export default function ClassMetricDefs({ classId }: { classId: string }) {
  const [defs, setDefs] = useState<MetricDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [unit, setUnit] = useState('');
  const [valueType, setValueType] = useState('number');

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.classMetrics.list(classId); setDefs(res.metrics); }
    finally { setLoading(false); }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await api.classMetrics.create(classId, {
        key: key.trim() || label.trim(),
        label: label.trim(),
        unit: unit.trim() || undefined,
        valueType,
      });
      setLabel(''); setKey(''); setUnit('');
      await load();
    } catch (e: any) { alert(e?.message ?? '추가 실패'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('이 지표를 삭제할까요? (기존 기록의 값은 유지돼요)')) return;
    try { await api.classMetrics.remove(classId, id); await load(); }
    catch (e: any) { alert(e?.message ?? '삭제 실패'); }
  };

  return (
    <section className="bg-white border border-[var(--color-border)] rounded-md p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <SlidersHorizontal size={15} className="text-[var(--color-primary)]" />
        <h3 className="text-[14px] font-semibold text-[var(--color-text)]">건강 지표 설정</h3>
      </div>
      <p className="text-[11.5px] text-[var(--color-text-muted)] flex items-start gap-1">
        <Info size={12} className="mt-0.5 shrink-0" />
        혈당 외에 회원이 기록할 측정 항목(예: 골격근량, 체지방률, 허리둘레)을 자유롭게 정의하세요. BaroJaenfit 같은 측정 결과도 여기에 추가하면 됩니다.
      </p>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] items-end">
        <label className="block">
          <span className="block text-[11.5px] text-[var(--color-text-secondary)] mb-1">지표 이름</span>
          <input value={label} onChange={e => setLabel(e.target.value)} maxLength={30} placeholder="예: 골격근량"
            className="w-full px-2.5 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
        </label>
        <label className="block">
          <span className="block text-[11.5px] text-[var(--color-text-secondary)] mb-1">단위</span>
          <input value={unit} onChange={e => setUnit(e.target.value)} maxLength={10} placeholder="kg"
            className="w-20 px-2.5 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
        </label>
        <label className="block">
          <span className="block text-[11.5px] text-[var(--color-text-secondary)] mb-1">유형</span>
          <select value={valueType} onChange={e => setValueType(e.target.value)}
            className="px-2.5 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none">
            {VALUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <button onClick={add} disabled={busy || !label.trim()}
          className="inline-flex items-center gap-1 px-3 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} 추가
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin text-[var(--color-text-muted)]" /></div>
      ) : defs.length === 0 ? (
        <p className="text-[12px] text-[var(--color-text-muted)] py-2">아직 추가한 지표가 없어요. (혈당은 기본 제공돼요)</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {defs.map(d => (
            <li key={d.id} className="inline-flex items-center gap-1.5 border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] rounded-full pl-3 pr-1.5 py-1">
              <span className="text-[12.5px] text-[var(--color-text)]">{d.label}{d.unit ? ` (${d.unit})` : ''}</span>
              <button onClick={() => remove(d.id)} className="text-[var(--color-text-muted)] hover:text-rose-600"><Trash2 size={12} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
