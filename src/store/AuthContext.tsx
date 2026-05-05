'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { api, AuthExpiredError } from '@/lib/api';

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: 'admin' | 'member';
  joinDate: string;
  isActive: boolean;
  memo?: string;
  /**
   * Set when the user signed in for the first time on a seeded admin account
   * (or after an admin reset their password). The UI must force a password
   * change before letting them do anything else.
   */
  mustChangePassword?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (phone: string, password: string) => Promise<boolean>;
  register: (data: { name: string; phone: string; password: string; email?: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  /** Clear the must_change_password flag locally after a successful change. */
  acknowledgePasswordChange: () => void;
}

const AuthContext = createContext<(AuthState & AuthActions) | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  // Check existing session on mount — run only once
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      // Try /api/auth/me — works with either the HTTP-only cookie or the
      // localStorage token. This lets server-side login (cookie only) work too.
      // The endpoint returns 200 with { authenticated: false } when there is
      // no session, so the browser console stays quiet for public visitors.
      try {
        const userData = await api.auth.me();
        if (userData && (userData as any).id) {
          setUser(userData);
        } else {
          // Not authenticated — clear any stale localStorage silently.
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const login = useCallback(async (phone: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      const result = await api.auth.login(phone, password);
      // Auth token is stored as httpOnly cookie by the server.
      // We only cache the user profile (non-sensitive) in localStorage for fast hydration.
      localStorage.setItem('user', JSON.stringify(result.member));
      setUser(result.member);
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  const register = useCallback(async (data: { name: string; phone: string; password: string; email?: string }): Promise<boolean> => {
    setError(null);
    try {
      const result = await api.auth.register(data);
      // Auth token is stored as httpOnly cookie by the server.
      localStorage.setItem('user', JSON.stringify(result.member));
      setUser(result.member);
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const acknowledgePasswordChange = useCallback(() => {
    setUser(prev => (prev ? { ...prev, mustChangePassword: false } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, error, login, register, logout, clearError, acknowledgePasswordChange }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
