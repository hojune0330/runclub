// ─── Session Types ───

// Legacy 3-종 enum. PR-C1 이후로는 태그 시스템(SessionTag)이 단일 진실
// 공급원이며, 이 enum 은 마이그레이션 종료 시점(PR-C4)까지 fallback 용도로만
// 유지된다. 새 코드 경로에서는 sessions.tags / passProducts.tags 를 사용할 것.
export type SessionType = 'ebw' | 'slowrun' | 'marathon';
export type SessionStatus = 'open' | 'closed' | 'cancelled';
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ─── Session Tag (PR-C1) ───
// 어드민이 자유롭게 추가/삭제할 수 있는 태그 마스터. 시드로 'ebw',
// 'slowrun', 'marathon' 3종이 들어가 있고, 운영 중에 'friday-free',
// 'morning' 같은 신규 태그를 코드 변경 없이 추가할 수 있다.
export interface SessionTag {
  id: string;
  label: string;
  color?: string;
  icon?: string;
  displayOrder?: number;
  isActive: boolean;
  updatedAt?: string;
}

// Predefined ribbon/badge styles members see before registering.
// Using a closed enum (vs free-form text+icon name) keeps the UI consistent
// across sessions and prevents broken icon names from leaking into prod.
export type SessionRibbon =
  | 'none'
  | 'new'         // 🆕 신규 / 첫 오픈
  | 'hot'         // 🔥 인기
  | 'few_seats'   // ⏰ 마감 임박
  | 'beginner'    // 🌱 입문 환영
  | 'special'     // ⭐ 스페셜 클래스
  | 'event'       // 🎉 이벤트
  | 'rain_check'; // ☔ 우천 시 안내

export interface Session {
  id: string;
  name: string;
  type: SessionType;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime?: string;
  location: string;
  locationAddress?: string;
  locationMapUrl?: string;
  maxCapacity: number;
  currentReservations: number;
  waitlistCount: number;
  status: SessionStatus;
  // ─── PR-C2: 오버부킹 비율 (0.0 ~ 0.5) ───
  // 정원의 N% 만큼은 중복 예약을 허용한다. 예: maxCapacity=10,
  // overbookRatio=0.10 → 11명까지 즉시 예약, 12번째부터 대기.
  // 클라이언트는 effectiveCapacity = maxCapacity + ceil(maxCapacity * ratio)
  // 로 계산해 표시. 서버는 동일 공식으로 INSERT 시 검증.
  overbookRatio?: number;
  isIndoor: boolean;
  memo?: string;
  memoPublic?: boolean;
  cancelDeadlineMinutes: number; // minutes before session
  recurringGroupId?: string;

  // ─── Pre-registration "info card" fields (PR-7) ────────────────────────
  // Short tagline/description shown to members on the session detail page
  // before they register. Markdown is NOT supported on purpose: we keep it
  // a single block of plain text so it renders predictably on mobile.
  description?: string;
  // External event page (e.g. company landing page, Notion, Eventbrite, etc.)
  eventUrl?: string;
  // Instagram post / reel showing past session reviews or highlights.
  instagramUrl?: string;
  // KakaoTalk OpenChat invite link for the session cohort.
  kakaoOpenChatUrl?: string;
  // Optional small ribbon/badge displayed next to the session title — used
  // to draw attention to limited or special sessions ("🔥 인기", "🌱 입문").
  ribbon?: SessionRibbon;
  // Optional cover image URL displayed on the member detail page.
  coverImageUrl?: string;

  // ─── PR-C1: Tag-based categorisation ───
  // 세션에 부착된 태그 id 배열. session_tag_map 테이블에서 조인해 온다.
  // 비어 있으면 매칭 로직이 type 필드로 fallback 한다 (PR-C4 까지).
  tags?: string[];
}

// ─── Reservation Types ───

export type ReservationStatus = 'reserved' | 'attended' | 'noshow' | 'cancelled';
export type WaitlistStatus = 'waiting' | 'offered' | 'confirmed' | 'expired' | 'cancelled';

export interface Reservation {
  id: string;
  memberId: string;
  memberName: string;
  sessionId: string;
  session?: Session;
  status: ReservationStatus;
  reservedAt: string;
  checkedInAt?: string;
  cancelledAt?: string;
  passId: string;
}

export interface WaitlistEntry {
  id: string;
  memberId: string;
  memberName: string;
  sessionId: string;
  position: number;
  status: WaitlistStatus;
  createdAt: string;
  offeredAt?: string;
  expiresAt?: string;
}

// ─── Pass (수강권) Types ───

export type PassCategory = 'count' | 'season' | 'monthly';
export type PassStatus = 'active' | 'expired' | 'paused' | 'refunded';

// PR-6: Payment envelope. `unpaid` is the default (admin-issued before the
// member pays); `paid` is set either manually by the admin or by the Toss
// webhook handler. `refunded` / `partial_refund` are post-payment states
// (we keep a single value here; full ledger lives in admin_audit_log).
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'partial_refund';

// PR-6: Payment method tag — kept as a free string in DB so we can add
// PG channels later without migrations, but typed here for the UI.
export type PaymentMethod =
  | 'cash'        // 현금
  | 'transfer'    // 계좌이체
  | 'card'        // 수기 카드
  | 'kakaopay'    // 카카오페이
  | 'tosspay'     // 토스페이
  | 'naverpay'    // 네이버페이
  | 'toss'        // 토스페이먼츠 (PG, 모든 카드/간편결제 통합)
  | 'manual'      // 외부 결제 완료 (입금 확인 등)
  | 'free';       // 무료 발급

export interface PassProduct {
  id: string;
  name: string;
  category: PassCategory;
  // Legacy 매칭 필드. PR-C1 이후 tags 가 단일 진실 공급원이며 이 필드는
  // PR-C4 까지 fallback 으로만 유지된다.
  applicableSessions: SessionType[] | 'all';
  // ─── PR-C1: Tag-based applicability ───
  // session_tags.id 의 배열. 특수값 '*' 한 개만 들어 있으면 모든 세션 사용
  // 가능(옴니패스). 비어 있으면 applicableSessions 로 fallback.
  tags?: string[];
  totalCount?: number; // for count-based
  durationDays: number;
  price: number;
  /** Short subtitle shown on the catalog card. */
  description?: string;
  /** Long marketing copy for the product detail page (markdown-lite). */
  descriptionLong?: string;
  /** Refund / cancellation policy shown next to the buy button. */
  refundPolicy?: string;
  /** Strikethrough "정가" — only shown if higher than `price`. */
  originalPrice?: number;
  /** Optional hero image (recommended 16:9, ≤500KB). */
  imageUrl?: string;
  /** Manual sort order on the catalog page (lower = earlier). */
  displayOrder?: number;
  /** Highlights the card with a "추천" badge. */
  isFeatured?: boolean;
  isActive: boolean;
  updatedAt?: string;
}

export interface MemberPass {
  id: string;
  memberId: string;
  memberName?: string;
  productId: string;
  productName: string;
  category: PassCategory;
  // Legacy. PR-C1 이후 tags 가 우선이며 PR-C4 까지 fallback 으로 유지.
  applicableSessions: SessionType[] | 'all';
  // ─── PR-C1: 상품 태그 사본 (조인 비용 절감용) ───
  // 발급 당시 product 의 tags 를 그대로 복사해 둔다. 회원 UI 에서 빠르게
  // 노출하기 위함. 빈 배열이면 applicableSessions 로 fallback.
  tags?: string[];
  totalCount?: number;
  remainingCount?: number;
  startDate: string;
  expiryDate: string;
  issuedDate: string;
  price: number;
  status: PassStatus;
  pausedAt?: string;
  pausedUntil?: string;

  // ── PR-6: Payment envelope ──
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod | string;
  paymentAmount?: number;
  paidAt?: string;
  transactionId?: string;
  discountAmount?: number;
  discountReason?: string;
  adminMemo?: string;
  updatedAt?: string;
}

// ─── Member Types ───

export interface Member {
  id: string;
  name: string;
  phone: string;
  email?: string;
  /** 'admin' for staff accounts, 'member' for runners. Optional because legacy
   *  code paths and registration responses don't always include it. */
  role?: 'admin' | 'member';
  joinDate: string;
  isActive: boolean;
  memo?: string;
  profileImage?: string;
  /** Google Sheets Members J~O manager-maintained metadata imported by admin review. */
  sheetManagerMemo?: string | null;
  sheetTag?: string | null;
  sheetMemberGrade?: string | null;
  sheetAcquisitionSource?: string | null;
  sheetNextContactDate?: string | null;
  sheetAssignedManager?: string | null;
  sheetMetaSyncedAt?: string | null;
  /** Admin-only login support fields. Public auth responses do not expose these. */
  mustChangePassword?: boolean;
  failedLoginCount?: number;
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
  lastLoginFailedAt?: string | null;
  lastAuthEventReason?: string | null;
  lastAuthEventAt?: string | null;
}

// ─── Notice Types ───

export interface Notice {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  targetSessions?: SessionType[];
  isRead?: boolean;
}

// ─── Stats Types ───

export interface DailyStats {
  date: string;
  totalReservations: number;
  totalAttendance: number;
  totalNoshow: number;
  totalCancelled: number;
}

export interface SessionStats {
  sessionType: SessionType;
  totalSessions: number;
  averageAttendanceRate: number;
  totalAttendees: number;
}

// ─── Notification Types ───

export type NotificationType = 
  | 'reservation_confirmed'
  | 'reservation_cancelled'
  | 'session_reminder'
  | 'waitlist_available'
  | 'pass_expiring'
  | 'session_changed'
  | 'new_notice';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  linkTo?: string;
}

// ─── Coaching Platform (P1): Class / Team / Enrollment / TeamRequest ───
// docs/coaching-platform-plan.md 참고. 목표 지향 수업(마라톤/하이록스/혈당관리 등)
// 을 위한 옵트인 레이어. 기존 Session(개별 회차)과 별개의 "기간제 프로그램".

export type ClassKind = 'marathon' | 'hyrox' | 'glucose' | 'health' | 'pt' | 'custom';
export type ClassStatus = 'active' | 'finished' | 'archived';
export type ClassMetricFocus =
  | 'distance'
  | 'mileage'
  | 'attendance'
  | 'homework'
  | 'glucose_in_range';

export interface CoachingClass {
  id: string;
  name: string;
  kind: ClassKind;
  goalSummary?: string;
  coachId?: string;
  coachName?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  status: ClassStatus;
  tagId?: string;
  metricFocus: ClassMetricFocus;
  coverImageUrl?: string;
  leaderboardPublic: boolean;
  // 집계(목록/상세 조회 시 채워짐)
  memberCount?: number;
  teamCount?: number;
  myEnrollment?: ClassEnrollment;
  teams?: ClassTeam[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ClassTeam {
  id: string;
  classId: string;
  name: string;
  color?: string;
  createdBy?: string;
  memberCount?: number;
  createdAt?: string;
}

export type EnrollmentRole = 'member' | 'coach';
export type EnrollmentStatus = 'active' | 'dropped' | 'finished';

export interface ClassEnrollment {
  id: string;
  classId: string;
  memberId: string;
  memberName?: string;
  teamId?: string;
  teamName?: string;
  role: EnrollmentRole;
  goalText?: string;
  goalTarget?: number;
  status: EnrollmentStatus;
  joinedAt?: string;
}

export type TeamRequestKind = 'create' | 'join' | 'move';
export type TeamRequestStatus = 'pending' | 'approved' | 'rejected';

export interface TeamRequest {
  id: string;
  classId: string;
  className?: string;
  memberId: string;
  memberName?: string;
  kind: TeamRequestKind;
  desiredTeamId?: string;
  desiredTeamName?: string;
  desiredName?: string;
  reason?: string;
  status: TeamRequestStatus;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  createdAt?: string;
}

// ─── Coaching Platform (P2): Activity / Homework / Encouragement ───

export type ActivityKind =
  | 'run' | 'walk_run' | 'long_run' | 'interval'
  | 'glucose' | 'body_comp' | 'fasting' | 'weight' | 'custom';
export type ActivitySource =
  | 'manual' | 'strava' | 'garmin' | 'apple_health'
  | 'samsung_health' | 'barojaenfit_manual' | 'barojaenfit_api' | 'libre_cgm';

export interface ActivityLog {
  id: string;
  memberId: string;
  memberName?: string;
  classId?: string;
  kind: ActivityKind;
  source: ActivitySource;
  sourceRef?: string;
  activityDate: string; // YYYY-MM-DD
  distanceM?: number;
  durationS?: number;
  avgPaceS?: number;
  elevationM?: number;
  avgHr?: number;
  metrics?: Record<string, unknown>;
  note?: string;
  photoUrl?: string;
  createdAt?: string;
  /** 사용자가 값을 수정한 시각(출처 무관). 있으면 "수정됨" 표시 */
  editedAt?: string;
  // 집계 시 채워짐
  cheerCount?: number;
  commentCount?: number;
  encouragements?: Encouragement[];
}

export interface ActivityStatsPeriod {
  key: 'calendar_week' | 'rolling_7' | 'calendar_month' | 'rolling_30' | 'calendar_year' | 'rolling_365';
  label: string;
  mode: 'calendar' | 'rolling';
  from: string;
  to: string;
  distanceM: number;
  durationS: number;
  activityCount: number;
  longestDistanceM: number;
  avgPaceS: number | null;
}

export interface ActivityStatsBucket {
  date?: string;
  month?: number;
  label?: string;
  from?: string;
  distanceM: number;
  durationS: number;
  activityCount: number;
}

export interface ActivityStatsKindBreakdown {
  kind: ActivityKind;
  label: string;
  distanceM: number;
  durationS: number;
  activityCount: number;
}

export interface ActivityStatsLatestTraining {
  id: string;
  kind: ActivityKind;
  label: string;
  source: string;
  activityDate: string;
  distanceM: number;
  durationS: number;
  note: string | null;
}

export interface ActivityDistanceStats {
  generatedAt: string;
  today: string;
  periods: ActivityStatsPeriod[];
  rolling30Daily: ActivityStatsBucket[];
  calendarYearMonthly: ActivityStatsBucket[];
  kindBreakdown: ActivityStatsKindBreakdown[];
  latestTrainingNotes: ActivityStatsLatestTraining[];
}

export type HomeworkMetric = 'distance' | 'count' | 'duration' | 'checkin' | 'freeform';

export interface Homework {
  id: string;
  classId: string;
  className?: string;
  title: string;
  description?: string;
  metric: HomeworkMetric;
  targetValue?: number;
  periodStart?: string;
  periodEnd?: string;
  createdBy?: string;
  createdAt?: string;
  // 집계(내 제출 현황)
  mySubmission?: HomeworkSubmission;
  submissionCount?: number;
  verifiedCount?: number;
}

export type HomeworkSubmissionStatus = 'submitted' | 'verified' | 'rejected';

export interface HomeworkSubmission {
  id: string;
  homeworkId: string;
  memberId: string;
  memberName?: string;
  achievedValue?: number;
  status: HomeworkSubmissionStatus;
  note?: string;
  photoUrl?: string;
  submittedAt?: string;
}

export type EncouragementKind = 'cheer' | 'fire' | 'comment';

export interface Encouragement {
  id: string;
  memberId: string;
  memberName?: string;
  targetType: 'activity' | 'homework_submission';
  targetId: string;
  kind: EncouragementKind;
  comment?: string;
  createdAt?: string;
}

// ─── Coaching Platform (P3): Leaderboard ───

export interface LeaderboardRow {
  memberId: string;
  memberName: string;
  teamId?: string;
  teamName?: string;
  value: number;       // 지표 원시 값 (distance=m, mileage=p, …) 또는 가공값
  displayValue: string; // 표시용 포맷 (예: "42.2km", "320P", "85%")
  rank: number;
  isMe?: boolean;
}

export interface TeamLeaderboardRow {
  teamId: string;
  teamName: string;
  color?: string;
  total: number;
  average: number;
  memberCount: number;
  displayTotal: string;
}

export interface LeaderboardResult {
  metricFocus: ClassMetricFocus;
  metricLabel: string;
  periodStart?: string;
  periodEnd?: string;
  individuals: LeaderboardRow[];
  teams: TeamLeaderboardRow[];
}

// ─── Coaching Platform (P-b): Periodization (9.5일 주기화) ───

export type BlockIntensity = 'rest' | 'easy' | 'moderate' | 'hard' | 'peak';

export interface TrainingBlock {
  id: string;
  planId: string;
  sortOrder: number;
  label: string;
  daySpan: number;        // 며칠 동안(소수 허용 → 9.5일 주기 대응)
  intensity: BlockIntensity;
  focus?: string;
  targetDistanceM?: number;
}

export interface TrainingPlan {
  id: string;
  classId?: string;
  memberId?: string;
  name: string;
  cycleDays: number;       // 사이클 총 일수 (기본 9.5)
  anchorDate: string;      // YYYY-MM-DD, 사이클 시작 기준일
  isActive: boolean;
  note?: string;
  createdBy?: string;
  createdAt?: string;
  blocks?: TrainingBlock[];
  // 집계(오늘 위치)
  todayBlock?: TrainingBlock | null;
  cyclePosition?: number;  // 오늘이 사이클 며칠째(0-base, 소수 가능)
  cycleIndex?: number;     // 몇 번째 사이클인지
}

// ─── View Types ───

export type CalendarView = 'week' | 'month';
export type UserRole = 'admin' | 'member';
