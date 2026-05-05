'use client';

import { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/AuthContext';
import { validatePassword } from '@/lib/validation';

/**
 * Full-screen blocking dialog shown right after sign-in when the user's
 * `mustChangePassword` flag is set. The user CANNOT use the app until they
 * pick a new password — there's no skip button and the only escape is
 * logout.
 *
 * Triggered for:
 *   - Seeded admin in 'demo' mode (010-0000-0000 / admin).
 *   - Any account whose password was reset by an admin (future feature).
 */
export default function ForcePasswordChange() {
  const { user, logout, acknowledgePasswordChange } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const check = validatePassword(newPassword);
    if (!check.ok) { setError(check.message); return; }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호 확인이 일치하지 않습니다');
      return;
    }
    if (newPassword === currentPassword) {
      setError('새 비밀번호는 현재 비밀번호와 달라야 합니다');
      return;
    }

    setSubmitting(true);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      acknowledgePasswordChange();
    } catch (err: any) {
      setError(err?.message || '비밀번호 변경에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--color-bg-subtle)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl shadow-xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1 className="text-[18px] font-semibold text-[var(--color-text)]">비밀번호 변경 필요</h1>
            <p className="text-[12.5px] text-[var(--color-text-muted)]">
              {user?.name ?? ''}님, 처음 로그인이라 안전을 위해 새 비밀번호를 설정해주세요.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 mt-4">
          <Field label="현재 비밀번호">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full h-11 px-3 pr-11 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-[16px] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center text-[var(--color-text-muted)]"
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>

          <Field
            label="새 비밀번호"
            hint="8자 이상, 영문과 숫자를 모두 포함"
          >
            <input
              type={showPw ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full h-11 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-[16px] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          <Field label="새 비밀번호 확인">
            <input
              type={showPw ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full h-11 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-[16px] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
              autoComplete="new-password"
              required
            />
          </Field>

          {error && (
            <div className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
            className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] text-white font-medium disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-muted)]"
          >
            <KeyRound size={16} />
            {submitting ? '변경 중...' : '비밀번호 변경하고 시작'}
          </button>

          <button
            type="button"
            onClick={() => logout()}
            className="w-full h-10 text-[13px] text-[var(--color-text-muted)] hover:underline"
          >
            로그아웃
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-[var(--color-text)] mb-1">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[11.5px] text-[var(--color-text-muted)] mt-1">{hint}</span>}
    </label>
  );
}
