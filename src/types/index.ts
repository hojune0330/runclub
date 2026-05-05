// ─── Session Types ───

export type SessionType = 'ebw' | 'slowrun' | 'marathon';
export type SessionStatus = 'open' | 'closed' | 'cancelled';
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

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

export interface PassProduct {
  id: string;
  name: string;
  category: PassCategory;
  applicableSessions: SessionType[] | 'all';
  totalCount?: number; // for count-based
  durationDays: number;
  price: number;
  description?: string;
  isActive: boolean;
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
