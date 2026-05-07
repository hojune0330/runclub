// ─── Session Types ───

export type SessionType = 'ebw' | 'slowrun' | 'marathon';
export type SessionStatus = 'open' | 'closed' | 'cancelled';
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

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
  applicableSessions: SessionType[] | 'all';
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
  applicableSessions: SessionType[] | 'all';
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
