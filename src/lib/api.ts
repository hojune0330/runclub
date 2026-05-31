// API client helper - all frontend API calls go through here

const BASE = '/api';

class AuthExpiredError extends Error {
  constructor() {
    super('인증이 만료되었습니다');
    this.name = 'AuthExpiredError';
  }
}

function isAuthExpiredResponse(status: number, data: any): boolean {
  if (status !== 401) return false;
  const message = String(data?.error || '');
  // Only true auth/session failures should force a logout. Other 401 responses
  // such as wrong login password or profile re-auth mismatch must surface their
  // own message instead of being mislabeled as "인증 만료".
  return !message || message.includes('인증이 필요') || message.includes('인증이 만료');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Authentication is handled via httpOnly cookies only.
  // We intentionally do NOT read tokens from localStorage to avoid XSS token theft.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (err) {
    throw new Error('네트워크 오류가 발생했습니다');
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      if (res.status === 401) throw new AuthExpiredError();
      throw new Error(`요청 실패 (${res.status})`);
    }
    return {} as T;
  }

  if (!res.ok) {
    if (isAuthExpiredResponse(res.status, data)) {
      throw new AuthExpiredError();
    }
    throw new Error(data.error || `요청에 실패했습니다 (${res.status})`);
  }

  return data;
}

export { AuthExpiredError };

export interface PasswordResetRequestDto {
  id: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  memberRole: 'member' | 'admin';
  memberIsActive: boolean;
  requestName: string;
  requestPhone: string;
  requesterNote: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
}

export interface MemberSheetMetadata {
  sheetManagerMemo: string | null;
  sheetTag: string | null;
  sheetMemberGrade: string | null;
  sheetAcquisitionSource: string | null;
  sheetNextContactDate: string | null;
  sheetAssignedManager: string | null;
}

export interface MemberSheetImportChange {
  rowNumber: number;
  memberId: string;
  memberName: string;
  phone: string;
  before: MemberSheetMetadata;
  after: MemberSheetMetadata;
  changedFields: Array<keyof MemberSheetMetadata>;
  coreWarnings: string[];
}

export interface MemberSheetImportWarning {
  rowNumber: number;
  level: 'warning' | 'blocked';
  message: string;
}

export interface MemberSheetImportPreview {
  enabled: boolean;
  generatedAt: string;
  stats: {
    sheetRows: number;
    matchedRows: number;
    changes: number;
    blockedRows: number;
    warnings: number;
  };
  changes: MemberSheetImportChange[];
  warnings: MemberSheetImportWarning[];
  applied?: number;
}

// ─── Auth ───
export const api = {
  auth: {
    login: (phone: string, password: string) =>
      request<{ member: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      }),
    register: (data: { name: string; phone: string; password: string; email?: string }) =>
      request<{ member: any }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: () => request<any>('/auth/me'),
    logout: () => request<any>('/auth/logout', { method: 'POST' }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<any>('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    requestPasswordReset: (data: { name: string; phone: string; note?: string }) =>
      request<{ success: boolean; message: string }>('/auth/password-reset-requests', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  passwordResetRequests: {
    list: (params?: { status?: 'pending' | 'approved' | 'rejected'; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString() ? `?${q.toString()}` : '';
      return request<{ requests: PasswordResetRequestDto[]; pendingCount: number }>(`/auth/password-reset-requests${qs}`);
    },
    approve: (id: string, note?: string) =>
      request<{ success: boolean; tempPassword: string; memberName: string; message: string }>(
        '/auth/password-reset-requests',
        { method: 'PATCH', body: JSON.stringify({ id, action: 'approve', note }) }
      ),
    reject: (id: string, note?: string) =>
      request<{ success: boolean }>('/auth/password-reset-requests', {
        method: 'PATCH',
        body: JSON.stringify({ id, action: 'reject', note }),
      }),
  },

  sessions: {
    list: (from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return request<any[]>(`/sessions?${params}`);
    },
    create: (data: any) =>
      request<{ id: string }>('/sessions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<{ success: true }>(`/sessions?id=${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<any>(`/sessions?id=${id}`, { method: 'DELETE' }),
  },

  reservations: {
    list: (params?: { memberId?: string; sessionId?: string }) => {
      const qs = new URLSearchParams();
      if (params?.memberId) qs.set('memberId', params.memberId);
      if (params?.sessionId) qs.set('sessionId', params.sessionId);
      return request<any[]>(`/reservations?${qs}`);
    },
    // PR-C2: 응답에 autoWaitlisted 필드가 포함될 수 있다.
    //   - 정상 예약(201): { id, success, usedOverbookSlot?, effectiveCapacity?, maxCapacity? }
    //   - 자동 대기 전환(202): { autoWaitlisted: true, waitlistId, position, message }
    create: (sessionId: string, memberId?: string) =>
      request<{
        id?: string;
        success?: boolean;
        usedOverbookSlot?: boolean;
        effectiveCapacity?: number;
        maxCapacity?: number;
        autoWaitlisted?: boolean;
        waitlistId?: string;
        position?: number;
        message?: string;
      }>('/reservations', {
        method: 'POST',
        body: JSON.stringify({ sessionId, memberId }),
      }),
    // PR-D1: 관리자 강제 추가 — 정원 초과/수강권 미차감/즉시 출석 가능.
    forceAdd: (params: {
      sessionId: string;
      memberId: string;
      force?: boolean;
      skipPass?: boolean;
      initialStatus?: 'reserved' | 'attended';
    }) =>
      request<{
        id: string;
        success: boolean;
        status: 'reserved' | 'attended';
        forcedByAdmin: boolean;
      }>('/reservations', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    updateStatus: (reservationId: string, status: string) =>
      request<{
        success: boolean;
        previousStatus?: string;
        status?: string;
        passDelta?: number;
        noop?: boolean;
      }>('/reservations', {
        method: 'PUT',
        body: JSON.stringify({ reservationId, status }),
      }),
    // PR-D1: 세션의 남은 reserved 전원 → noshow.
    bulkNoshow: (sessionId: string) =>
      request<{ success: boolean; affected: number }>('/reservations/bulk-noshow', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }),
  },

  // PR-D1: 회원 정정 요청 (correction requests).
  // 회원: 본인 요청 생성/조회/철회
  // 관리자: 전체 인박스 + 승인/거절
  correctionRequests: {
    list: (params?: { status?: 'pending' | 'approved' | 'rejected' | 'withdrawn'; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString() ? `?${q.toString()}` : '';
      return request<{
        requests: Array<{
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
        }>;
        pendingCount: number;
      }>(`/correction-requests${qs}`);
    },
    create: (data: { reservationId: string; reasonCode: string; detail?: string }) =>
      request<{ id: string; success: boolean }>('/correction-requests', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    approve: (id: string, params?: { targetStatus?: 'reserved' | 'attended' | 'noshow' | 'cancelled'; note?: string }) =>
      request<{ success: boolean; previousStatus?: string; status?: string; passDelta?: number; noop?: boolean }>(
        '/correction-requests',
        {
          method: 'PATCH',
          body: JSON.stringify({ id, action: 'approve', ...(params || {}) }),
        }
      ),
    reject: (id: string, note: string) =>
      request<{ success: boolean }>('/correction-requests', {
        method: 'PATCH',
        body: JSON.stringify({ id, action: 'reject', note }),
      }),
    withdraw: (id: string) =>
      request<{ success: boolean }>('/correction-requests', {
        method: 'PATCH',
        body: JSON.stringify({ id, action: 'withdraw' }),
      }),
  },

  members: {
    list: () => request<any[]>('/members'),
    create: (data: { name: string; phone: string; email?: string; memo?: string }) =>
      request<any>('/members', { method: 'POST', body: JSON.stringify(data) }),
    update: (data: any) =>
      request<any>('/members', { method: 'PUT', body: JSON.stringify(data) }),
    // PR-5: per-member admin actions
    resetPassword: (id: string) =>
      request<{ success: boolean; tempPassword: string; message: string; memberName: string }>(
        `/members/${encodeURIComponent(id)}/reset-password`,
        { method: 'POST' }
      ),
    delete: (id: string) =>
      request<any>(`/members/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    setActive: (id: string, active: boolean) =>
      request<any>(`/members/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: active ? 'activate' : 'deactivate' }),
      }),
    setRole: (id: string, role: 'admin' | 'member') =>
      request<{ success: boolean; id: string; role: string; message?: string }>(
        `/members/${encodeURIComponent(id)}/role`,
        { method: 'PATCH', body: JSON.stringify({ role }) }
      ),
  },

  sheetMemberImport: {
    preview: () => request<MemberSheetImportPreview>('/sheets/members/import'),
    apply: () => request<MemberSheetImportPreview & { applied: number }>('/sheets/members/import', { method: 'POST' }),
  },

  audit: {
    list: (params?: {
      limit?: number;
      before?: string;
      adminId?: string;
      targetType?: string;
      targetId?: string;
      action?: string;
    }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.before) q.set('before', params.before);
      if (params?.adminId) q.set('adminId', params.adminId);
      if (params?.targetType) q.set('targetType', params.targetType);
      if (params?.targetId) q.set('targetId', params.targetId);
      if (params?.action) q.set('action', params.action);
      const qs = q.toString() ? `?${q.toString()}` : '';
      return request<{ entries: any[]; nextBefore: string | null; limit: number }>(
        `/admin/audit-log${qs}`
      );
    },
  },

  passes: {
    list: (memberId?: string) => {
      const qs = memberId ? `?memberId=${memberId}` : '';
      return request<any[]>(`/passes${qs}`);
    },
    // PR-6: rich issue payload — payment envelope is optional.
    issue: (data: {
      memberId: string;
      productId: string;
      paymentStatus?: 'unpaid' | 'paid' | 'refunded' | 'partial_refund';
      paymentMethod?: string;
      paymentAmount?: number;
      discountAmount?: number;
      discountReason?: string;
      adminMemo?: string;
      startDate?: string;
      transactionId?: string;
    }) =>
      request<{ id: string; success: boolean }>('/passes', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateStatus: (passId: string, action: 'pause' | 'resume') =>
      request<any>('/passes', { method: 'PUT', body: JSON.stringify({ passId, action }) }),
    // PR-6 STEP 5: refund with reason + optional partial amount.
    // Server will call Toss /v1/payments/{paymentKey}/cancel automatically
    // when the pass was paid via Toss; pass `skipToss: true` for manual passes.
    refund: (passId: string, params: { cancelReason: string; cancelAmount?: number; skipToss?: boolean }) =>
      request<any>('/passes', {
        method: 'PUT',
        body: JSON.stringify({ passId, action: 'refund', ...params }),
      }),
    // PR-6: extend expiry by relative days OR absolute YYYY-MM-DD.
    extend: (passId: string, params: { days?: number; expiryDate?: string }) =>
      request<any>('/passes', {
        method: 'PUT',
        body: JSON.stringify({ passId, action: 'extend', ...params }),
      }),
    // PR-6: adjust count totals on a 횟수권.
    adjust: (passId: string, params: { totalCount?: number; remainingCount?: number }) =>
      request<any>('/passes', {
        method: 'PUT',
        body: JSON.stringify({ passId, action: 'adjust', ...params }),
      }),
    // PR-6: change payment fields on an issued pass.
    setPayment: (passId: string, params: {
      paymentStatus: 'unpaid' | 'paid' | 'refunded' | 'partial_refund';
      paymentMethod?: string;
      paymentAmount?: number;
      transactionId?: string;
    }) =>
      request<any>('/passes', {
        method: 'PUT',
        body: JSON.stringify({ passId, action: 'payment', ...params }),
      }),
    setMemo: (passId: string, adminMemo: string) =>
      request<any>('/passes', {
        method: 'PUT',
        body: JSON.stringify({ passId, action: 'memo', adminMemo }),
      }),
  },

  passProducts: {
    list: (params?: { includeInactive?: boolean }) => {
      const qs = params?.includeInactive === false ? '?includeInactive=false' : '';
      return request<any[]>(`/pass-products${qs}`);
    },
    create: (data: any) =>
      request<{ id: string; success: boolean }>('/pass-products', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request<any>('/pass-products', {
        method: 'PUT',
        body: JSON.stringify({ id, ...data }),
      }),
    delete: (id: string, hard = false) =>
      request<any>(`/pass-products?id=${encodeURIComponent(id)}${hard ? '&hard=true' : ''}`, {
        method: 'DELETE',
      }),
  },

  payments: {
    // PR-6 + PR-DISCOUNT: member-initiated checkout (Toss) with discount support.
    checkout: (productId: string, opts?: { couponCode?: string; useMileage?: number }) =>
      request<
        | {
            // PR-C3: 0원 무료 패스는 Toss를 거치지 않고 즉시 발급된다.
            free: true;
            orderId: string;
            passId: string;
            orderName: string;
            amount: 0;
          }
        | {
            free: false;
            orderId: string;
            orderName: string;
            amount: number;
            originalAmount?: number;
            discountLines?: Array<{
              type: 'membership' | 'promotion' | 'coupon' | 'mileage';
              label: string;
              amount: number;
              refId?: string;
            }>;
            customerName: string;
            customerEmail?: string;
            customerMobilePhone?: string;
            tossClientKey: string | null;
            successUrl: string;
            failUrl: string;
          }
      >('/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ productId, ...opts }),
      }),
    confirm: (params: { paymentKey: string; orderId: string; amount: number }) =>
      request<{ success: boolean; passId: string; orderId: string; amount: number; method: string; alreadyConfirmed?: boolean }>(
        '/payments/confirm',
        { method: 'POST', body: JSON.stringify(params) }
      ),
    // PR-6 STEP 4: admin payment monitoring.
    list: (params?: { status?: string; from?: string; to?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.from) q.set('from', params.from);
      if (params?.to) q.set('to', params.to);
      if (params?.limit) q.set('limit', String(params.limit));
      return request<{
        items: Array<{
          orderId: string; memberId: string; memberName: string; memberPhone: string | null;
          productId: string; productName: string; amount: number;
          status: 'pending' | 'confirmed' | 'failed' | 'expired';
          method: string | null; paymentKey: string | null; passId: string | null;
          passPaymentStatus: string | null; errorMessage: string | null;
          confirmedAt: string | null; createdAt: string; updatedAt: string;
        }>;
        count: number; limit: number;
      }>(`/payments/list?${q.toString()}`);
    },
    stats: () =>
      request<{
        today: { count: number; amount: number };
        month: { count: number; amount: number };
        pendingCount: number; failed7d: number; total7d: number; failureRate: number;
      }>('/payments/list?stats=true'),
  },

  notices: {
    // EXT-I6: Server now returns a paged shape `{ notices, nextBefore, limit }`.
    // The client unwraps it so callers continue to receive a plain array; if
    // they need pagination later, switch them to `listPaged`.
    list: async (params?: { limit?: number; before?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.before) q.set('before', params.before);
      const qs = q.toString() ? `?${q.toString()}` : '';
      const res = await request<any>(`/notices${qs}`);
      // Backwards compat: tolerate the old array-shaped response, too.
      if (Array.isArray(res)) return res;
      return Array.isArray(res?.notices) ? res.notices : [];
    },
    listPaged: (params?: { limit?: number; before?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.before) q.set('before', params.before);
      const qs = q.toString() ? `?${q.toString()}` : '';
      return request<{ notices: any[]; nextBefore: string | null; limit: number }>(`/notices${qs}`);
    },
    create: (data: { title: string; content: string; targetSessions?: string[] }) =>
      request<any>('/notices', { method: 'POST', body: JSON.stringify(data) }),
    markRead: (noticeId: string) =>
      request<any>('/notices', { method: 'PUT', body: JSON.stringify({ noticeId, action: 'read' }) }),
    delete: (id: string) =>
      request<any>(`/notices?id=${id}`, { method: 'DELETE' }),
  },

  waitlist: {
    list: (sessionId?: string) => {
      const qs = sessionId ? `?sessionId=${sessionId}` : '';
      return request<any[]>(`/waitlist${qs}`);
    },
    join: (sessionId: string) =>
      request<any>('/waitlist', { method: 'POST', body: JSON.stringify({ sessionId }) }),
    cancel: (waitlistId: string) =>
      request<any>('/waitlist', { method: 'PUT', body: JSON.stringify({ waitlistId }) }),
  },

  qr: {
    generate: (sessionId: string) =>
      request<{ token: string; expiresAt: string; qrDataUrl: string; checkinUrl?: string; ttlSec?: number }>('/qr/generate', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }),
    verify: (sessionId: string, token: string) =>
      request<{ success: boolean; message: string; sessionName: string; sessionTime: string; alreadyAttended?: boolean; walkIn?: boolean; passDelta?: number }>('/qr/verify', {
        method: 'POST',
        body: JSON.stringify({ sessionId, token }),
      }),
  },

  attendance: {
    fieldCheckIn: (data: {
      sessionId: string;
      name: string;
      phone: string;
      allowWalkIn?: boolean;
      skipPass?: boolean;
    }) =>
      request<{
        success: boolean;
        alreadyAttended?: boolean;
        source: string;
        passDelta: number;
        message: string;
        member: { id: string; name: string; phone: string };
        session: { id: string; name: string; date: string; startTime: string };
        reservationId: string;
        checkedInAt: string;
      }>('/attendance/checkin', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // ─── PR-A: Session tag master CRUD ───
  // 어드민이 세션/수강권 매칭에 사용할 태그를 코드 변경 없이 추가/수정/삭제.
  // GET 은 회원도 호출 가능 (회원 UI 가 태그 라벨/색상을 표시하기 위함).
  // POST/PUT/DELETE 는 서버에서 어드민으로 강제.
  tags: {
    list: (includeInactive = false) => {
      const qs = includeInactive ? '?includeInactive=1' : '';
      return request<{ tags: SessionTagDto[] }>(`/tags${qs}`);
    },
    create: (data: {
      id: string;
      label: string;
      color?: string;
      icon?: string;
      displayOrder?: number;
    }) =>
      request<{ tag: SessionTagDto }>('/tags', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (data: {
      id: string;
      label?: string;
      color?: string | null;
      icon?: string | null;
      displayOrder?: number;
      isActive?: boolean;
    }) =>
      request<{ tag: SessionTagDto }>('/tags', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/tags?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },

  seed: () => request<any>('/seed', { method: 'POST' }),
};

// ─── PR-A: Tag DTO (camelCase as returned by /api/tags) ───
export interface SessionTagDto {
  id: string;
  label: string;
  color?: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
  updatedAt?: string;
}
