// ─── 코칭 플랫폼 공용 매퍼/헬퍼 (P1) ───
// DB row(snake_case) → API DTO(camelCase) 변환을 한 곳에 모은다.
// docs/coaching-platform-plan.md 참고.

import type {
  CoachingClass,
  ClassTeam,
  ClassEnrollment,
  TeamRequest,
  ClassKind,
  ClassStatus,
  ClassMetricFocus,
  EnrollmentRole,
  EnrollmentStatus,
  TeamRequestKind,
  TeamRequestStatus,
  ActivityLog,
  ActivityKind,
  ActivitySource,
  Homework,
  HomeworkMetric,
  HomeworkSubmission,
  HomeworkSubmissionStatus,
  Encouragement,
  EncouragementKind,
} from '@/types';

export const CLASS_KINDS: ClassKind[] = ['marathon', 'hyrox', 'glucose', 'health', 'pt', 'custom'];
export const CLASS_STATUSES: ClassStatus[] = ['active', 'finished', 'archived'];
export const METRIC_FOCUSES: ClassMetricFocus[] = [
  'distance',
  'mileage',
  'attendance',
  'homework',
  'glucose_in_range',
];

export const CLASS_KIND_LABEL: Record<ClassKind, string> = {
  marathon: '마라톤',
  hyrox: '하이록스',
  glucose: '혈당관리',
  health: '건강관리',
  pt: '1:1 PT',
  custom: '기타',
};

export const METRIC_FOCUS_LABEL: Record<ClassMetricFocus, string> = {
  distance: '누적 거리',
  mileage: '마일리지',
  attendance: '출석',
  homework: '과제 달성률',
  glucose_in_range: '혈당 목표 범위',
};

function asNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function asDate(v: unknown): string | undefined {
  if (!v) return undefined;
  // pg DATE → JS Date 또는 'YYYY-MM-DD' 문자열로 올 수 있음
  const s = String(v);
  return s.slice(0, 10);
}

export function mapClassRow(r: any): CoachingClass {
  return {
    id: r.id,
    name: r.name,
    kind: (CLASS_KINDS.includes(r.kind) ? r.kind : 'custom') as ClassKind,
    goalSummary: r.goal_summary ?? undefined,
    coachId: r.coach_id ?? undefined,
    coachName: r.coach_name ?? undefined,
    startDate: asDate(r.start_date),
    endDate: asDate(r.end_date),
    status: (CLASS_STATUSES.includes(r.status) ? r.status : 'active') as ClassStatus,
    tagId: r.tag_id ?? undefined,
    metricFocus: (METRIC_FOCUSES.includes(r.metric_focus) ? r.metric_focus : 'distance') as ClassMetricFocus,
    coverImageUrl: r.cover_image_url ?? undefined,
    leaderboardPublic: r.leaderboard_public !== false,
    memberCount: asNum(r.member_count),
    teamCount: asNum(r.team_count),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
  };
}

export function mapTeamRow(r: any): ClassTeam {
  return {
    id: r.id,
    classId: r.class_id,
    name: r.name,
    color: r.color ?? undefined,
    createdBy: r.created_by ?? undefined,
    memberCount: asNum(r.member_count),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
  };
}

export function mapEnrollmentRow(r: any): ClassEnrollment {
  return {
    id: r.id,
    classId: r.class_id,
    memberId: r.member_id,
    memberName: r.member_name ?? undefined,
    teamId: r.team_id ?? undefined,
    teamName: r.team_name ?? undefined,
    role: (r.role === 'coach' ? 'coach' : 'member') as EnrollmentRole,
    goalText: r.goal_text ?? undefined,
    goalTarget: asNum(r.goal_target),
    status: (['active', 'dropped', 'finished'].includes(r.status) ? r.status : 'active') as EnrollmentStatus,
    joinedAt: r.joined_at ? new Date(r.joined_at).toISOString() : undefined,
  };
}

export function mapTeamRequestRow(r: any): TeamRequest {
  return {
    id: r.id,
    classId: r.class_id,
    className: r.class_name ?? undefined,
    memberId: r.member_id,
    memberName: r.member_name ?? undefined,
    kind: (['create', 'join', 'move'].includes(r.kind) ? r.kind : 'create') as TeamRequestKind,
    desiredTeamId: r.desired_team_id ?? undefined,
    desiredTeamName: r.desired_team_name ?? undefined,
    desiredName: r.desired_name ?? undefined,
    reason: r.reason ?? undefined,
    status: (['pending', 'approved', 'rejected'].includes(r.status) ? r.status : 'pending') as TeamRequestStatus,
    resolvedBy: r.resolved_by ?? undefined,
    resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : undefined,
    resolutionNote: r.resolution_note ?? undefined,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
  };
}

// ─── P2: Activity / Homework / Encouragement ───

export const ACTIVITY_KINDS: ActivityKind[] = [
  'run', 'walk_run', 'long_run', 'interval',
  'glucose', 'body_comp', 'fasting', 'weight', 'custom',
];
export const ACTIVITY_SOURCES: ActivitySource[] = [
  'manual', 'strava', 'garmin', 'apple_health',
  'samsung_health', 'barojaenfit_manual', 'barojaenfit_api', 'libre_cgm',
];
export const HOMEWORK_METRICS: HomeworkMetric[] = ['distance', 'count', 'duration', 'checkin', 'freeform'];
export const ENCOURAGEMENT_KINDS: EncouragementKind[] = ['cheer', 'fire', 'comment'];

/**
 * 활동 출처(source) 라벨·색상.
 * 수기·애플·가민·Strava 등 어떤 경로로 들어왔든 종합 수치엔 동일하게 집계되지만,
 * 화면에선 "어디서 온 기록인지" 한눈에 구분되도록 작은 배지를 보여준다.
 */
export const ACTIVITY_SOURCE_META: Record<ActivitySource, { label: string; color: string }> = {
  manual:             { label: '직접 입력', color: '#0ea5e9' },
  strava:             { label: 'Strava',    color: '#fc4c02' },
  garmin:             { label: 'Garmin',    color: '#007cc3' },
  apple_health:       { label: 'Apple 건강', color: '#ff2d55' },
  samsung_health:     { label: 'Samsung',   color: '#1428a0' },
  barojaenfit_manual: { label: 'BaroJaenfit', color: '#22c55e' },
  barojaenfit_api:    { label: 'BaroJaenfit', color: '#22c55e' },
  libre_cgm:          { label: 'CGM',       color: '#ffd400' },
};

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  run: '러닝',
  walk_run: '걷기/달리기',
  long_run: '롱런',
  interval: '인터벌',
  glucose: '혈당 측정',
  body_comp: '체성분',
  fasting: '단식',
  weight: '체중',
  custom: '기타',
};

export const HOMEWORK_METRIC_LABEL: Record<HomeworkMetric, string> = {
  distance: '거리(누적)',
  count: '횟수',
  duration: '시간(분)',
  checkin: '출석',
  freeform: '자유 인증',
};

function asJson(v: unknown): Record<string, unknown> | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return undefined; }
  }
  return undefined;
}

export function mapActivityRow(r: any): ActivityLog {
  return {
    id: r.id,
    memberId: r.member_id,
    memberName: r.member_name ?? undefined,
    classId: r.class_id ?? undefined,
    kind: (ACTIVITY_KINDS.includes(r.kind) ? r.kind : 'custom') as ActivityKind,
    source: (ACTIVITY_SOURCES.includes(r.source) ? r.source : 'manual') as ActivitySource,
    sourceRef: r.source_ref ?? undefined,
    activityDate: asDate(r.activity_date) ?? '',
    distanceM: asNum(r.distance_m),
    durationS: asNum(r.duration_s),
    avgPaceS: asNum(r.avg_pace_s),
    elevationM: asNum(r.elevation_m),
    avgHr: asNum(r.avg_hr),
    metrics: asJson(r.metrics),
    note: r.note ?? undefined,
    photoUrl: r.photo_url ?? undefined,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    editedAt: r.edited_at ? new Date(r.edited_at).toISOString() : undefined,
    cheerCount: asNum(r.cheer_count),
    commentCount: asNum(r.comment_count),
  };
}

export function mapHomeworkRow(r: any): Homework {
  return {
    id: r.id,
    classId: r.class_id,
    className: r.class_name ?? undefined,
    title: r.title,
    description: r.description ?? undefined,
    metric: (HOMEWORK_METRICS.includes(r.metric) ? r.metric : 'freeform') as HomeworkMetric,
    targetValue: asNum(r.target_value),
    periodStart: asDate(r.period_start),
    periodEnd: asDate(r.period_end),
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    submissionCount: asNum(r.submission_count),
    verifiedCount: asNum(r.verified_count),
  };
}

export function mapHomeworkSubmissionRow(r: any): HomeworkSubmission {
  return {
    id: r.id,
    homeworkId: r.homework_id,
    memberId: r.member_id,
    memberName: r.member_name ?? undefined,
    achievedValue: asNum(r.achieved_value),
    status: (['submitted', 'verified', 'rejected'].includes(r.status) ? r.status : 'submitted') as HomeworkSubmissionStatus,
    note: r.note ?? undefined,
    photoUrl: r.photo_url ?? undefined,
    submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : undefined,
  };
}

export function mapEncouragementRow(r: any): Encouragement {
  return {
    id: r.id,
    memberId: r.member_id,
    memberName: r.member_name ?? undefined,
    targetType: r.target_type === 'homework_submission' ? 'homework_submission' : 'activity',
    targetId: r.target_id,
    kind: (ENCOURAGEMENT_KINDS.includes(r.kind) ? r.kind : 'cheer') as EncouragementKind,
    comment: r.comment ?? undefined,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
  };
}

// ─── 표시용 포맷터 ───

/** 미터 → "12.3km" / "850m" */
export function formatDistance(m?: number): string {
  if (!m || m <= 0) return '0km';
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km`;
}

/** 초/km → "5'30\"/km" */
export function formatPace(s?: number): string {
  if (!s || s <= 0) return '-';
  const mm = Math.floor(s / 60);
  const ss = Math.round(s % 60);
  return `${mm}'${String(ss).padStart(2, '0')}"/km`;
}

/** 초 → "1:05:30" 또는 "32:10" */
export function formatDuration(s?: number): string {
  if (!s || s <= 0) return '-';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
