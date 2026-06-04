'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Target, Users, Trophy, ChevronRight, ChevronLeft, Plus, Loader2,
  Flag, UserPlus, Clock, CheckCircle2, XCircle, Compass, Activity, ClipboardCheck,
  HeartPulse,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/AuthContext';
import { cn } from '@/lib/utils';
import ClassFeed from './ClassFeed';
import ClassHomeworks from './ClassHomeworks';
import ClassLeaderboard from './ClassLeaderboard';
import HealthLog from './HealthLog';
import { MileageGuide, IntegrationGuide, GlucoseGuardrailCard, MileagePolicyBadge } from '@/components/coaching/PolicyInfo';
import IntegrationsPanel from '@/components/coaching/IntegrationsPanel';
import { CLASS_KIND_INTRO } from '@/lib/policy';
import type { CoachingClass, ClassTeam, ClassEnrollment, TeamRequest } from '@/types';

type DetailTab = 'overview' | 'feed' | 'homework' | 'health' | 'leaderboard';

const isHealthKind = (k?: string) => k === 'glucose' || k === 'health';

const KIND_LABEL: Record<string, string> = {
  marathon: '마라톤', hyrox: '하이록스', glucose: '혈당관리',
  health: '건강관리', pt: '1:1 PT', custom: '클래스',
};
const METRIC_LABEL: Record<string, string> = {
  distance: '누적 거리', mileage: '마일리지', attendance: '출석',
  homework: '과제 달성률', glucose_in_range: '혈당 목표 범위',
};

function StatusBadge({ status }: { status: TeamRequest['status'] }) {
  const map = {
    pending: { label: '검토 중', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
    approved: { label: '승인됨', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
    rejected: { label: '반려됨', cls: 'bg-rose-50 text-rose-700 border-rose-200', Icon: XCircle },
  }[status];
  const Icon = map.Icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border', map.cls)}>
      <Icon size={11} /> {map.label}
    </span>
  );
}

export default function MyClasses() {
  const { user } = useAuth();
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [tab, setTab] = useState<'mine' | 'explore'>('mine');
  const [myClasses, setMyClasses] = useState<CoachingClass[]>([]);
  const [allClasses, setAllClasses] = useState<CoachingClass[]>([]);
  const [myRequests, setMyRequests] = useState<TeamRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, all, reqs] = await Promise.all([
        api.classes.list('mine').catch(() => ({ classes: [] })),
        api.classes.list('all').catch(() => ({ classes: [] })),
        api.teamRequests.list({ scope: 'mine' }).catch(() => ({ requests: [] })),
      ]);
      setMyClasses(mine.classes);
      setAllClasses(all.classes);
      setMyRequests(reqs.requests);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  if (view === 'detail' && selectedId) {
    return (
      <ClassDetail
        classId={selectedId}
        onBack={() => { setView('list'); setSelectedId(null); void loadList(); }}
      />
    );
  }

  const enrolledIds = new Set(myClasses.map(c => c.id));
  const exploreList = allClasses.filter(c => !enrolledIds.has(c.id));

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <h1 className="text-[18px] font-bold text-[var(--color-text)] flex items-center gap-2">
          <Target size={18} className="text-[var(--color-primary)]" /> 내 클래스
        </h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          목표 지향 수업(마라톤·하이록스·건강관리 등)에 참여하고, 팀을 이뤄 기록을 공유해요.
        </p>
      </header>

      {/* 내가 낸 팀 요청 현황 */}
      {myRequests.length > 0 && (
        <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
          <h2 className="text-[13px] font-semibold text-[var(--color-text)] mb-2">내 팀 요청</h2>
          <ul className="space-y-2">
            {myRequests.slice(0, 5).map(r => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="text-[var(--color-text-secondary)] truncate">
                  {r.className} · {r.kind === 'create' ? `팀 만들기 "${r.desiredName}"` : r.kind === 'join' ? `팀 참여 "${r.desiredTeamName}"` : `팀 이동 "${r.desiredTeamName}"`}
                </span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-1 border-b border-[var(--color-border)]">
        {([['mine', '참여 중', myClasses.length], ['explore', '둘러보기', exploreList.length]] as const).map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'px-3 py-2 text-[13px] border-b-2 -mb-px transition-colors',
              tab === id ? 'border-[var(--color-primary)] text-[var(--color-text)] font-medium' : 'border-transparent text-[var(--color-text-muted)]'
            )}
          >
            {label}
            <span className={cn('ml-1.5 px-1.5 py-0.5 rounded-full text-[11px]', tab === id ? 'bg-[var(--color-primary-bg)] text-[var(--color-primary)]' : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]')}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--color-text-muted)]">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(tab === 'mine' ? myClasses : exploreList).map(c => (
            <ClassCard
              key={c.id}
              cls={c}
              enrolled={enrolledIds.has(c.id)}
              onClick={() => { setSelectedId(c.id); setView('detail'); }}
            />
          ))}
          {(tab === 'mine' ? myClasses : exploreList).length === 0 && (
            <div className="col-span-full text-center py-14">
              <div className="w-12 h-12 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
                {tab === 'mine' ? <Target size={20} className="text-[var(--color-text-muted)]" /> : <Compass size={20} className="text-[var(--color-text-muted)]" />}
              </div>
              <p className="text-[13.5px] text-[var(--color-text)] font-medium mb-1">
                {tab === 'mine' ? '참여 중인 클래스가 없어요' : '둘러볼 클래스가 없어요'}
              </p>
              <p className="text-[12.5px] text-[var(--color-text-muted)]">
                {tab === 'mine' ? '‘둘러보기’ 탭에서 진행 중인 클래스를 찾아보세요.' : '새로운 클래스가 열리면 여기에 표시돼요.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClassCard({ cls, enrolled, onClick }: { cls: CoachingClass; enrolled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white border border-[var(--color-border)] rounded-md p-4 hover:border-[var(--color-primary)]/50 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
          {KIND_LABEL[cls.kind] ?? '클래스'}
        </span>
        <ChevronRight size={16} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors" />
      </div>
      <h3 className="text-[14.5px] font-semibold text-[var(--color-text)] mt-2">{cls.name}</h3>
      {cls.goalSummary && (
        <p className="text-[12.5px] text-[var(--color-text-muted)] mt-1 line-clamp-2">{cls.goalSummary}</p>
      )}
      <div className="flex items-center gap-3 mt-3 text-[11.5px] text-[var(--color-text-muted)]">
        <span className="inline-flex items-center gap-1"><Users size={12} /> {cls.memberCount ?? 0}명</span>
        <span className="inline-flex items-center gap-1"><Trophy size={12} /> {METRIC_LABEL[cls.metricFocus] ?? '거리'}</span>
        {cls.coachName && <span className="truncate">코치 {cls.coachName}</span>}
      </div>
      {enrolled && cls.myEnrollment?.teamName && (
        <div className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-[var(--color-text-secondary)]">
          <Flag size={12} className="text-[var(--color-primary)]" /> {cls.myEnrollment.teamName}
        </div>
      )}
    </button>
  );
}

// ─── 상세 화면 ───
function ClassDetail({ classId, onBack }: { classId: string; onBack: () => void }) {
  const [cls, setCls] = useState<CoachingClass | null>(null);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);
  const [myEnrollment, setMyEnrollment] = useState<ClassEnrollment | null>(null);
  const [teams, setTeams] = useState<ClassTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showReqForm, setShowReqForm] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.classes.get(classId);
      setCls(res.class);
      setEnrollments(res.enrollments);
      setMyEnrollment(res.class.myEnrollment ?? null);
      setTeams(res.class.teams ?? []);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  const join = async () => {
    setBusy(true);
    try { await api.classes.enroll(classId); await load(); }
    catch (e: any) { alert(e?.message ?? '참여에 실패했어요'); }
    finally { setBusy(false); }
  };

  const leave = async () => {
    if (!confirm('이 클래스에서 나가시겠어요? 기록은 보존됩니다.')) return;
    setBusy(true);
    try { await api.classes.unenroll(classId); await load(); }
    catch (e: any) { alert(e?.message ?? '나가기에 실패했어요'); }
    finally { setBusy(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={22} className="animate-spin text-[var(--color-text-muted)]" /></div>;
  }
  if (!cls) {
    return (
      <div className="text-center py-16">
        <p className="text-[13.5px] text-[var(--color-text)]">클래스를 찾을 수 없어요.</p>
        <button onClick={onBack} className="mt-3 text-[13px] text-[var(--color-primary)]">← 목록으로</button>
      </div>
    );
  }

  const enrolled = !!myEnrollment && myEnrollment.status === 'active';

  return (
    <div className="space-y-5 max-w-3xl">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
        <ChevronLeft size={15} /> 내 클래스
      </button>

      <header className="bg-white border border-[var(--color-border)] rounded-md p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
              {KIND_LABEL[cls.kind] ?? '클래스'}
            </span>
            <h1 className="text-[19px] font-bold text-[var(--color-text)] mt-2">{cls.name}</h1>
            {cls.goalSummary && <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">{cls.goalSummary}</p>}
            <div className="flex flex-wrap items-center gap-3 mt-3 text-[12px] text-[var(--color-text-muted)]">
              <span className="inline-flex items-center gap-1"><Users size={13} /> {cls.memberCount ?? 0}명 참여</span>
              <span className="inline-flex items-center gap-1"><Trophy size={13} /> {METRIC_LABEL[cls.metricFocus] ?? '거리'}</span>
              {cls.coachName && <span>코치 {cls.coachName}</span>}
            </div>
          </div>
          <div className="shrink-0">
            {enrolled ? (
              <button onClick={leave} disabled={busy}
                className="px-3 py-2 text-[12.5px] font-medium text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] disabled:opacity-50">
                나가기
              </button>
            ) : (
              <button onClick={join} disabled={busy || cls.status !== 'active'}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} 참여하기
              </button>
            )}
          </div>
        </div>
        {enrolled && myEnrollment?.teamName && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-bg-subtle)] text-[12px] text-[var(--color-text-secondary)]">
            <Flag size={13} className="text-[var(--color-primary)]" /> 내 팀: <strong>{myEnrollment.teamName}</strong>
          </div>
        )}
      </header>

      {/* 탭 바: 참여자만 활동/과제/리더보드 접근 */}
      {enrolled && (
        <div className="flex items-center gap-1 border-b border-[var(--color-border)] overflow-x-auto">
          {(([
            ['overview', '개요', Flag],
            ['feed', '활동', Activity],
            ...(isHealthKind(cls.kind) ? [['health', '건강', HeartPulse] as const] : []),
            ['homework', '과제', ClipboardCheck],
            ['leaderboard', '리더보드', Trophy],
          ] as const)).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setDetailTab(id)}
              className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 -mb-px whitespace-nowrap transition-colors',
                detailTab === id ? 'border-[var(--color-primary)] text-[var(--color-text)] font-medium' : 'border-transparent text-[var(--color-text-muted)]')}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      )}

      {(!enrolled || detailTab === 'overview') && (
        <>
          {/* 팀 목록 */}
          <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                <Flag size={15} className="text-[var(--color-primary)]" /> 팀 ({teams.length})
              </h2>
              {enrolled && (
                <button onClick={() => setShowReqForm(v => !v)}
                  className="inline-flex items-center gap-1 text-[12.5px] text-[var(--color-primary)] font-medium">
                  <Plus size={13} /> 팀 요청
                </button>
              )}
            </div>

            {showReqForm && (
              <TeamRequestForm classId={classId} teams={teams} onDone={() => { setShowReqForm(false); void load(); }} />
            )}

            {teams.length === 0 ? (
              <p className="text-[12.5px] text-[var(--color-text-muted)] py-2">
                아직 팀이 없어요. {enrolled ? '‘팀 요청’으로 새 팀을 제안하면 코치가 검토 후 만들어드려요.' : '코치가 팀을 구성하면 표시돼요.'}
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 mt-1">
                {teams.map(t => (
                  <li key={t.id} className="flex items-center justify-between gap-2 border border-[var(--color-border-subtle)] rounded px-3 py-2">
                    <span className="inline-flex items-center gap-2 text-[13px] text-[var(--color-text)]">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color || 'var(--color-primary)' }} />
                      {t.name}
                    </span>
                    <span className="text-[11.5px] text-[var(--color-text-muted)]">{t.memberCount ?? 0}명</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 멤버 명단 (코치/관리자만 서버에서 내려줌) */}
          {enrollments.length > 0 && (
            <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
              <h2 className="text-[14px] font-semibold text-[var(--color-text)] mb-2">참여 멤버</h2>
              <ul className="divide-y divide-[var(--color-border-subtle)]">
                {enrollments.map(e => (
                  <li key={e.id} className="flex items-center justify-between py-2 text-[13px]">
                    <span className="text-[var(--color-text)]">
                      {e.memberName ?? '회원'}
                      {e.role === 'coach' && <span className="ml-1.5 text-[11px] text-[var(--color-primary)]">코치</span>}
                    </span>
                    <span className="text-[11.5px] text-[var(--color-text-muted)]">{e.teamName ?? '미배정'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 클래스 소개: 이런 분께 좋아요 (구매/둘러보기 화면 안내) */}
          {CLASS_KIND_INTRO[cls.kind] && (
            <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
              <h2 className="text-[14px] font-semibold text-[var(--color-text)] mb-1.5">{CLASS_KIND_INTRO[cls.kind].tagline}</h2>
              <ul className="space-y-1 mb-2">
                {CLASS_KIND_INTRO[cls.kind].forWhom.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12.5px] text-[var(--color-text-secondary)]">
                    <CheckCircle2 size={13} className="mt-0.5 text-[var(--color-primary)] shrink-0" /> {w}
                  </li>
                ))}
              </ul>
              <MileagePolicyBadge />
            </section>
          )}

          {/* 정책 안내: 마일리지 적립 방법 (구매자/회원 누구나 명확히 이해) */}
          <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
            <MileageGuide />
          </section>

          {/* 정책 안내: 데이터 연동 (지금은 수동, 나중은 자동) */}
          {enrolled ? (
            <IntegrationsPanel filterCategory={isHealthKind(cls.kind) ? (cls.kind === 'glucose' ? 'glucose' : 'health') : 'run'} />
          ) : (
            <section className="bg-white border border-[var(--color-border)] rounded-md p-4">
              <IntegrationGuide filterCategory={isHealthKind(cls.kind) ? (cls.kind === 'glucose' ? 'glucose' : 'health') : 'run'} />
            </section>
          )}

          {/* 건강/혈당 클래스: 데이터 보호 가드레일 안내 */}
          {isHealthKind(cls.kind) && <GlucoseGuardrailCard />}
        </>
      )}

      {enrolled && detailTab === 'feed' && <ClassFeed classId={classId} />}
      {enrolled && detailTab === 'health' && isHealthKind(cls.kind) && <HealthLog classId={classId} />}
      {enrolled && detailTab === 'homework' && <ClassHomeworks classId={classId} />}
      {enrolled && detailTab === 'leaderboard' && <ClassLeaderboard classId={classId} defaultMetric={cls.metricFocus} />}
    </div>
  );
}

function TeamRequestForm({ classId, teams, onDone }: { classId: string; teams: ClassTeam[]; onDone: () => void }) {
  const [kind, setKind] = useState<'create' | 'join'>('create');
  const [desiredName, setDesiredName] = useState('');
  const [desiredTeamId, setDesiredTeamId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.teamRequests.create({
        classId,
        kind,
        desiredName: kind === 'create' ? desiredName.trim() : undefined,
        desiredTeamId: kind === 'join' ? desiredTeamId : undefined,
        reason: reason.trim() || undefined,
      });
      alert('팀 요청을 보냈어요. 코치 검토 후 알려드릴게요!');
      onDone();
    } catch (e: any) {
      alert(e?.message ?? '요청에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-[var(--color-primary)]/30 bg-[var(--color-primary-bg)]/40 rounded-md p-3 mb-3 space-y-3">
      <p className="text-[12px] text-[var(--color-text-secondary)]">
        팀 생성·참여는 <strong>코치가 검토 후 발급</strong>해요. 원하는 내용을 적어주세요.
      </p>
      <div className="flex gap-1.5">
        {([['create', '새 팀 만들기'], ['join', '기존 팀 참여']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setKind(k)} disabled={k === 'join' && teams.length === 0}
            className={cn('px-2.5 py-1.5 rounded text-[12px] font-medium border disabled:opacity-40',
              kind === k ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-white text-[var(--color-text-secondary)] border-[var(--color-border)]')}>
            {label}
          </button>
        ))}
      </div>
      {kind === 'create' ? (
        <input value={desiredName} onChange={e => setDesiredName(e.target.value)} maxLength={40}
          placeholder="만들고 싶은 팀 이름 (예: 풀코스 도전팀)"
          className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none" />
      ) : (
        <select value={desiredTeamId} onChange={e => setDesiredTeamId(e.target.value)}
          className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none">
          <option value="">참여할 팀 선택</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={300} rows={2}
        placeholder="간단한 사유 (선택)"
        className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)] outline-none resize-none" />
      <button onClick={submit}
        disabled={busy || (kind === 'create' ? !desiredName.trim() : !desiredTeamId)}
        className="w-full py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} 요청 보내기
      </button>
    </div>
  );
}
