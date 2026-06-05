'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, Trash2, HeartPulse, Droplet, Scale, X, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/AuthContext';
import { cn } from '@/lib/utils';
import { GLUCOSE_TARGET, GLUCOSE_TARGET_LABEL } from '@/lib/policy';
import { GlucoseGuardrailCard } from '@/components/coaching/PolicyInfo';
import type { ActivityLog } from '@/types';

type MetricDef = { id: string; key: string; label: string; unit?: string; valueType: string; sortOrder: number };

const HEALTH_KINDS = [
  { value: 'glucose', label: '혈당', icon: Droplet },
  { value: 'body_comp', label: '체성분', icon: Scale },
  { value: 'weight', label: '체중', icon: Scale },
  { value: 'fasting', label: '공복/식단', icon: HeartPulse },
];

function inRange(v?: number): boolean {
  return typeof v === 'number' && v >= GLUCOSE_TARGET.LOW && v <= GLUCOSE_TARGET.HIGH;
}

export default function HealthLog({ classId }: { classId?: string }) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [defs, setDefs] = useState<MetricDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, m] = await Promise.all([
        api.activities.list({ classId: classId || undefined, memberId: user?.id, limit: 60 }),
        classId ? api.classMetrics.list(classId).catch(() => ({ metrics: [] as MetricDef[] })) : Promise.resolve({ metrics: [] as MetricDef[] }),
      ]);
      setLogs(a.activities.filter(x => ['glucose', 'body_comp', 'weight', 'fasting', 'custom'].includes(x.kind)));
      setDefs(m.metrics);
    } finally { setLoading(false); }
  }, [classId, user?.id]);

  useEffect(() => { void load(); }, [load]);

  // 내 혈당 "목표 범위 내 비율" 계산(본인만 보는 상세)
  const glucoseLogs = logs.filter(l => l.kind === 'glucose' && typeof (l.metrics as any)?.glucose_mgdl === 'number');
  const inRangeCount = glucoseLogs.filter(l => inRange((l.metrics as any).glucose_mgdl)).length;
  const inRangePct = glucoseLogs.length > 0 ? Math.round((inRangeCount / glucoseLogs.length) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--color-text)] flex items-center gap-1.5">
          <HeartPulse size={14} className="text-[var(--color-primary)]" /> 건강 기록
        </h3>
        <button onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-[12.5px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded">
          <Plus size={13} /> 측정 기록
        </button>
      </div>

      {/* 내 혈당 목표 범위 비율 요약(본인만) */}
      {inRangePct !== null && (
        <div className="bg-white border border-[var(--color-border)] rounded-md p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12.5px] text-[var(--color-text-secondary)] inline-flex items-center gap-1">
              <TrendingUp size={13} className="text-emerald-600" /> 내 목표 범위({GLUCOSE_TARGET_LABEL}) 비율
            </span>
            <strong className="text-[18px] font-bold text-emerald-600 tabular-nums">{inRangePct}%</strong>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--color-bg-subtle)] overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.max(3, inRangePct)}%` }} />
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
            최근 {glucoseLogs.length}회 측정 중 {inRangeCount}회가 목표 범위 안에 있었어요. (이 상세 수치는 나와 코치에게만 보여요)
          </p>
        </div>
      )}

      {showForm && (
        <HealthForm classId={classId} defs={defs}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void load(); }} />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
            <Droplet size={20} className="text-[var(--color-text-muted)]" />
          </div>
          <p className="text-[13px] text-[var(--color-text)] font-medium mb-1">아직 측정 기록이 없어요</p>
          <p className="text-[12px] text-[var(--color-text-muted)]">‘측정 기록’으로 혈당·체성분 등을 남겨보세요.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map(l => <HealthCard key={l.id} log={l} defs={defs} onDeleted={load} />)}
        </ul>
      )}

      <GlucoseGuardrailCard />
    </div>
  );
}

function HealthCard({ log, defs, onDeleted }: { log: ActivityLog; defs: MetricDef[]; onDeleted: () => void }) {
  const metrics = (log.metrics ?? {}) as Record<string, any>;
  const kind = HEALTH_KINDS.find(k => k.value === log.kind);
  const Icon = kind?.icon ?? HeartPulse;
  const glucose = typeof metrics.glucose_mgdl === 'number' ? metrics.glucose_mgdl : null;
  const ok = inRange(glucose ?? undefined);

  const remove = async () => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    try { await api.activities.remove(log.id); onDeleted(); } catch (e: any) { alert(e?.message ?? '실패'); }
  };

  // 표시할 지표: glucose는 전용 처리, 나머지는 def 라벨/단위 매핑
  const extras = Object.entries(metrics).filter(([k]) => k !== 'glucose_mgdl');

  return (
    <li className="bg-white border border-[var(--color-border)] rounded-md p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-8 h-8 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)]"><Icon size={15} /></span>
          <div>
            <span className="text-[13px] font-medium text-[var(--color-text)]">{kind?.label ?? '건강'}</span>
            <p className="text-[11px] text-[var(--color-text-muted)]">{log.activityDate}</p>
          </div>
        </div>
        <button onClick={remove} className="text-[var(--color-text-muted)] hover:text-rose-600"><Trash2 size={14} /></button>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {glucose !== null && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium border',
            ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200')}>
            <Droplet size={11} /> 혈당 {glucose} mg/dL · {ok ? '범위 내' : '범위 밖'}
          </span>
        )}
        {extras.map(([k, v]) => {
          const def = defs.find(d => d.key === k);
          return (
            <span key={k} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)]">
              {def?.label ?? k}: {String(v)}{def?.unit ? ` ${def.unit}` : ''}
            </span>
          );
        })}
      </div>
      {log.note && <p className="text-[12px] text-[var(--color-text-secondary)] mt-2">{log.note}</p>}
    </li>
  );
}

function HealthForm({ classId, defs, onClose, onSaved }: { classId?: string; defs: MetricDef[]; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState('glucose');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [glucose, setGlucose] = useState('');
  const [dynamicVals, setDynamicVals] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const metrics: Record<string, unknown> = {};
      if (kind === 'glucose' && glucose.trim()) metrics.glucose_mgdl = Number(glucose);
      defs.forEach(d => {
        const raw = dynamicVals[d.key];
        if (raw != null && raw !== '') metrics[d.key] = d.valueType === 'text' ? raw : Number(raw);
      });
      await api.activities.create({
        classId: classId || undefined, kind, source: 'manual', activityDate: date,
        metrics: Object.keys(metrics).length ? metrics : undefined,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (e: any) { alert(e?.message ?? '저장 실패'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="sticky top-0 bg-white border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[var(--color-text)]">건강 측정 기록</h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={18} /></button>
        </header>
        <div className="p-4 space-y-3.5">
          <div>
            <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5">종류</span>
            <div className="flex flex-wrap gap-1.5">
              {HEALTH_KINDS.map(k => (
                <button key={k.value} onClick={() => setKind(k.value)}
                  className={cn('inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[12px] font-medium border',
                    kind === k.value ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-white text-[var(--color-text-secondary)] border-[var(--color-border)]')}>
                  <k.icon size={12} /> {k.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">날짜</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
          </label>

          {kind === 'glucose' && (
            <label className="block">
              <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">혈당 (mg/dL)</span>
              <input type="number" inputMode="numeric" value={glucose} onChange={e => setGlucose(e.target.value)}
                placeholder={`목표 범위 ${GLUCOSE_TARGET_LABEL}`}
                className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
              <span className="text-[11px] text-[var(--color-text-muted)] mt-1 block">상세 수치는 나와 코치에게만 보여요. 리더보드엔 “범위 내 비율(%)”만 반영됩니다.</span>
            </label>
          )}

          {/* 동적 지표(BaroJaenfit 등 코치 정의) */}
          {defs.map(d => (
            <label key={d.id} className="block">
              <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">{d.label}{d.unit ? ` (${d.unit})` : ''}</span>
              <input type={d.valueType === 'text' ? 'text' : 'number'} inputMode={d.valueType === 'text' ? 'text' : 'numeric'}
                value={dynamicVals[d.key] ?? ''} onChange={e => setDynamicVals(v => ({ ...v, [d.key]: e.target.value }))}
                className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
            </label>
          ))}

          <label className="block">
            <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">메모 (선택)</span>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="식사·컨디션 등 메모"
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none resize-none" />
          </label>

          <button onClick={submit} disabled={busy}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-[13.5px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} 기록 저장
          </button>
        </div>
      </div>
    </div>
  );
}
