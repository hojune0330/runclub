// API client helper - all frontend API calls go through here

const BASE = '/api';

class AuthExpiredError extends Error {
  constructor() {
    super('인증이 만료되었습니다');
    this.name = 'AuthExpiredError';
  }
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

  if (res.status === 401) {
    // Don't redirect — let the auth context handle it
    throw new AuthExpiredError();
  }

  // For 403, don't treat as auth error — just return the error message
  let data: any;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new Error(`요청 실패 (${res.status})`);
    }
    return {} as T;
  }

  if (!res.ok) {
    throw new Error(data.error || `요청에 실패했습니다 (${res.status})`);
  }

  return data;
}

export { AuthExpiredError };

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
    create: (sessionId: string, memberId?: string) =>
      request<{ id: string }>('/reservations', {
        method: 'POST',
        body: JSON.stringify({ sessionId, memberId }),
      }),
    updateStatus: (reservationId: string, status: string) =>
      request<any>('/reservations', {
        method: 'PUT',
        body: JSON.stringify({ reservationId, status }),
      }),
  },

  members: {
    list: () => request<any[]>('/members'),
    create: (data: { name: string; phone: string; email?: string; memo?: string }) =>
      request<any>('/members', { method: 'POST', body: JSON.stringify(data) }),
    update: (data: any) =>
      request<any>('/members', { method: 'PUT', body: JSON.stringify(data) }),
  },

  passes: {
    list: (memberId?: string) => {
      const qs = memberId ? `?memberId=${memberId}` : '';
      return request<any[]>(`/passes${qs}`);
    },
    issue: (memberId: string, productId: string) =>
      request<any>('/passes', { method: 'POST', body: JSON.stringify({ memberId, productId }) }),
    updateStatus: (passId: string, action: 'pause' | 'refund' | 'resume') =>
      request<any>('/passes', { method: 'PUT', body: JSON.stringify({ passId, action }) }),
  },

  passProducts: {
    list: () => request<any[]>('/pass-products'),
    create: (data: any) =>
      request<any>('/pass-products', { method: 'POST', body: JSON.stringify(data) }),
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
      request<{ token: string; expiresAt: string; qrDataUrl: string }>('/qr/generate', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }),
    verify: (sessionId: string, token: string) =>
      request<{ success: boolean; message: string; sessionName: string; sessionTime: string }>('/qr/verify', {
        method: 'POST',
        body: JSON.stringify({ sessionId, token }),
      }),
  },

  seed: () => request<any>('/seed', { method: 'POST' }),
};
