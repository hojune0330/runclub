'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Target, Plus, Users, Trophy, Flag, Loader2, ChevronLeft, ChevronRight,
  Inbox, CheckCircle2, XCircle, Clock, Trash2, X, ClipboardCheck, Settings,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import ClassHomeworks from '@/components/member/ClassHomeworks';
import ClassLeaderboard from '@/components/member/ClassLeaderboard';
import type { CoachingClass, ClassTeam, ClassEnrollment, TeamRequest } from '@/types';

type AdminDetailTab = 'manage' | 'homework' | 'leaderboard';

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'marathon', label: '마라톤' },
  { value: 'hyrox', label: '하이록스' },
  { value: 'glucose', label: '혈당관리' },
  { value: 'health', label: '건강관리' },
  { value: 'pt', label: '1:1 PT' },
  { value: 'custom', label: '기타' },
];
const METRIC_OPTIONS: { value: string; label: string }[] = [
  { value: 'distance', label: '누적 거리' },
  { value: 'mileage', label: '마일리지' },
  { value: 'attendance', label: '출석' },
  { value: 'homework', label: '과제 달성률' },
  { value: 'glucose_in_range', label: '혈당 목표 범위' },
];
const KIND_LABEL = Object.fromEntries(KIND_OPTIONS.map(o => [o.value, o.label]));
const METRIC_LABEL = Object.fromEntries(METRIC_OPTIONS.map(o => [o.value, o.label]));

export default function ClassManagement() {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [classes, setClasses] = useState<CoachingClass[]>([]);
  const [pendingReqs, setPendingReqs] = useState<TeamRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cl, reqs] = await Promise.all([
        api.classes.list('all').catch(() => ({ classes: [] })),
        api.teamRequests.list({ scope: 'manage', status: 'pending' }).catch(() => ({ requests: [] })),
      ]);
      setClasses(cl.classes);
      setPendingReqs(reqs.requests);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (view === 'detail' && selectedId) {
    return <ClassDetailAdmin classId={selectedId} onBack={() => { setView('list'); setSelectedId(null); void load(); }} />;
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-bold text-[var(--color-text)] flex items-center gap-2">
            <Target size={18} className="text-[var(--color-primary)]" /> 코칭 클래스
          </h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
            목표 지향 수업(마라톤·하이록스·건강관리 등)을 만들고, 팀을 구성하고, 팀 요청을 검토해요.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded shrink-0">
          <Plus size={15} /> 클래스 만들기
        </button>
      </header>

      {/* 검토 대기 팀 요청 */}
      <PendingRequests requests={pendingReqs} onResolved={() => void load()} />

      {showCreate && <CreateClassModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {classes.map(c => (
            <button key={c.id} onClick={() => { setSelectedId(c.id); setView('detail'); }}
              className="text-left bg-white border border-[var(--color-border)] rounded-md p-4 hover:border-[var(--color-primary)]/50 hover:shadow-sm transition-all group">
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-primary-bg)] text-[var(--color-primary)]">{KIND_LABEL[c.kind] ?? '클래스'}</span>
                  {c.status !== 'active' && <span className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]">{c.status === 'finished' ? '종료' : '보관'}</span>}
                </span>
                <ChevronRight size={16} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]" />
              </div>
              <h3 className="text-[14.5px] font-semibold text-[var(--color-text)] mt-2">{c.name}</h3>
              <div className="flex items-center gap-3 mt-2.5 text-[11.5px] text-[var(--color-text-muted)]">
                <span className="inline-flex items-center gap-1"><Users size={12} /> {c.memberCount ?? 0}명</span>
                <span className="inline-flex items-center gap-1"><Flag size={12} /> {c.teamCount ?? 0}팀</span>
                <span className="inline-flex items-center gap-1"><Trophy size={12} /> {METRIC_LABEL[c.metricFocus] ?? '거리'}</span>
              </div>
            </button>
          ))}
          {classes.length === 0 && (
            <div className="col-span-full text-center py-14">
              <div className="w-12 h-12 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
                <Target size={20} className="text-[var(--color-text-muted)]" />
              </div>
              <p className="text-[13.5px] text-[var(--color-text)] font-medium mb-1">아직 클래스가 없어요</p>
              <p className="text-[12.5px] text-[var(--color-text-muted)]">‘클래스 만들기’로 첫 코칭 클래스를 열어보세요.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PendingRequests({ requests, onResolved }: { requests: TeamRequest[]; onResolved: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const resolve = async (id: string, action: 'approve' | 'reject') => {
    let note: string | undefined;
    if (action === 'reject') {
      note = prompt('반려 사유 (선택)') ?? undefined;
    }
    setBusyId(id);
    try {
      await api.teamRequests.resolve(id, action, note);
      onResolved();
    } catch (e: any) {
      alert(e?.message ?? '처리에 실패했어요');
    } finally {
      setBusyId(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <section className="bg-amber-50 border border-amber-200 rounded-md p-4">
      <h2 className="text-[13.5px] font-semibold text-amber-800 flex items-center gap-1.5 mb-3">
        <Inbox size={15} /> 검토 대기 팀 요청 ({requests.length})
      </h2>
      <ul className="space-y-2">
        {requests.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-3 bg-white border border-amber-100 rounded px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] text-[var(--color-text)]">
                <strong>{r.memberName}</strong> · {r.className}
              </p>
              <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                {r.kind === 'create' ? `새 팀 만들기 "${r.desiredName}"` : r.kind === 'join' ? `팀 참여 "${r.desiredTeamName}"` : `팀 이동 "${r.desiredTeamName}"`}
                {r.reason && <span> — {r.reason}</span>}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => resolve(r.id, 'approve')} disabled={busyId === r.id}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded disabled:opacity-50">
                {busyId === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} 승인
              </button>
              <button onClick={() => resolve(r.id, 'reject')} disabled={busyId === r.id}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-rose-700 border border-rose-200 hover:bg-rose-50 rounded disabled:opacity-50">
                <XCircle size={12} /> 반려
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CreateClassModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('marathon');
  const [metricFocus, setMetricFocus] = useState('distance');
  const [goalSummary, setGoalSummary] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { alert('클래스 이름을 입력해주세요'); return; }
    setBusy(true);
    try {
      await api.classes.create({
        name: name.trim(), kind, metricFocus,
        goalSummary: goalSummary.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      onCreated();
    } catch (e: any) {
      alert(e?.message ?? '생성에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[var(--color-text)]">클래스 만들기</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={18} /></button>
        </div>
        <Field label="클래스 이름">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={80}
            placeholder="예: 2026 봄 풀코스 도전반"
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="유형">
            <select value={kind} onChange={e => setKind(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none">
              {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="리더보드 기준">
            <select value={metricFocus} onChange={e => setMetricFocus(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none">
              {METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="목표 설명 (선택)">
          <textarea value={goalSummary} onChange={e => setGoalSummary(e.target.value)} maxLength={300} rows={2}
            placeholder="예: 12주간 풀코스 완주를 목표로 주간 마일리지를 함께 쌓아요."
            className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none resize-none" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="시작일 (선택)">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
          </Field>
          <Field label="종료일 (선택)">
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
          </Field>
        </div>
        <button onClick={submit} disabled={busy || !name.trim()}
          className="w-full py-2.5 text-[13.5px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} 만들기
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

function ClassDetailAdmin({ classId, onBack }: { classId: string; onBack: () => void }) {
  const [cls, setCls] = useState<CoachingClass | null>(null);
  const [teams, setTeams] = useState<ClassTeam[]>([]);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#3b82f6');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<AdminDetailTab>('manage');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.classes.get(classId);
      setCls(res.class);
      setTeams(res.class.teams ?? []);
      setEnrollments(res.enrollments);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    setBusy(true);
    try {
      await api.classes.createTeam(classId, { name: newTeamName.trim(), color: newTeamColor });
      setNewTeamName('');
      await load();
    } catch (e: any) { alert(e?.message ?? '팀 생성 실패'); }
    finally { setBusy(false); }
  };

  const assignTeam = async (memberId: string, teamId: string) => {
    try {
      await api.classes.enroll(classId, { memberId, teamId: teamId || undefined });
      await load();
    } catch (e: any) { alert(e?.message ?? '팀 배정 실패'); }
  };

  const archive = async () => {
    if (!confirm('이 클래스를 보관 처리할까요? (목록에서 숨겨집니다)')) return;
    try { await api.classes.update(classId, { status: 'archived' }); await load(); }
    catch (e: any) { alert(e?.message ?? '실패'); }
  };

  const remove = async () => {
    if (!confirm('정말 삭제하시겠어요? 팀·등록·요청이 모두 삭제됩니다. (되돌릴 수 없음)')) return;
    try { await api.classes.remove(classId); onBack(); }
    catch (e: any) { alert(e?.message ?? '삭제 실패'); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={22} className="animate-spin text-[var(--color-text-muted)]" /></div>;
  if (!cls) return <div className="text-center py-16"><p className="text-[13.5px]">클래스를 찾을 수 없어요.</p><button onClick={onBack} className="mt-3 text-[13px] text-[var(--color-primary)]">← 목록</button></div>;

  return (
    <div className="space-y-5 max-w-4xl">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
        <ChevronLeft size={15} /> 코칭 클래스
      </button>

      <header className="bg-white border border-[var(--color-border)] rounded-md p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-primary-bg)] text-[var(--color-primary)]">{KIND_LABEL[cls.kind] ?? '클래스'}</span>
            <h1 className="text-[19px] font-bold text-[var(--color-text)] mt-2">{cls.name}</h1>
            {cls.goalSummary && <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">{cls.goalSummary}</p>}
            <div className="flex flex-wrap items-center gap-3 mt-3 text-[12px] text-[var(--color-text-muted)]">
              <span className="inline-flex items-center gap-1"><Users size={13} /> {cls.memberCount ?? 0}명</span>
              <span className="inline-flex items-center gap-1"><Flag size={13} /> {teams.length}팀</span>
              <span className="inline-flex items-center gap-1"><Trophy size={13} /> {METRIC_LABEL[cls.metricFocus] ?? '거리'}</span>
              {cls.coachName && <span>코치 {cls.coachName}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <button onClick={archive} className="px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)]">보관</button>
            <button onClick={remove} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] text-rose-700 border border-rose-200 rounded hover:bg-rose-50"><Trash2 size={12} /> 삭제</button>
          </div>
        </div>
      </header>

      {/* 탭 바 */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)]">
        {([
          { id: 'manage' as const, label: '운영', icon: Settings },
          { id: 'homework' as const, label: '과제', icon: ClipboardCheck },
          { id: 'leaderboard' as const, label: '리더보드', icon: Trophy },
        ]).map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              )}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'manage' && (<>
      {/* 팀 관리 */}
      <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)] flex items-center gap-1.5 mb-3">
          <Flag size={15} className="text-[var(--color-primary)]" /> 팀 구성
        </h2>
        <div className="flex items-center gap-2 mb-3">
          <input type="color" value={newTeamColor} onChange={e => setNewTeamColor(e.target.value)}
            className="w-9 h-9 rounded border border-[var(--color-border)] cursor-pointer p-0.5" />
          <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} maxLength={40}
            placeholder="새 팀 이름 (예: 초급팀 / 풀코스팀)"
            onKeyDown={e => { if (e.key === 'Enter') void createTeam(); }}
            className="flex-1 px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
          <button onClick={createTeam} disabled={busy || !newTeamName.trim()}
            className="inline-flex items-center gap-1 px-3 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded disabled:opacity-50 shrink-0">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} 추가
          </button>
        </div>
        {teams.length === 0 ? (
          <p className="text-[12.5px] text-[var(--color-text-muted)]">아직 팀이 없어요. 위에서 추가하거나, 회원의 팀 요청을 승인하면 자동 생성돼요.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {teams.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-2 border border-[var(--color-border-subtle)] rounded px-3 py-2">
                <span className="inline-flex items-center gap-2 text-[13px] text-[var(--color-text)]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color || 'var(--color-primary)' }} />{t.name}
                </span>
                <span className="text-[11.5px] text-[var(--color-text-muted)]">{t.memberCount ?? 0}명</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 멤버 명단 + 팀 배정 */}
      <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)] mb-3">참여 멤버 ({enrollments.length})</h2>
        {enrollments.length === 0 ? (
          <p className="text-[12.5px] text-[var(--color-text-muted)]">아직 참여한 회원이 없어요.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {enrollments.map(e => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[13px] text-[var(--color-text)]">
                  {e.memberName ?? '회원'}
                  {e.role === 'coach' && <span className="ml-1.5 text-[11px] text-[var(--color-primary)]">코치</span>}
                </span>
                <select value={e.teamId ?? ''} onChange={ev => assignTeam(e.memberId, ev.target.value)}
                  className="px-2.5 py-1.5 text-[12px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none">
                  <option value="">팀 미배정</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>
      </>)}

      {tab === 'homework' && <ClassHomeworks classId={classId} />}
      {tab === 'leaderboard' && <ClassLeaderboard classId={classId} defaultMetric={cls.metricFocus} />}
    </div>
  );
}
