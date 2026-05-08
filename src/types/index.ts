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

// ─── View Types ───

export type CalendarView = 'week' | 'month';
export type UserRole = 'admin' | 'member';
