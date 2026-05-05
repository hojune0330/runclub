import { Session, Member, MemberPass, Reservation, WaitlistEntry, Notice, PassProduct, AppNotification } from '@/types';

// ─── Helpers ───

const today = new Date();
const todayStr = today.toISOString().split('T')[0];
const formatDate = (d: Date) => d.toISOString().split('T')[0];
const addDays = (d: Date, days: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
};

// ─── Sessions ───
// 실제 런클럽 운영 스케줄 구조를 반영한 빈 세션 데이터
// 월: EBW 실내러닝 3타임, 수: 슬로우 롱런, 토: 마라톤 클래스

const generateSessions = (): Session[] => {
  const sessions: Session[] = [];

  for (let offset = -7; offset <= 21; offset++) {
    const d = addDays(today, offset);
    const dateStr = formatDate(d);
    const dow = d.getDay();
    const isPast = offset < 0;

    // Monday: EBW x3
    if (dow === 1) {
      ['18:00', '19:00', '20:00'].forEach((time, i) => {
        const reserved = isPast ? 5 + i : 2 + i;
        sessions.push({
          id: `ebw-${dateStr}-${i}`,
          name: 'EBW 실내 러닝',
          type: 'ebw',
          date: dateStr,
          startTime: time,
          endTime: `${parseInt(time) + 1}:00`,
          location: '',
          locationAddress: '',
          maxCapacity: 8,
          currentReservations: Math.min(reserved, 8),
          waitlistCount: reserved >= 8 ? 1 : 0,
          status: isPast ? 'closed' : (reserved >= 8 ? 'closed' : 'open'),
          isIndoor: true,
          cancelDeadlineMinutes: 120,
          recurringGroupId: 'ebw-recurring',
        });
      });
    }

    // Wednesday: Slow Long Run
    if (dow === 3) {
      sessions.push({
        id: `slowrun-${dateStr}`,
        name: '슬로우 롱런',
        type: 'slowrun',
        date: dateStr,
        startTime: '19:30',
        endTime: '21:00',
        location: '',
        locationAddress: '',
        maxCapacity: 50,
        currentReservations: isPast ? 25 : 12,
        waitlistCount: 0,
        status: isPast ? 'closed' : 'open',
        isIndoor: false,
        cancelDeadlineMinutes: 60,
        recurringGroupId: 'slowrun-recurring',
      });
    }

    // Saturday: Marathon Class
    if (dow === 6) {
      sessions.push({
        id: `marathon-${dateStr}`,
        name: '마라톤 클래스',
        type: 'marathon',
        date: dateStr,
        startTime: '10:00',
        endTime: '12:00',
        location: '',
        locationAddress: '',
        maxCapacity: 50,
        currentReservations: isPast ? 30 : 15,
        waitlistCount: 0,
        status: isPast ? 'closed' : 'open',
        isIndoor: false,
        cancelDeadlineMinutes: 120,
        recurringGroupId: 'marathon-recurring',
      });
    }
  }

  // 오늘 세션이 없으면 기본 세션 추가 (앱이 빈 화면이 되지 않도록)
  const todaySessions = sessions.filter(s => s.date === todayStr);
  if (todaySessions.length === 0) {
    sessions.push({
      id: `ebw-today-0`,
      name: 'EBW 실내 러닝',
      type: 'ebw',
      date: todayStr,
      startTime: '18:00',
      endTime: '19:00',
      location: '',
      maxCapacity: 8,
      currentReservations: 4,
      waitlistCount: 0,
      status: 'open',
      isIndoor: true,
      cancelDeadlineMinutes: 120,
    });
    sessions.push({
      id: `ebw-today-1`,
      name: 'EBW 실내 러닝',
      type: 'ebw',
      date: todayStr,
      startTime: '19:00',
      endTime: '20:00',
      location: '',
      maxCapacity: 8,
      currentReservations: 8,
      waitlistCount: 1,
      status: 'closed',
      isIndoor: true,
      cancelDeadlineMinutes: 120,
    });
    sessions.push({
      id: `ebw-today-2`,
      name: 'EBW 실내 러닝',
      type: 'ebw',
      date: todayStr,
      startTime: '20:00',
      endTime: '21:00',
      location: '',
      maxCapacity: 8,
      currentReservations: 2,
      waitlistCount: 0,
      status: 'open',
      isIndoor: true,
      cancelDeadlineMinutes: 120,
    });
    sessions.push({
      id: `slowrun-today`,
      name: '슬로우 롱런',
      type: 'slowrun',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:00',
      location: '',
      maxCapacity: 50,
      currentReservations: 15,
      waitlistCount: 0,
      status: 'open',
      isIndoor: false,
      cancelDeadlineMinutes: 60,
    });
  }

  return sessions.sort((a, b) => a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date));
};

export const sessions: Session[] = generateSessions();

// ─── Members (구조 플레이스홀더) ───

export const members: Member[] = [
  { id: 'm1', name: '회원1', phone: '010-0000-0001', joinDate: '2025-12-01', isActive: true },
  { id: 'm2', name: '회원2', phone: '010-0000-0002', joinDate: '2025-11-15', isActive: true },
  { id: 'm3', name: '회원3', phone: '010-0000-0003', joinDate: '2026-01-10', isActive: true },
  { id: 'm4', name: '회원4', phone: '010-0000-0004', joinDate: '2026-01-20', isActive: true },
  { id: 'm5', name: '회원5', phone: '010-0000-0005', joinDate: '2026-02-01', isActive: true },
  { id: 'm6', name: '회원6', phone: '010-0000-0006', joinDate: '2025-10-05', isActive: true },
  { id: 'm7', name: '회원7', phone: '010-0000-0007', joinDate: '2026-02-15', isActive: true },
  { id: 'm8', name: '회원8', phone: '010-0000-0008', joinDate: '2026-03-01', isActive: true },
  { id: 'm9', name: '비활성회원', phone: '010-0000-0009', joinDate: '2025-08-15', isActive: false },
];

export const currentMember = members[0];

// ─── Pass Products (수강권 상품 구조) ───

export const passProducts: PassProduct[] = [
  { id: 'pp1', name: 'EBW 10회권', category: 'count', applicableSessions: ['ebw'], totalCount: 10, durationDays: 60, price: 200000, isActive: true },
  { id: 'pp2', name: 'EBW 20회권', category: 'count', applicableSessions: ['ebw'], totalCount: 20, durationDays: 90, price: 350000, isActive: true },
  { id: 'pp3', name: '런클럽(수/토) 10회권', category: 'count', applicableSessions: ['slowrun', 'marathon'], totalCount: 10, durationDays: 60, price: 150000, isActive: true },
  { id: 'pp4', name: '런클럽(수/토) 20회권', category: 'count', applicableSessions: ['slowrun', 'marathon'], totalCount: 20, durationDays: 90, price: 250000, isActive: true },
  { id: 'pp5', name: '시즌권', category: 'season', applicableSessions: 'all', durationDays: 90, price: 500000, isActive: true },
  { id: 'pp6', name: '월권', category: 'monthly', applicableSessions: 'all', durationDays: 30, price: 180000, isActive: true },
];

// ─── Member Passes (발급 내역) ───

export const memberPasses: MemberPass[] = [
  { id: 'mp1', memberId: 'm1', memberName: '회원1', productId: 'pp2', productName: 'EBW 20회권', category: 'count', applicableSessions: ['ebw'], totalCount: 20, remainingCount: 14, startDate: '2026-03-01', expiryDate: '2026-05-30', issuedDate: '2026-03-01', price: 350000, status: 'active' },
  { id: 'mp2', memberId: 'm1', memberName: '회원1', productId: 'pp4', productName: '런클럽(수/토) 20회권', category: 'count', applicableSessions: ['slowrun', 'marathon'], totalCount: 20, remainingCount: 16, startDate: '2026-03-01', expiryDate: '2026-05-30', issuedDate: '2026-03-01', price: 250000, status: 'active' },
  { id: 'mp3', memberId: 'm2', memberName: '회원2', productId: 'pp5', productName: '시즌권', category: 'season', applicableSessions: 'all', startDate: '2026-03-01', expiryDate: '2026-05-31', issuedDate: '2026-02-28', price: 500000, status: 'active' },
  { id: 'mp4', memberId: 'm3', memberName: '회원3', productId: 'pp1', productName: 'EBW 10회권', category: 'count', applicableSessions: ['ebw'], totalCount: 10, remainingCount: 3, startDate: '2026-03-15', expiryDate: '2026-05-14', issuedDate: '2026-03-15', price: 200000, status: 'active' },
  { id: 'mp5', memberId: 'm4', memberName: '회원4', productId: 'pp6', productName: '월권', category: 'monthly', applicableSessions: 'all', startDate: '2026-04-01', expiryDate: '2026-04-30', issuedDate: '2026-04-01', price: 180000, status: 'active' },
  { id: 'mp6', memberId: 'm5', memberName: '회원5', productId: 'pp3', productName: '런클럽(수/토) 10회권', category: 'count', applicableSessions: ['slowrun', 'marathon'], totalCount: 10, remainingCount: 7, startDate: '2026-03-01', expiryDate: '2026-04-30', issuedDate: '2026-03-01', price: 150000, status: 'active' },
  { id: 'mp7', memberId: 'm6', memberName: '회원6', productId: 'pp2', productName: 'EBW 20회권', category: 'count', applicableSessions: ['ebw'], totalCount: 20, remainingCount: 2, startDate: '2026-02-01', expiryDate: '2026-04-20', issuedDate: '2026-02-01', price: 350000, status: 'active' },
];

// ─── Reservations ───

const generateReservations = (): Reservation[] => {
  const reservations: Reservation[] = [];

  // 과거 출석 기록 (회원1)
  const pastSessions = sessions.filter(s => s.date < todayStr);
  pastSessions.forEach((session, i) => {
    reservations.push({
      id: `r-past-${session.id}`,
      memberId: 'm1',
      memberName: '회원1',
      sessionId: session.id,
      session,
      status: i % 7 === 0 ? 'noshow' : 'attended',
      reservedAt: `${session.date}T08:00:00`,
      checkedInAt: i % 7 !== 0 ? `${session.date}T${session.startTime}:00` : undefined,
      passId: session.type === 'ebw' ? 'mp1' : 'mp2',
    });
  });

  // 미래 예약 (회원1)
  const futureSessions = sessions.filter(s => s.date >= todayStr);
  futureSessions.slice(0, 4).forEach((session) => {
    reservations.push({
      id: `r-future-${session.id}`,
      memberId: 'm1',
      memberName: '회원1',
      sessionId: session.id,
      session,
      status: 'reserved',
      reservedAt: addDays(today, -1).toISOString(),
      passId: session.type === 'ebw' ? 'mp1' : 'mp2',
    });
  });

  // 다른 회원 예약
  const otherMembers = members.filter(m => m.id !== 'm1' && m.isActive);
  futureSessions.forEach((session) => {
    const count = Math.min(session.currentReservations - 1, otherMembers.length);
    for (let j = 0; j < Math.max(count, 0); j++) {
      reservations.push({
        id: `r-other-${session.id}-${j}`,
        memberId: otherMembers[j].id,
        memberName: otherMembers[j].name,
        sessionId: session.id,
        session,
        status: 'reserved',
        reservedAt: addDays(today, -2).toISOString(),
        passId: `mp${j + 3}`,
      });
    }
  });

  return reservations;
};

export const reservations: Reservation[] = generateReservations();

// ─── Waitlist ───

export const waitlistEntries: WaitlistEntry[] = [
  {
    id: 'w1', memberId: 'm5', memberName: '회원5',
    sessionId: sessions.find(s => s.type === 'ebw' && s.status === 'closed' && s.date >= todayStr)?.id || 'ebw-today-1',
    position: 1, status: 'waiting', createdAt: today.toISOString(),
  },
];

// ─── Notices ───

export const notices: Notice[] = [
  { id: 'n1', title: '장소 변경 안내', content: '이번 주 세션 장소가 변경될 수 있습니다. 공지를 확인해주세요.', createdAt: '2026-04-14T10:00:00', isRead: false },
  { id: 'n2', title: '시즌권 안내', content: '다음 시즌권 사전 등록이 곧 시작됩니다.', createdAt: '2026-04-12T14:00:00', isRead: true },
];

// ─── Notifications ───

export const notifications: AppNotification[] = [
  { id: 'noti1', type: 'session_reminder', title: '세션 리마인더', message: '오늘 세션이 곧 시작됩니다.', createdAt: today.toISOString(), isRead: false },
  { id: 'noti2', type: 'reservation_confirmed', title: '예약 완료', message: '예약이 완료되었습니다.', createdAt: addDays(today, -1).toISOString(), isRead: true },
];

// ─── Configs ───

export const sessionTypeConfig = {
  ebw: { label: 'EBW', color: '#f97316', bgColor: '#fff7ed', textColor: '#c2410c' },
  slowrun: { label: '슬로우 롱런', color: '#3b82f6', bgColor: '#eff6ff', textColor: '#1d4ed8' },
  marathon: { label: '마라톤', color: '#10b981', bgColor: '#ecfdf5', textColor: '#065f46' },
} as const;

export const reservationStatusConfig = {
  reserved: { label: '예약완료', color: '#3b82f6', bgColor: '#eff6ff' },
  attended: { label: '출석', color: '#10b981', bgColor: '#ecfdf5' },
  noshow: { label: '노쇼', color: '#ef4444', bgColor: '#fef2f2' },
  cancelled: { label: '취소', color: '#6b7280', bgColor: '#f9fafb' },
} as const;

export const passStatusConfig = {
  active: { label: '사용중', color: '#10b981', bgColor: '#ecfdf5' },
  expired: { label: '만료', color: '#6b7280', bgColor: '#f9fafb' },
  paused: { label: '정지', color: '#f59e0b', bgColor: '#fffbeb' },
  refunded: { label: '환불', color: '#ef4444', bgColor: '#fef2f2' },
} as const;
