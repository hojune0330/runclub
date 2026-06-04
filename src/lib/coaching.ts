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
