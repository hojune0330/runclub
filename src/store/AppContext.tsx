'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import type { Session, Member, MemberPass, Reservation, WaitlistEntry, Notice, PassProduct, ReservationStatus } from '@/types';
import { api, AuthExpiredError } from '@/lib/api';
import { useAuth } from './AuthContext';

interface AppState {
  sessions: Session[];
  members: Member[];
  memberPasses: MemberPass[];
  reservations: Reservation[];
  waitlistEntries: WaitlistEntry[];
  notices: Notice[];
  passProducts: PassProduct[];
  currentMember: Member;
  loading: boolean;
}

interface AppActions {
  refreshSessions: () => Promise<void>;
  refreshReservations: () => Promise<void>;
  refreshPasses: () => Promise<void>;
  refreshNotices: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshAll: () => Promise<void>;

  makeReservation: (sessionId: string, memberId?: string) => Promise<boolean>;
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
  refundMemberPass: (passId: string) => Promise<void>;
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

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        refreshSessions(),
        refreshReservations(),
        refreshPasses(),
        refreshNotices(),
        refreshMembers(),
      ]);
    } catch (e) {
      console.error('Failed to refresh data:', e);
    } finally {
      setLoading(false);
    }
  }, [refreshSessions, refreshReservations, refreshPasses, refreshNotices, refreshMembers]);

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
  const makeReservation = useCallback(async (sessionId: string, memberId?: string): Promise<boolean> => {
    try {
      await api.reservations.create(sessionId, memberId);
      await Promise.all([refreshSessions(), refreshReservations(), refreshPasses()]);
      return true;
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
      return false;
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

  const refundMemberPass = useCallback(async (passId: string) => {
    try {
      await api.passes.updateStatus(passId, 'refund');
      await refreshPasses();
    } catch (e: any) {
      if (!handleAuthError(e)) alert(e.message);
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

  const value = {
    sessions, members, memberPasses, reservations, waitlistEntries, notices, passProducts, currentMember, loading,
    refreshSessions, refreshReservations, refreshPasses, refreshNotices, refreshMembers, refreshAll,
    makeReservation, cancelReservation, updateReservationStatus,
    joinWaitlist, leaveWaitlist,
    createSession, updateSession, deleteSession,
    createNotice, deleteNotice, markNoticeRead,
    addMember,
    resetMemberPassword, deleteMember, setMemberActive, setMemberRole,
    issueMemberPass, pauseMemberPass, resumeMemberPass, refundMemberPass,
    extendMemberPass, adjustMemberPass, setMemberPassPayment, setMemberPassMemo,
    createPassProduct, updatePassProduct, deactivatePassProduct, deletePassProduct,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
