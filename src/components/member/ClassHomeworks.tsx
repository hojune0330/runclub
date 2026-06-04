'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ClipboardCheck, Plus, Loader2, CheckCircle2, Clock, XCircle, X, ChevronRight, ChevronLeft,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { HOMEWORK_METRIC_LABEL, formatDistance } from '@/lib/coaching';
import type { Homework, HomeworkSubmission } from '@/types';

const METRIC_OPTIONS = [
  { value: 'distance', label: '거리(누적)' },
  { value: 'count', label: '횟수' },
  { value: 'duration', label: '시간(분)' },
  { value: 'checkin', label: '출석' },
  { value: 'freeform', label: '자유 인증' },
];

function SubStatusBadge({ status }: { status: HomeworkSubmission['status'] }) {
  const map = {
    submitted: { label: '검토 대기', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
    verified: { label: '인증 완료', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
    rejected: { label: '재확인 필요', cls: 'bg-rose-50 text-rose-700 border-rose-200', Icon: XCircle },
  }[status];
  const Icon = map.Icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border', map.cls)}>
      <Icon size={11} /> {map.label}
    </span>
  );
}

export default function ClassHomeworks({ classId }: { classId: string }) {
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.homeworks.list(classId);
      setHomeworks(res.homeworks);
      setCanManage(res.canManage);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  if (detailId) {
    return <HomeworkDetail homeworkId={detailId} canManage={canManage} onBack={() => { setDetailId(null); void load(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--color-text)] flex items-center gap-1.5">
          <ClipboardCheck size={14} className="text-[var(--color-primary)]" /> 과제
        </h3>
        {canManage && (
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[12.5px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded">
            <Plus size={13} /> 과제 만들기
          </button>
        )}
      </div>

      {showCreate && <HomeworkForm classId={classId} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); void load(); }} />}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" /></div>
      ) : homeworks.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
            <ClipboardCheck size={20} className="text-[var(--color-text-muted)]" />
          </div>
          <p className="text-[13px] text-[var(--color-text)] font-medium mb-1">아직 과제가 없어요</p>
          <p className="text-[12px] text-[var(--color-text-muted)]">{canManage ? '‘과제 만들기’로 첫 주간 목표를 등록해보세요.' : '코치가 과제를 등록하면 여기에 표시돼요.'}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {homeworks.map(h => (
            <li key={h.id}>
              <button onClick={() => setDetailId(h.id)}
                className="w-full text-left bg-white border border-[var(--color-border)] rounded-md p-3.5 hover:border-[var(--color-primary)]/50 transition-colors group">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-[13.5px] font-semibold text-[var(--color-text)]">{h.title}</h4>
                    <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">
                      {HOMEWORK_METRIC_LABEL[h.metric]}
                      {h.targetValue != null && h.metric === 'distance' && ` · 목표 ${formatDistance(h.targetValue)}`}
                      {h.targetValue != null && h.metric !== 'distance' && h.metric !== 'freeform' && ` · 목표 ${h.targetValue}`}
                      {h.periodEnd && ` · ~${h.periodEnd}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {h.mySubmission ? <SubStatusBadge status={h.mySubmission.status} />
                      : <span className="text-[11px] text-[var(--color-text-muted)]">미제출</span>}
                    <ChevronRight size={15} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]" />
                  </div>
                </div>
                {canManage && (
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
                    제출 {h.submissionCount ?? 0} · 인증 {h.verifiedCount ?? 0}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HomeworkDetail({ homeworkId, canManage, onBack }: { homeworkId: string; canManage: boolean; onBack: () => void }) {
  const [hw, setHw] = useState<Homework | null>(null);
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [achieved, setAchieved] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.homeworks.get(homeworkId);
      setHw(res.homework);
      setSubmissions(res.submissions);
    } finally {
      setLoading(false);
    }
  }, [homeworkId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (autoSum = false) => {
    setBusy(true);
    try {
      await api.homeworks.submit(homeworkId, {
        achievedValue: achieved ? parseFloat(achieved) : undefined,
        autoSum,
        note: note.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
      });
      alert('제출 완료! 코치 확인 후 인증돼요.');
      await load();
    } catch (e: any) { alert(e?.message ?? '제출 실패'); }
    finally { setBusy(false); }
  };

  const verify = async (submissionId: string, status: 'verified' | 'rejected') => {
    let n: string | undefined;
    if (status === 'rejected') n = prompt('재확인 사유 (선택)') ?? undefined;
    try {
      const res = await api.homeworks.verify(homeworkId, submissionId, status, n);
      if (status === 'verified' && res.mileageEarned > 0) {
        // no alert spam; reflected in list
      }
      await load();
    } catch (e: any) { alert(e?.message ?? '처리 실패'); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" /></div>;
  if (!hw) return <div className="text-center py-12"><button onClick={onBack} className="text-[13px] text-[var(--color-primary)]">← 과제 목록</button></div>;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
        <ChevronLeft size={15} /> 과제 목록
      </button>

      <div className="bg-white border border-[var(--color-border)] rounded-md p-4">
        <h3 className="text-[15px] font-bold text-[var(--color-text)]">{hw.title}</h3>
        {hw.description && <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-1">{hw.description}</p>}
        <p className="text-[11.5px] text-[var(--color-text-muted)] mt-2">
          {HOMEWORK_METRIC_LABEL[hw.metric]}
          {hw.targetValue != null && hw.metric === 'distance' && ` · 목표 ${formatDistance(hw.targetValue)}`}
          {hw.targetValue != null && hw.metric !== 'distance' && hw.metric !== 'freeform' && ` · 목표 ${hw.targetValue}`}
          {hw.periodStart && ` · ${hw.periodStart}~${hw.periodEnd ?? ''}`}
        </p>
      </div>

      {/* 회원: 제출 폼 */}
      {!canManage && (
        <div className="bg-white border border-[var(--color-border)] rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[13px] font-semibold text-[var(--color-text)]">내 제출</h4>
            {hw.mySubmission && <SubStatusBadge status={hw.mySubmission.status} />}
          </div>
          {hw.metric !== 'freeform' && (
            <label className="block">
              <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">
                달성치 {hw.metric === 'distance' && '(km)'}
              </span>
              <input type="number" step="0.01" value={achieved} onChange={e => setAchieved(e.target.value)}
                placeholder={hw.metric === 'distance' ? '예: 22.5' : '예: 5'}
                className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
            </label>
          )}
          <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={2} placeholder="한 줄 회고 (선택)"
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none resize-none" />
          <input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="인증샷 URL (선택)"
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
          <div className="flex gap-2">
            {hw.metric === 'distance' && (
              <button onClick={() => submit(true)} disabled={busy}
                className="flex-1 py-2 text-[12.5px] font-medium text-[var(--color-primary)] border border-[var(--color-primary)] rounded hover:bg-[var(--color-primary-bg)] disabled:opacity-50">
                활동기록 자동 합산
              </button>
            )}
            <button onClick={() => submit(false)} disabled={busy}
              className="flex-1 py-2 text-[12.5px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded disabled:opacity-50 inline-flex items-center justify-center gap-1">
              {busy ? <Loader2 size={13} className="animate-spin" /> : null} {hw.mySubmission ? '다시 제출' : '제출하기'}
            </button>
          </div>
          {hw.mySubmission?.note && hw.mySubmission.status === 'rejected' && (
            <p className="text-[12px] text-rose-600">코치 코멘트: {hw.mySubmission.note}</p>
          )}
        </div>
      )}

      {/* 코치: 제출 목록 검증 */}
      {canManage && (
        <div className="bg-white border border-[var(--color-border)] rounded-md p-4">
          <h4 className="text-[13px] font-semibold text-[var(--color-text)] mb-2">제출 현황 ({submissions.length})</h4>
          {submissions.length === 0 ? (
            <p className="text-[12.5px] text-[var(--color-text-muted)]">아직 제출이 없어요.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {submissions.map(s => (
                <li key={s.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] text-[var(--color-text)]">
                        {s.memberName}
                        {s.achievedValue != null && (
                          <span className="ml-2 text-[12px] text-[var(--color-text-muted)]">
                            {hw.metric === 'distance' ? formatDistance(s.achievedValue) : s.achievedValue}
                          </span>
                        )}
                      </p>
                      {s.note && <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">{s.note}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.status !== 'verified' ? (
                        <>
                          <button onClick={() => verify(s.id, 'verified')}
                            className="px-2 py-1 text-[11.5px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded">인증</button>
                          <button onClick={() => verify(s.id, 'rejected')}
                            className="px-2 py-1 text-[11.5px] text-rose-700 border border-rose-200 hover:bg-rose-50 rounded">반려</button>
                        </>
                      ) : <SubStatusBadge status={s.status} />}
                    </div>
                  </div>
                  {s.photoUrl && <img src={s.photoUrl} alt="인증샷" className="mt-2 rounded max-h-40 object-cover" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function HomeworkForm({ classId, onClose, onSaved }: { classId: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState('distance');
  const [targetValue, setTargetValue] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) { alert('제목을 입력해주세요'); return; }
    setBusy(true);
    try {
      // distance면 km 입력 → m 변환
      let tv: number | undefined;
      if (targetValue) {
        tv = metric === 'distance' ? Math.round(parseFloat(targetValue) * 1000) : parseFloat(targetValue);
      }
      await api.homeworks.create({
        classId, title: title.trim(),
        description: description.trim() || undefined,
        metric, targetValue: tv,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
      });
      onSaved();
    } catch (e: any) { alert(e?.message ?? '생성 실패'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-md p-5 space-y-3.5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[var(--color-text)]">과제 만들기</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={18} /></button>
        </div>
        <label className="block">
          <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">제목</span>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="예: 이번 주 누적 20km 달리기"
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
        </label>
        <label className="block">
          <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">설명 (선택)</span>
          <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={2}
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none resize-none" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">측정 방식</span>
            <select value={metric} onChange={e => setMetric(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none">
              {METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {metric !== 'freeform' && metric !== 'checkin' && (
            <label className="block">
              <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">
                목표값 {metric === 'distance' && '(km)'}
              </span>
              <input type="number" step="0.01" value={targetValue} onChange={e => setTargetValue(e.target.value)} placeholder={metric === 'distance' ? '20' : '5'}
                className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
            </label>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">시작일 (선택)</span>
            <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">마감일 (선택)</span>
            <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
          </label>
        </div>
        <button onClick={submit} disabled={busy || !title.trim()}
          className="w-full py-2.5 text-[13.5px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} 만들기
        </button>
      </div>
    </div>
  );
}
