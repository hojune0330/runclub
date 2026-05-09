'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/store/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const { login, register, error, clearError } = useAuth();
  const searchParams = useSearchParams();
  const initialMode = searchParams?.get('mode') === 'register' ? 'register' : 'login';
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Sync mode when URL param changes (e.g., user clicks "가입하기" from another page)
  useEffect(() => {
    const param = searchParams?.get('mode');
    if (param === 'register' && mode !== 'register') setMode('register');
    else if (param !== 'register' && mode !== 'login') setMode('login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const formatPhone = (val: string) => {
    const digits = val.replace(/[^0-9]/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSubmitting(true);

    if (mode === 'login') {
      await login(phone, password);
    } else {
      if (!name.trim()) {
        setSubmitting(false);
        return;
      }
      await register({ name: name.trim(), phone, password, email: email || undefined });
    }
    setSubmitting(false);
  };

  const switchMode = () => {
    setMode(prev => (prev === 'login' ? 'register' : 'login'));
    clearError();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-subtle)] px-4">
      <div className="w-full max-w-[400px]">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-md bg-[var(--color-primary)] flex items-center justify-center shadow-sm">
              <span className="text-white text-[18px] font-bold leading-none">R</span>
            </div>
          </div>
          <h1 className="text-[22px] font-bold text-[var(--color-text)] tracking-tight">런클럽 매니저</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-1.5">세션 예약 · 출석 · 수강권 통합 관리</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-[var(--color-border)] rounded-md shadow-sm">
          {/* Tabs */}
          <div className="grid grid-cols-2 border-b border-[var(--color-border)]">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { if (mode !== m) switchMode(); }}
                className={cn(
                  "py-3 text-[14px] font-medium transition-colors",
                  mode === m
                    ? "text-[var(--color-text)] border-b-2 border-[var(--color-primary)] -mb-px"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                )}
              >
                {m === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4">
            {mode === 'register' && (
              <Field label="이름" required>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="홍길동"
                  required
                  className="input"
                />
              </Field>
            )}

            <Field label="휴대폰 번호" required>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                placeholder="010-0000-0000"
                required
                maxLength={13}
                autoComplete="tel"
                className="input"
              />
            </Field>

            {mode === 'register' && (
              <Field label="이메일" hint="선택사항">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="input"
                />
              </Field>
            )}

            <Field label="비밀번호" required>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? '4자 이상 입력' : '비밀번호'}
                  required
                  minLength={4}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>

            {error && (
              <div className="text-[13px] text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] px-3 py-2 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !phone || !password || (mode === 'register' && !name.trim())}
              className={cn(
                "w-full h-11 sm:h-10 text-[14.5px] sm:text-[14px] font-semibold rounded-md transition-colors",
                submitting || !phone || !password || (mode === 'register' && !name.trim())
                  ? "bg-[var(--color-bg-hover)] text-[var(--color-text-disabled)]"
                  : "bg-[var(--color-primary)] text-white active:bg-[var(--color-primary-active)] sm:hover:bg-[var(--color-primary-hover)]"
              )}
            >
              {submitting ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기'}
            </button>
          </form>
        </div>

        {/*
          Demo accounts hint — production 빌드에서는 노출하지 않는다.
          - process.env.NODE_ENV는 빌드 시 정적 치환되므로 production 번들에서는
            아래 블록 자체가 dead code로 제거되어 계정 정보가 새지 않는다.
          - NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=1 로 명시적으로 노출 가능 (스테이징/데모 환경용).
        */}
        {mode === 'login' &&
          (process.env.NODE_ENV !== 'production' ||
            process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === '1') && (
          <details className="mt-4 bg-white border border-[var(--color-border)] rounded-md">
            <summary className="px-4 py-2.5 text-[12.5px] text-[var(--color-text-secondary)] cursor-pointer hover:bg-[var(--color-bg-hover)] rounded-md select-none">
              체험용 계정 보기
            </summary>
            <div className="px-4 pb-3 pt-1 space-y-2 text-[12px] text-[var(--color-text-secondary)] leading-relaxed">
              <div className="flex justify-between gap-3">
                <span className="text-[var(--color-text-muted)]">관리자 (장호준 코치)</span>
                <span className="tabular-nums font-mono text-[11.5px]">010-0000-0000 / admin</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[var(--color-text-muted)]">회원 (강병규)</span>
                <span className="tabular-nums font-mono text-[11.5px]">010-2345-6789 / test1234</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[var(--color-text-muted)]">회원 (안현지)</span>
                <span className="tabular-nums font-mono text-[11.5px]">010-3456-7890 / test1234</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[var(--color-text-muted)]">회원 (정예진)</span>
                <span className="tabular-nums font-mono text-[11.5px]">010-4567-8901 / test1234</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[var(--color-text-muted)]">회원 (김로운)</span>
                <span className="tabular-nums font-mono text-[11.5px]">010-5678-9012 / test1234</span>
              </div>
              <p className="text-[11.5px] text-[var(--color-text-muted)] pt-1 border-t border-[var(--color-border)] mt-2">
                강병규·안현지·정예진은 수강권 보유, 김로운은 수강권 없는 신규 회원입니다.
              </p>
            </div>
          </details>
        )}

        {/* Footer */}
        <p className="text-center text-[12px] text-[var(--color-text-muted)] mt-6">
          © 2026 런클럽 매니저
        </p>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid var(--color-border);
          background: #fff;
          padding: 11px 12px;
          font-size: 16px; /* iOS zoom prevention */
          color: var(--color-text);
          border-radius: 6px;
          transition: border-color 0.12s, box-shadow 0.12s;
        }
        @media (min-width: 640px) {
          .input { font-size: 14px; padding: 9px 12px; border-radius: 4px; }
        }
        .input:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }
        .input::placeholder {
          color: var(--color-text-disabled);
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] text-[var(--color-text-secondary)] font-medium">
          {label}
          {required && <span className="text-[var(--color-danger)] ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[12px] text-[var(--color-text-muted)]">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
