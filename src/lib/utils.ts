import { Session, SessionType, MemberPass, CalendarView } from '@/types';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, isToday, isSameDay, addWeeks, subWeeks, addMonths, subMonths, parseISO, differenceInDays, isBefore, isAfter } from 'date-fns';
import { ko } from 'date-fns/locale';

// ─── Date Utils ───

export const formatKoreanDate = (date: Date | string, fmt: string = 'M월 d일 (EEE)') => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt, { locale: ko });
};

export const formatTime = (time: string) => time;

export const getWeekDays = (date: Date) => {
  const start = startOfWeek(date, { weekStartsOn: 1 }); // Monday start
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
};

export const getMonthDays = (date: Date) => {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return eachDayOfInterval({ start, end });
};

export const navigateDate = (date: Date, view: CalendarView, direction: 'prev' | 'next') => {
  if (view === 'week') {
    return direction === 'next' ? addWeeks(date, 1) : subWeeks(date, 1);
  }
  return direction === 'next' ? addMonths(date, 1) : subMonths(date, 1);
};

export const getDateRangeLabel = (date: Date, view: CalendarView) => {
  if (view === 'week') {
    const days = getWeekDays(date);
    const start = days[0];
    const end = days[6];
    if (start.getMonth() === end.getMonth()) {
      return format(start, 'yyyy년 M월', { locale: ko });
    }
    return `${format(start, 'M월', { locale: ko })} — ${format(end, 'M월', { locale: ko })}`;
  }
  return format(date, 'yyyy년 M월', { locale: ko });
};

export { isToday, isSameDay, parseISO, differenceInDays, isBefore, isAfter, format };

// ─── Session Utils ───

export const getSessionsForDate = (sessions: Session[], date: Date | string) => {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  return sessions.filter(s => s.date === dateStr);
};

export const getSessionColor = (type: SessionType) => {
  const colors = {
    ebw: { bg: 'bg-orange-50', border: 'border-l-orange-400', text: 'text-orange-700', dot: 'bg-orange-400' },
    slowrun: { bg: 'bg-blue-50', border: 'border-l-blue-400', text: 'text-blue-700', dot: 'bg-blue-400' },
    marathon: { bg: 'bg-emerald-50', border: 'border-l-emerald-400', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  };
  return colors[type];
};

export const getSessionStatusLabel = (session: Session) => {
  if (session.status === 'cancelled') return '취소됨';
  if (session.status === 'closed' && session.currentReservations >= session.maxCapacity) return '마감';
  if (session.status === 'closed') return '종료';
  const remaining = session.maxCapacity - session.currentReservations;
  if (remaining <= 2) return `잔여 ${remaining}석`;
  return '예약 가능';
};

export const isSessionFull = (session: Session) => session.currentReservations >= session.maxCapacity;

// ─── Pass Utils ───

export const getDaysUntilExpiry = (pass: MemberPass) => {
  return differenceInDays(parseISO(pass.expiryDate), new Date());
};

export const isPassExpiringSoon = (pass: MemberPass, days: number = 7) => {
  const daysLeft = getDaysUntilExpiry(pass);
  return daysLeft >= 0 && daysLeft <= days;
};

export const canUsePassForSession = (pass: MemberPass, sessionType: SessionType) => {
  if (pass.status !== 'active') return false;
  if (isAfter(new Date(), parseISO(pass.expiryDate))) return false;
  if (pass.category === 'count' && (pass.remainingCount ?? 0) <= 0) return false;
  if (pass.applicableSessions === 'all') return true;
  return pass.applicableSessions.includes(sessionType);
};

// ─── Number Utils ───

export const formatPrice = (price: number) => {
  return new Intl.NumberFormat('ko-KR').format(price) + '원';
};

// ─── cn helper ───

export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}

// ─── Attendance stats helpers ───

/**
 * Calculate the current attendance streak (consecutive attended weeks).
 * A "week" is considered active if at least one session was attended in it.
 * Returns the number of consecutive weeks up to and including the current week.
 */
export function calculateWeeklyStreak(attendedDates: string[]): number {
  if (attendedDates.length === 0) return 0;

  const weekKey = (d: Date) => {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // ISO week: set to Thursday of the current week
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  };

  const weeks = new Set(attendedDates.map(d => weekKey(parseISO(d))));
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 104; i++) {
    const key = weekKey(cursor);
    if (weeks.has(key)) {
      streak++;
    } else if (i === 0) {
      // current week has no attendance yet — skip but don't break
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

/**
 * Get attendance counts grouped by month for the last N months.
 * Returns array of { month: 'YYYY-MM', attended, noshow, total }.
 */
export function getMonthlyAttendance(
  records: { date: string; status: 'attended' | 'noshow' | string }[],
  months: number = 6
): { month: string; label: string; attended: number; noshow: number; rate: number }[] {
  const now = new Date();
  const result: { month: string; label: string; attended: number; noshow: number; rate: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = format(d, 'yyyy-MM');
    const label = format(d, 'M월');
    const inMonth = records.filter(r => r.date.startsWith(monthKey));
    const attended = inMonth.filter(r => r.status === 'attended').length;
    const noshow = inMonth.filter(r => r.status === 'noshow').length;
    const total = attended + noshow;
    const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
    result.push({ month: monthKey, label, attended, noshow, rate });
  }
  return result;
}

/**
 * Get last N weeks of attendance (for heatmap-style display).
 * Returns 7 × weeks grid, each cell has attendance count.
 */
export function getWeeklyHeatmap(
  attendedDates: string[],
  weeks: number = 12
): { weekStart: string; days: { date: string; count: number; dayOfWeek: number }[] }[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun ... 6=Sat
  // Start of current week (Monday)
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  currentMonday.setHours(0, 0, 0, 0);

  const counts = new Map<string, number>();
  attendedDates.forEach(d => counts.set(d, (counts.get(d) || 0) + 1));

  const result: { weekStart: string; days: { date: string; count: number; dayOfWeek: number }[] }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = new Date(currentMonday);
    monday.setDate(currentMonday.getDate() - w * 7);
    const days: { date: string; count: number; dayOfWeek: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + d);
      const key = format(day, 'yyyy-MM-dd');
      days.push({ date: key, count: counts.get(key) || 0, dayOfWeek: d });
    }
    result.push({ weekStart: format(monday, 'yyyy-MM-dd'), days });
  }
  return result;
}
