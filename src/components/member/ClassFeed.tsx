'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, Trash2, Activity, Heart, Flame, MessageCircle, X, Clock, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/AuthContext';
import { cn } from '@/lib/utils';
import { ACTIVITY_KIND_LABEL, ACTIVITY_SOURCE_META, formatDistance, formatPace, formatDuration } from '@/lib/coaching';
import type { ActivityLog, Encouragement } from '@/types';

const RUN_KINDS = [
  { value: 'run', label: '러닝' },
  { value: 'long_run', label: '롱런(10km+)' },
  { value: 'interval', label: '인터벌' },
  { value: 'walk_run', label: '걷기/달리기' },
];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// classId 미지정 시: 내 개인 활동 피드(클래스 무관). 누구나 사용 가능.
export default function ClassFeed({ classId }: { classId?: string }) {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const personal = !classId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.activities.list(classId ? { classId, limit: 50 } : { limit: 50 });
      setActivities(res.activities);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--color-text)] flex items-center gap-1.5">
          <Activity size={14} className="text-[var(--color-primary)]" /> {personal ? '내 활동 기록' : '활동 피드'}
        </h3>
        <button onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-[12.5px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded">
          <Plus size={13} /> 기록 추가
        </button>
      </div>

      {showForm && <ActivityForm classId={classId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load(); }} />}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" /></div>
      ) : activities.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
            <Activity size={20} className="text-[var(--color-text-muted)]" />
          </div>
          <p className="text-[13px] text-[var(--color-text)] font-medium mb-1">아직 기록이 없어요</p>
          <p className="text-[12px] text-[var(--color-text-muted)]">‘기록 추가’로 첫 러닝을 {personal ? '남기고' : '공유하고'} 마일리지를 모아보세요!</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {activities.map(a => (
            <ActivityCard key={a.id} activity={a} myId={user?.id} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityCard({ activity, myId, onChanged }: { activity: ActivityLog; myId?: string; onChanged: () => void }) {
  const [cheers, setCheers] = useState(activity.cheerCount ?? 0);
  const [cheered, setCheered] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Encouragement[]>([]);
  const [commentText, setCommentText] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const isMine = activity.memberId === myId;
  const sourceMeta = ACTIVITY_SOURCE_META[activity.source] ?? ACTIVITY_SOURCE_META.manual;

  const toggleCheer = async (kind: 'cheer' | 'fire') => {
    try {
      const res = await api.encouragements.add({ targetType: 'activity', targetId: activity.id, kind });
      if (res.toggled === 'on') { setCheers(c => c + 1); setCheered(true); }
      else { setCheers(c => Math.max(0, c - 1)); setCheered(false); }
    } catch (e: unknown) { alert(errorMessage(e, '실패')); }
  };

  const loadComments = async () => {
    setShowComments(v => !v);
    if (!showComments) {
      const res = await api.encouragements.list('activity', activity.id);
      setComments(res.encouragements.filter(e => e.kind === 'comment'));
    }
  };

  const addComment = async () => {
    if (!commentText.trim()) return;
    setBusy(true);
    try {
      const res = await api.encouragements.add({ targetType: 'activity', targetId: activity.id, kind: 'comment', comment: commentText.trim() });
      if (res.encouragement) setComments(c => [...c, res.encouragement!]);
      setCommentText('');
    } catch (e: unknown) { alert(errorMessage(e, '실패')); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    try { await api.activities.remove(activity.id); onChanged(); }
    catch (e: unknown) { alert(errorMessage(e, '실패')); }
  };

  const isRun = ['run', 'long_run', 'interval', 'walk_run'].includes(activity.kind);

  return (
    <li className="bg-white border border-[var(--color-border)] rounded-md p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--color-text)]">
            {activity.memberName}
            <span className="ml-2 text-[11px] font-normal text-[var(--color-text-muted)]">{activity.activityDate}</span>
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]">
              {ACTIVITY_KIND_LABEL[activity.kind] ?? '활동'}
            </span>
            {/* 출처 배지 — 종합 수치엔 동일 집계되지만 어디서 온 기록인지 구분 */}
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
              style={{ color: sourceMeta.color, background: `${sourceMeta.color}14` }}
              title={`출처: ${sourceMeta.label}`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sourceMeta.color }} />
              {sourceMeta.label}
            </span>
            {activity.editedAt && (
              <span className="text-[10.5px] text-[var(--color-text-muted)]" title={`수정: ${new Date(activity.editedAt).toLocaleString('ko-KR')}`}>· 수정됨</span>
            )}
          </div>
        </div>
        {isMine && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setEditing(true)} className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]" title="수정"><Pencil size={14} /></button>
            <button onClick={remove} className="text-[var(--color-text-muted)] hover:text-rose-500" title="삭제"><Trash2 size={14} /></button>
          </div>
        )}
      </div>

      {editing && (
        <ActivityForm
          classId={activity.classId}
          existing={activity}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onChanged(); }}
        />
      )}

      {isRun && (activity.distanceM || activity.durationS) && (
        <div className="flex items-center gap-4 mt-3 text-[12.5px]">
          {activity.distanceM ? <Metric label="거리" value={formatDistance(activity.distanceM)} /> : null}
          {activity.durationS ? <Metric label="시간" value={formatDuration(activity.durationS)} /> : null}
          {activity.avgPaceS ? <Metric label="페이스" value={formatPace(activity.avgPaceS)} /> : null}
          {activity.avgHr ? <Metric label="심박" value={`${activity.avgHr}bpm`} /> : null}
        </div>
      )}

      {activity.note && <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-2">{activity.note}</p>}
      {activity.photoUrl && (
        <img src={activity.photoUrl} alt="인증샷" loading="lazy" referrerPolicy="no-referrer" className="mt-2 rounded-md max-h-60 w-full object-cover" />
      )}

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--color-border-subtle)]">
        <button onClick={() => toggleCheer('cheer')}
          className={cn('inline-flex items-center gap-1 text-[12px]', cheered ? 'text-rose-500' : 'text-[var(--color-text-muted)] hover:text-rose-500')}>
          <Heart size={14} className={cheered ? 'fill-rose-500' : ''} /> {cheers > 0 ? cheers : '응원'}
        </button>
        <button onClick={() => toggleCheer('fire')} className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-orange-500">
          <Flame size={14} /> 파이팅
        </button>
        <button onClick={loadComments} className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          <MessageCircle size={14} /> {activity.commentCount ? activity.commentCount : '댓글'}
        </button>
      </div>

      {showComments && (
        <div className="mt-3 space-y-2">
          {comments.map(c => (
            <div key={c.id} className="text-[12px] bg-[var(--color-bg-subtle)] rounded px-2.5 py-1.5">
              <strong className="text-[var(--color-text)]">{c.memberName}</strong>
              <span className="text-[var(--color-text-secondary)] ml-1.5">{c.comment}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <input value={commentText} onChange={e => setCommentText(e.target.value)} maxLength={300}
              placeholder="응원 댓글 남기기" onKeyDown={e => { if (e.key === 'Enter') void addComment(); }}
              className="flex-1 px-2.5 py-1.5 text-[12.5px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
            <button onClick={addComment} disabled={busy || !commentText.trim()}
              className="px-2.5 py-1.5 text-[12px] font-medium text-white bg-[var(--color-primary)] rounded disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : '등록'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[10.5px] text-[var(--color-text-muted)]">{label}</span>
      <strong className="text-[13px] text-[var(--color-text)] tabular-nums">{value}</strong>
    </div>
  );
}

// existing 가 있으면 "수정" 모드(어떤 출처의 기록이든 수정 가능), 없으면 "추가" 모드.
function ActivityForm({ classId, existing, onClose, onSaved }: { classId?: string; existing?: ActivityLog; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!existing;
  const [kind, setKind] = useState<string>(existing?.kind ?? 'run');
  const [activityDate, setActivityDate] = useState(existing?.activityDate ?? new Date().toISOString().slice(0, 10));
  const [distanceKm, setDistanceKm] = useState(existing?.distanceM != null ? String(existing.distanceM / 1000) : '');
  const [durationMin, setDurationMin] = useState(existing?.durationS != null ? String(Math.round(existing.durationS / 60 * 10) / 10) : '');
  const [avgHr, setAvgHr] = useState(existing?.avgHr != null ? String(existing.avgHr) : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [photoUrl, setPhotoUrl] = useState(existing?.photoUrl ?? '');
  const [busy, setBusy] = useState(false);
  // 수정 모드에서 비RUN 종류(혈당 등)는 종류칩을 바꾸지 않고 보존
  const isRunKindForm = ['run', 'long_run', 'interval', 'walk_run'].includes(kind);
  const sourceMeta = existing ? (ACTIVITY_SOURCE_META[existing.source] ?? ACTIVITY_SOURCE_META.manual) : null;

  const submit = async () => {
    setBusy(true);
    try {
      const distanceM = distanceKm !== '' ? Math.round(parseFloat(distanceKm) * 1000) : (isEdit ? null : undefined);
      const durationS = durationMin !== '' ? Math.round(parseFloat(durationMin) * 60) : (isEdit ? null : undefined);
      if (isEdit) {
        await api.activities.update(existing!.id, {
          kind, activityDate, distanceM, durationS,
          avgHr: avgHr !== '' ? parseInt(avgHr) : null,
          note: note.trim() || null,
          photoUrl: photoUrl.trim() || null,
        });
      } else {
        const res = await api.activities.create({
          classId: classId || undefined, kind, activityDate,
          distanceM: distanceM ?? undefined, durationS: durationS ?? undefined,
          avgHr: avgHr ? parseInt(avgHr) : undefined,
          note: note.trim() || undefined,
          photoUrl: photoUrl.trim() || undefined,
        });
        if (res.mileageEarned > 0) alert(`기록 완료! +${res.mileageEarned}P 적립되었어요 🎉`);
      }
      onSaved();
    } catch (e: unknown) {
      alert(errorMessage(e, '저장에 실패했어요'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-md p-5 space-y-3.5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[var(--color-text)] flex items-center gap-1.5">
            {isEdit ? <Pencil size={16} className="text-[var(--color-primary)]" /> : <Activity size={16} className="text-[var(--color-primary)]" />}
            {isEdit ? '기록 수정' : '활동 기록'}
          </h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={18} /></button>
        </div>

        {/* 수정 모드: 출처 안내(외부 연동 기록도 자유롭게 고칠 수 있음) */}
        {isEdit && sourceMeta && (
          <p className="text-[11.5px] text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] rounded px-2.5 py-1.5">
            <span className="inline-flex items-center gap-1 font-medium" style={{ color: sourceMeta.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sourceMeta.color }} />{sourceMeta.label}
            </span>
            <span className="ml-1">에서 가져온 기록이에요. 값을 고치면 ‘수정됨’으로 표시되고, 종합 수치에도 동일하게 반영돼요.</span>
          </p>
        )}

        {isRunKindForm && (
          <div className="flex gap-1.5 flex-wrap">
            {RUN_KINDS.map(k => (
              <button key={k.value} onClick={() => setKind(k.value)}
                className={cn('px-2.5 py-1.5 rounded text-[12px] font-medium border',
                  kind === k.value ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-white text-[var(--color-text-secondary)] border-[var(--color-border)]')}>
                {k.label}
              </button>
            ))}
          </div>
        )}

        <Field label="날짜">
          <input type="date" value={activityDate} onChange={e => setActivityDate(e.target.value)}
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="거리 (km)">
            <input type="number" step="0.01" inputMode="decimal" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} placeholder="5.0"
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
          </Field>
          <Field label="시간 (분)">
            <input type="number" step="0.1" inputMode="decimal" value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="30"
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
          </Field>
        </div>
        <Field label="평균 심박 (bpm, 선택)">
          <input type="number" inputMode="numeric" value={avgHr} onChange={e => setAvgHr(e.target.value)} placeholder="150"
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
        </Field>
        <Field label="메모 (선택)">
          <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={2} placeholder="오늘 컨디션, 코스, 느낀 점..."
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none resize-none" />
        </Field>
        <Field label="인증샷 URL (선택 · 임시)">
          <input type="url" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://... (외부에 이미 올린 이미지)"
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
          <span className="block mt-1 text-[10.5px] leading-relaxed text-[var(--color-text-muted)]">
            직접 사진 업로드는 R2/S3 같은 Object Storage 연결 후 열 예정이에요. DB에는 사진 파일이 아니라 저장소 key/URL/용량 같은 메타데이터만 남기는 구조로 준비해둘게요.
          </span>
        </Field>

        {!isEdit && (
          <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
            <Clock size={11} /> 활동 +10P(하루 2건), 10km+ 롱런 +20P 적립돼요.
          </p>
        )}
        {isEdit && (
          <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
            <Clock size={11} /> 수정해도 이미 적립된 마일리지는 그대로 유지돼요.
          </p>
        )}

        <button onClick={submit} disabled={busy}
          className="w-full py-2.5 text-[13.5px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
          {busy ? <Loader2 size={15} className="animate-spin" /> : isEdit ? <Pencil size={15} /> : <Plus size={15} />} {isEdit ? '수정 저장' : '기록 저장'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">{label}</span>
      {children}
    </label>
  );
}
