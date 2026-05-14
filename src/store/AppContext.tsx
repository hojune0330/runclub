'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import type { Session, Member, MemberPass, Reservation, WaitlistEntry, Notice, PassProduct, ReservationStatus, SessionTag } from '@/types';
import { api, AuthExpiredError, type SessionTagDto } from '@/lib/api';
import { useAuth } from './AuthContext';

interface AppState {
  sessions: Session[];
  members: Member[];
  memberPasses: MemberPass[];
  reservations: Reservation[];
  waitlistEntries: WaitlistEntry[];
  notices: Notice[];
  passProducts: PassProduct[];
  // PR-A: 세션 태그 마스터 (어드민 CRUD + 회원 표시용)
  // 회원 화면도 태그 라벨/색상을 표시하므로 모든 사용자에게 로드.
  sessionTags: SessionTag[];
  // PR-D1: 정정 요청 — 회원은 본인 요청, 관리자는 전체 인박스.
  correctionRequests: CorrectionRequestDto[];
  currentMember: Member;
  loading: boolean;
}

// PR-D1: 정정 요청 DTO (회원/관리자 공용)
export interface CorrectionRequestDto {
  id: string;
  reservationId: string;
  memberId: string;
  memberName: string;
  memberPhone: string | null;
  sessionId: string;
  sessionName: string;
  sessionDate: string;
  sessionStartTime: string;
  sessionType: string;
  reservationStatus: 'reserved' | 'attended' | 'noshow' | 'cancelled';
  reasonCode:
    | 'attended_marked_noshow'
    | 'noshow_marked_attended'
    | 'want_cancel'
    | 'swapped_with_other'
    | 'other';
  detail: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  resolutionNote: string | null;
  appliedStatus: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
}

interface AppActions {
  refreshSessions: () => Promise<void>;
  refreshReservations: () => Promise<void>;
  refreshPasses: () => Promise<void>;
  refreshNotices: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshSessionTags: () => Promise<void>;
  refreshCorrectionRequests: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // PR-A: 태그 마스터 CRUD (어드민 전용 — 서버에서 강제)
  createSessionTag: (data: { id: string; label: string; color?: string; icon?: string; displayOrder?: number }) => Promise<boolean>;
  updateSessionTag: (data: { id: string; label?: string; color?: string | null; icon?: string | null; displayOrder?: number; isActive?: boolean }) => Promise<boolean>;
  deleteSessionTag: (id: string) => Promise<boolean>;

  // PR-D1: 정정 요청 액션
  createCorrectionRequest: (data: { reservationId: string; reasonCode: string; detail?: string }) => Promise<boolean>;
  withdrawCorrectionRequest: (id: string) => Promise<boolean>;
  approveCorrectionRequest: (id: string, params?: { targetStatus?: 'reserved' | 'attended' | 'noshow' | 'cancelled'; note?: string }) => Promise<boolean>;
  rejectCorrectionRequest: (id: string, note: string) => Promise<boolean>;

  // PR-D1: 관리자 — 예약자 강제 추가 + 노쇼 일괄 처리
  forceAddReservation: (params: {
    sessionId: string;
    memberId: string;
    force?: boolean;
    skipPass?: boolean;
    initialStatus?: 'reserved' | 'attended';
  }) => Promise<{ ok: boolean; status?: 'reserved' | 'attended' }>;
  bulkMarkNoshow: (sessionId: string) => Promise<number>;

  // PR-C2: 자동 대기 전환을 알리기 위해 결과 객체로 확장.
  // 호출 측은 ok 만 봐도 동작하고, autoWaitlisted=true 면 정원 마감으로
  // 대기열에 자동 등록되었음을 의미한다.
  makeReservation: (sessionId: string, memberId?: string) => Promise<{
    ok: boolean;
    autoWaitlisted?: boolean;
    usedOverbookSlot?: boolean;
    position?: number;
    message?: string;
  }>;
  cancelReservation: (reservationId: string) => Promise<void>;
  updateReservationStatus: (reservationId: string, status: ReservationStatus) => Promise<void>;

  joinWaitlist: (sessionId: string) => Promise<void>;
  leaveWaitlist: (entryId: string) => Promise<void>;

  createSession: (data: Omit<Session, 'id' | 'currentReservations' | 'waitlistCount' | 'status'>) => Promise<void>;
  updateSession: (sessionId: string, data: Partial<Session>) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<void>;

  createNotice: (data: { title: string; content: string; targetSessions?: string[] }) => Promise<void>;
  deleteNotice: (noticeId: string) => Promise<void>;
  markNoticeRead: (noticeId: string) => Promise<void>;

  addMember: (data: Omit<Member, 'id'>) => Promise<any>;
  // PR-5: per-member admin actions
  resetMemberPassword: (memberId: string) => Promise<{ tempPassword: string; memberName: string } | null>;
  deleteMember: (memberId: string) => Promise<boolean>;
  setMemberActive: (memberId: string, active: boolean) => Promise<boolean>;
  setMemberRole: (memberId: string, role: 'admin' | 'member') => Promise<boolean>;

  issueMemberPass: (memberId: string, productId: string, opts?: {
    paymentStatus?: 'unpaid' | 'paid' | 'refunded' | 'partial_refund';
    paymentMethod?: string;
    paymentAmount?: number;
    discountAmount?: number;
    discountReason?: string;
    adminMemo?: string;
    startDate?: string;
  }) => Promise<{ id: string } | null>;
  pauseMemberPass: (passId: string) => Promise<void>;
  resumeMemberPass: (passId: string) => Promise<void>;
  refundMemberPass: (passId: string, params: { cancelReason: string; cancelAmount?: number; skipToss?: boolean }) => Promise<boolean>;
  extendMemberPass: (passId: string, params: { days?: number; expiryDate?: string }) => Promise<boolean>;
  adjustMemberPass: (passId: string, params: { totalCount?: number; remainingCount?: number }) => Promise<boolean>;
  setMemberPassPayment: (passId: string, params: {
    paymentStatus: 'unpaid' | 'paid' | 'refunded' | 'partial_refund';
    paymentMethod?: string;
    paymentAmount?: number;
    transactionId?: string;
  }) => Promise<boolean>;
  setMemberPassMemo: (passId: string, adminMemo: string) => Promise<boolean>;

  // PR-6: pass product (catalog) admin actions
  createPassProduct: (data: any) => Promise<{ id: string } | null>;
  updatePassProduct: (id: string, data: any) => Promise<boolean>;
  deactivatePassProduct: (id: string) => Promise<boolean>;
  deletePassProduct: (id: string, hard?: boolean) => Promise<boolean>;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

const emptyCurrent: Member = { id: '', name: '', phone: '', joinDate: '', isActive: true };

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  // Store user.id as a stable reference to avoid re-creating callbacks
  const userIdRef = useRef(user?.id);
  const userRoleRef = useRef(user?.role);
  const loadedRef = useRef(false);

  // Update refs when user changes
  if (user) {
    userIdRef.current = user.id;
    userRoleRef.current = user.role;
  }

  const [sessions, setSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberPasses, setMemberPasses] = useState<MemberPass[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [passProducts, setPassProducts] = useState<PassProduct[]>([]);
  const [sessionTags, setSessionTags] = useState<SessionTag[]>([]);
  const [correctionRequests, setCorrectionRequests] = useState<CorrectionRequestDto[]>([]);
  const [loading, setLoading] = useState(true);

  const currentMember: Member = user ? {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    joinDate: user.joinDate,
    isActive: user.isActive,
    memo: user.memo,
  } : emptyCurrent;

  // Helper to handle auth errors
  const handleAuthError = useCallback((err: unknown) => {
    if (err instanceof AuthExpiredError) {
      logout();
      return true;
    }
    return false;
  }, [logout]);

  // ─── Data Refresh Functions (no user in deps to avoid infinite loop) ───
  const refreshSessions = useCallback(async () => {
    try {
      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 30);
      const to = new Date(today);
      to.setDate(to.getDate() + 60);
      const data = await api.sessions.list(
        from.toISOString().split('T')[0],
        to.toISOString().split('T')[0]
      );
      setSessions(data);
    } catch (e) {
      if (!handleAuthError(e)) console.error('Failed to refresh sessions:', e);
    }
  }, [handleAuthError]);

  const refreshReservations = useCallback(async () => {
    try {
      const role = userRoleRef.current;
      const userId = userIdRef.current;
      if (!userId) return;
      if (role === 'admin') {
        const data = await api.reservations.list();
        setReservations(data);
      } else {
        const data = await api.reservations.list({ memberId: userId });
        setReservations(data);
      }
    } catch (e) {
      if (!handleAuthError(e)) console.error('Failed to refresh reservations:', e);
    }
  }, [handleAuthError]);

  const refreshPasses = useCallback(async () => {
    try {
      const data = await api.passes.list();
      setMemberPasses(data);
      const products = await api.passProducts.list();
      setPassProducts(products);
    } catch (e) {
      if (!handleAuthError(e)) console.error('Failed to refresh passes:', e);
    }
  }, [handleAuthError]);

  const refreshNotices = useCallback(async () => {
    try {
      const data = await api.notices.list();
      setNotices(data);
    } catch (e) {
      if (!handleAuthError(e)) console.error('Failed to refresh notices:', e);
    }
  }, [handleAuthError]);

  const refreshMembers = useCallback(async () => {
    if (userRoleRef.current !== 'admin') return;
    try {
      const data = await api.members.list();
      setMembers(data);
    } catch (e) {
      if (!handleAuthError(e)) console.error('Failed to refresh members:', e);
    }
  }, [handleAuthError]);

  // PR-A: 세션 태그 마스터 로드. 회원도 태그 라벨/색상이 필요하므로 호출.
  // 어드민은 비활성 태그까지 보고 관리할 수 있도록 includeInactive=1.
  const refreshSessionTags = useCallback(async () => {
    try {
      const isAdmin = userRoleRef.current === 'admin';
      const data = await api.tags.list(isAdmin);
      const tags: SessionTag[] = (data?.tags ?? []).map((t: SessionTagDto) => ({
        id: t.id,
        label: t.label,
        color: t.color,
        icon: t.icon,
        displayOrder: t.displayOrder,
        isActive: t.isActive,
        updatedAt: t.updatedAt,
      }));
      setSessionTags(tags);
    } catch (e) {
      if (!handleAuthError(e)) console.error('Failed to refresh tags:', e);
    }
  }, [handleAuthError]);

  // PR-D1: 정정 요청 로드. 회원은 본인 요청만, 관리자는 전체(pending 우선).
  const refreshCorrectionRequests = useCallback(async () => {
    try {
      const userId = userIdRef.current;
      if (!userId) return;
      const data = await api.correctionRequests.list();
      setCorrectionRequests(data?.requests ?? []);
    } catch (e) {
      if (!handleAuthError(e)) console.error('Failed to refresh correction requests:', e);
    }
  }, [handleAuthError]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        refreshSessions(),
        refreshReservations(),
        refreshPasses(),
        refreshNotices(),
        refreshMembers(),
        refreshSessionTags(),
        refreshCorrectionRequests(),
      ]);
    } catch (e) {
      console.error('Failed to refresh data:', e);
    } finally {
      setLoading(false);
    }
  }, [refreshSessions, refreshReservations, refreshPasses, refreshNotices, refreshMembers, refreshSessionTags, refreshCorrectionRequests]);

  // Initial data load — run once per user login
  useEffect(() => {
    if (!user) {
      loadedRef.current = false;
      return;
    }
    if (loadedRef.current && userIdRef.current === user.id) return;
    loadedRef.current = true;
    refreshAll();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Reservation Actions ───
  // PR-C2: 서버가 정원+오버부킹 슬롯이 모두 차면 자동으로 대기열에 등록하고
  // 202 + { autoWaitlisted: true } 응답을 보낸다. UI 가 그 정보를 알 수
  // 있도록 단순 boolean 대신 결과 객체를 반환한다. 호출 측은 .ok 만
  // 봐도 동작하고, 자동 대기 분기를 보고 싶으면 .autoWaitlisted 를 본다.
  const makeReservation = useCallback(async (sessionId: string, memberId?: string): Promise<{
    ok: boolean;
    autoWaitlisted?: boolean;
    usedOverbookSlot?: boolean;
    position?: number;
    message?: string;
  }> => {
    try {
      const res = await api.reservations.create(sessionId, memberId);
      // 대기/예약 둘 다 sessions/reservations 수치가 변하므로 모두 새로고침.
      // waitlist 카운트는 sessions GET 응답의 waitlist_count 에 포함됨.
      await Promise.all([refreshSessions(), refreshReservations(), refreshPasses()]);
      return {
        ok: true,
        autoWaitlisted: !!res?.autoWaitlisted,
        usedOverbookSlot: !!res?.usedOverbookSlot,
        position: res?.position,
        message: res?.message,
      };
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return { ok: false };
    }
  }, [refreshSessions, refreshReservations, refreshPasses, handleAuthError]);

  const cancelReservation = useCallback(async (reservationId: string) => {
    try {
      await api.reservations.updateStatus(reservationId, 'cancelled');
      await Promise.all([refreshSessions(), refreshReservations(), refreshPasses()]);
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
    }
  }, [refreshSessions, refreshReservations, refreshPasses, handleAuthError]);

  const updateReservationStatus = useCallback(async (reservationId: string, status: ReservationStatus) => {
    try {
      await api.reservations.updateStatus(reservationId, status);
      await refreshReservations();
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
    }
  }, [refreshReservations, handleAuthError]);

  // ─── Waitlist ───
  const joinWaitlist = useCallback(async (sessionId: string) => {
    try {
      await api.waitlist.join(sessionId);
      await refreshSessions();
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
    }
  }, [refreshSessions, handleAuthError]);

  const leaveWaitlist = useCallback(async (entryId: string) => {
    try {
      await api.waitlist.cancel(entryId);
      await refreshSessions();
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
    }
  }, [refreshSessions, handleAuthError]);

  // ─── Sessions ───
  const createSession = useCallback(async (data: Omit<Session, 'id' | 'currentReservations' | 'waitlistCount' | 'status'>) => {
    try {
      await api.sessions.create(data);
      await refreshSessions();
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
    }
  }, [refreshSessions, handleAuthError]);

  const updateSession = useCallback(async (sessionId: string, data: Partial<Session>) => {
    try {
      await api.sessions.update(sessionId, data);
      await refreshSessions();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshSessions, handleAuthError]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await api.sessions.delete(sessionId);
      await Promise.all([refreshSessions(), refreshReservations()]);
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
    }
  }, [refreshSessions, refreshReservations, handleAuthError]);

  // ─── Notices ───
  const createNotice = useCallback(async (data: { title: string; content: string; targetSessions?: string[] }) => {
    try {
      await api.notices.create(data);
      await refreshNotices();
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
    }
  }, [refreshNotices, handleAuthError]);

  const deleteNotice = useCallback(async (noticeId: string) => {
    try {
      await api.notices.delete(noticeId);
      await refreshNotices();
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
    }
  }, [refreshNotices, handleAuthError]);

  const markNoticeRead = useCallback(async (noticeId: string) => {
    try {
      await api.notices.markRead(noticeId);
      await refreshNotices();
    } catch (e: any) {
      if (!handleAuthError(e)) console.error(e);
    }
  }, [refreshNotices, handleAuthError]);

  // ─── Members ───
  const addMember = useCallback(async (data: Omit<Member, 'id'>) => {
    try {
      const result = await api.members.create({
        name: data.name,
        phone: data.phone,
        email: data.email,
        memo: data.memo,
      });
      await refreshMembers();
      return result;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return null;
    }
  }, [refreshMembers, handleAuthError]);

  // PR-5: Reset a member's password. Returns the temp password to display
  // once to the admin (it is never persisted in plaintext).
  const resetMemberPassword = useCallback(async (memberId: string) => {
    try {
      const result = await api.members.resetPassword(memberId);
      return { tempPassword: result.tempPassword, memberName: result.memberName };
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return null;
    }
  }, [handleAuthError]);

  // PR-5: Hard-delete a member. Server refuses if any history exists, in
  // which case the admin should call setMemberActive(false) instead.
  const deleteMember = useCallback(async (memberId: string) => {
    try {
      await api.members.delete(memberId);
      await refreshMembers();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshMembers, handleAuthError]);

  // PR-5: Toggle a member's active flag. Deactivation revokes all sessions.
  const setMemberActive = useCallback(async (memberId: string, active: boolean) => {
    try {
      await api.members.setActive(memberId, active);
      await refreshMembers();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshMembers, handleAuthError]);

  // PR-5: Promote/demote between admin and member.
  const setMemberRole = useCallback(async (memberId: string, role: 'admin' | 'member') => {
    try {
      await api.members.setRole(memberId, role);
      await refreshMembers();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshMembers, handleAuthError]);

  // ─── Passes ───
  const issueMemberPass = useCallback(async (memberId: string, productId: string, opts?: any) => {
    try {
      const result = await api.passes.issue({ memberId, productId, ...(opts || {}) });
      await refreshPasses();
      return result;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return null;
    }
  }, [refreshPasses, handleAuthError]);

  const pauseMemberPass = useCallback(async (passId: string) => {
    try {
      await api.passes.updateStatus(passId, 'pause');
      await refreshPasses();
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
    }
  }, [refreshPasses, handleAuthError]);

  const resumeMemberPass = useCallback(async (passId: string) => {
    try {
      await api.passes.updateStatus(passId, 'resume');
      await refreshPasses();
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
    }
  }, [refreshPasses, handleAuthError]);

  const refundMemberPass = useCallback(async (
    passId: string,
    params: { cancelReason: string; cancelAmount?: number; skipToss?: boolean }
  ): Promise<boolean> => {
    try {
      await api.passes.refund(passId, params);
      await refreshPasses();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshPasses, handleAuthError]);

  const extendMemberPass = useCallback(async (passId: string, params: { days?: number; expiryDate?: string }) => {
    try {
      await api.passes.extend(passId, params);
      await refreshPasses();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshPasses, handleAuthError]);

  const adjustMemberPass = useCallback(async (passId: string, params: { totalCount?: number; remainingCount?: number }) => {
    try {
      await api.passes.adjust(passId, params);
      await refreshPasses();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshPasses, handleAuthError]);

  const setMemberPassPayment = useCallback(async (passId: string, params: any) => {
    try {
      await api.passes.setPayment(passId, params);
      await refreshPasses();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshPasses, handleAuthError]);

  const setMemberPassMemo = useCallback(async (passId: string, adminMemo: string) => {
    try {
      await api.passes.setMemo(passId, adminMemo);
      await refreshPasses();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshPasses, handleAuthError]);

  // ─── Pass products (catalog admin) ───
  const createPassProduct = useCallback(async (data: any) => {
    try {
      const result = await api.passProducts.create(data);
      await refreshPasses();
      return result;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return null;
    }
  }, [refreshPasses, handleAuthError]);

  const updatePassProduct = useCallback(async (id: string, data: any) => {
    try {
      await api.passProducts.update(id, data);
      await refreshPasses();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshPasses, handleAuthError]);

  const deactivatePassProduct = useCallback(async (id: string) => {
    try {
      await api.passProducts.delete(id, false);
      await refreshPasses();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshPasses, handleAuthError]);

  const deletePassProduct = useCallback(async (id: string, hard = false) => {
    try {
      await api.passProducts.delete(id, hard);
      await refreshPasses();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshPasses, handleAuthError]);

  // ─── PR-D1: Correction request actions ───
  const createCorrectionRequest = useCallback(async (data: { reservationId: string; reasonCode: string; detail?: string }) => {
    try {
      await api.correctionRequests.create(data);
      await refreshCorrectionRequests();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshCorrectionRequests, handleAuthError]);

  const withdrawCorrectionRequest = useCallback(async (id: string) => {
    try {
      await api.correctionRequests.withdraw(id);
      await refreshCorrectionRequests();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshCorrectionRequests, handleAuthError]);

  const approveCorrectionRequest = useCallback(async (
    id: string,
    params?: { targetStatus?: 'reserved' | 'attended' | 'noshow' | 'cancelled'; note?: string }
  ) => {
    try {
      await api.correctionRequests.approve(id, params);
      // 승인 시 reservations / passes 도 같이 갱신
      await Promise.all([
        refreshCorrectionRequests(),
        refreshReservations(),
        refreshPasses(),
        refreshSessions(),
      ]);
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshCorrectionRequests, refreshReservations, refreshPasses, refreshSessions, handleAuthError]);

  const rejectCorrectionRequest = useCallback(async (id: string, note: string) => {
    try {
      await api.correctionRequests.reject(id, note);
      await refreshCorrectionRequests();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshCorrectionRequests, handleAuthError]);

  // ─── PR-D1: 관리자 — 예약자 강제 추가 + 노쇼 일괄 ───
  const forceAddReservation = useCallback(async (params: {
    sessionId: string;
    memberId: string;
    force?: boolean;
    skipPass?: boolean;
    initialStatus?: 'reserved' | 'attended';
  }) => {
    try {
      const res = await api.reservations.forceAdd(params);
      await Promise.all([refreshSessions(), refreshReservations(), refreshPasses()]);
      return { ok: true, status: res?.status };
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return { ok: false };
    }
  }, [refreshSessions, refreshReservations, refreshPasses, handleAuthError]);

  const bulkMarkNoshow = useCallback(async (sessionId: string) => {
    try {
      const res = await api.reservations.bulkNoshow(sessionId);
      await Promise.all([refreshSessions(), refreshReservations()]);
      return res?.affected ?? 0;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return 0;
    }
  }, [refreshSessions, refreshReservations, handleAuthError]);

  // ─── PR-A: Session tag CRUD actions (admin only) ───
  const createSessionTag = useCallback(async (data: {
    id: string; label: string; color?: string; icon?: string; displayOrder?: number;
  }) => {
    try {
      await api.tags.create(data);
      await refreshSessionTags();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshSessionTags, handleAuthError]);

  const updateSessionTag = useCallback(async (data: {
    id: string; label?: string; color?: string | null; icon?: string | null;
    displayOrder?: number; isActive?: boolean;
  }) => {
    try {
      await api.tags.update(data);
      await refreshSessionTags();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshSessionTags, handleAuthError]);

  const deleteSessionTag = useCallback(async (id: string) => {
    try {
      await api.tags.delete(id);
      await refreshSessionTags();
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
    }
  }, [refreshSessionTags, handleAuthError]);

  const value = {
    sessions, members, memberPasses, reservations, waitlistEntries, notices, passProducts, sessionTags, correctionRequests, currentMember, loading,
    refreshSessions, refreshReservations, refreshPasses, refreshNotices, refreshMembers, refreshSessionTags, refreshCorrectionRequests, refreshAll,
    makeReservation, cancelReservation, updateReservationStatus,
    joinWaitlist, leaveWaitlist,
    createSession, updateSession, deleteSession,
    createNotice, deleteNotice, markNoticeRead,
    addMember,
    resetMemberPassword, deleteMember, setMemberActive, setMemberRole,
    issueMemberPass, pauseMemberPass, resumeMemberPass, refundMemberPass,
    extendMemberPass, adjustMemberPass, setMemberPassPayment, setMemberPassMemo,
    createPassProduct, updatePassProduct, deactivatePassProduct, deletePassProduct,
    createSessionTag, updateSessionTag, deleteSessionTag,
    createCorrectionRequest, withdrawCorrectionRequest, approveCorrectionRequest, rejectCorrectionRequest,
    forceAddReservation, bulkMarkNoshow,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
