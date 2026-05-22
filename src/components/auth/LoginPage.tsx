'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/store/AuthContext';
import { api } from '@/lib/api';
import { Eye, EyeOff, X } from 'lucide-react';
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
  const submitInFlightRef = useRef(false);
  const [showResetRequest, setShowResetRequest] = useState(false);
  const [resetName, setResetName] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [resetNote, setResetNote] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  // 회원가입 시 약관 동의 — PG 심사 필수 항목.
  // 약관과 개인정보처리방침은 「전자상거래법」 + 「개인정보 보호법」상 필수 동의 대상.
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  const formatPhone = (val: string) => {
    const digits = val.replace(/[^0-9]/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitInFlightRef.current) return;
    clearError();
    submitInFlightRef.current = true;
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(phone, password);
      } else {
        if (!name.trim()) return;
        // 약관 동의 가드 — disabled 버튼이 1차 방어선이지만, 키보드/접근성 우회를
        // 막기 위해 submit 핸들러에서도 한 번 더 확인한다.
        if (!agreeTerms || !agreePrivacy) return;
        await register({ name: name.trim(), phone, password, email: email || undefined });
      }
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(prev => (prev === 'login' ? 'register' : 'login'));
    clearError();
  };

  const openResetRequest = () => {
    setResetName(name.trim());
    setResetPhone(phone);
    setResetNote('');
    setResetMessage(null);
    setResetError(null);
    setShowResetRequest(true);
  };

  const submitResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetSubmitting) return;
    setResetSubmitting(true);
    setResetError(null);
    setResetMessage(null);
    try {
      const res = await api.auth.requestPasswordReset({
        name: resetName.trim(),
        phone: resetPhone,
        note: resetNote.trim() || undefined,
      });
      setResetMessage(res.message || '요청이 접수되었습니다. 관리자가 확인 후 안내드립니다.');
    } catch (err: any) {
      setResetError(err?.message || '요청 접수 중 오류가 발생했습니다');
    } finally {
      setResetSubmitting(false);
    }
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
                  placeholder={mode === 'register' ? '영문+숫자 8자 이상' : '비밀번호'}
                  required
                  minLength={mode === 'register' ? 8 : 4}
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
              <div className="text-[13px] text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] px-3 py-2 rounded space-y-2">
                <p>{error}</p>
                {mode === 'register' && error.includes('이미 가입') && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      clearError();
                    }}
                    className="text-[12.5px] font-medium underline underline-offset-2"
                  >
                    로그인으로 이동
                  </button>
                )}
              </div>
            )}

            {/*
              회원가입 시 약관 동의 — PG 심사 필수 항목.
              - 이용약관, 개인정보처리방침 모두 별도 동의 (묶음 동의 X)
              - 각 약관 텍스트는 새 탭에서 열도록 target="_blank"
            */}
            {mode === 'register' && (
              <div className="space-y-2 pt-1">
                <AgreementCheckbox
                  checked={agreeTerms}
                  onChange={setAgreeTerms}
                  label="이용약관"
                  href="/terms"
                />
                <AgreementCheckbox
                  checked={agreePrivacy}
                  onChange={setAgreePrivacy}
                  label="개인정보처리방침"
                  href="/privacy"
                />
              </div>
            )}

            {mode === 'login' && (
              <div className="flex items-start justify-between gap-3 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] px-3 py-2 text-[12.5px] text-[var(--color-text-secondary)] leading-relaxed">
                <p>
                  비밀번호를 잊었거나 임시 비밀번호 안내가 필요하면 재설정 요청을 남겨주세요.
                </p>
                <button
                  type="button"
                  onClick={openResetRequest}
                  className="shrink-0 font-medium text-[var(--color-primary)] underline underline-offset-2"
                >
                  요청하기
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={
                submitting ||
                !phone ||
                !password ||
                (mode === 'register' && (!name.trim() || !agreeTerms || !agreePrivacy))
              }
              className={cn(
                "w-full h-11 sm:h-10 text-[14.5px] sm:text-[14px] font-semibold rounded-md transition-colors",
                submitting ||
                  !phone ||
                  !password ||
                  (mode === 'register' && (!name.trim() || !agreeTerms || !agreePrivacy))
                  ? "bg-[var(--color-bg-hover)] text-[var(--color-text-disabled)]"
                  : "bg-[var(--color-primary)] text-white active:bg-[var(--color-primary-active)] sm:hover:bg-[var(--color-primary-hover)]"
              )}
            >
              {submitting ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기'}
            </button>
          </form>
        </div>

        {showResetRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-[380px] bg-white border border-[var(--color-border)] rounded-md shadow-lg animate-fade-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
                <div>
                  <h2 className="text-[15px] font-semibold text-[var(--color-text)]">비밀번호 재설정 요청</h2>
                  <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">가입한 이름과 휴대폰 번호를 입력해 주세요.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResetRequest(false)}
                  className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  aria-label="닫기"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={submitResetRequest} className="p-4 space-y-3.5">
                <Field label="이름" required>
                  <input
                    type="text"
                    value={resetName}
                    onChange={e => setResetName(e.target.value)}
                    placeholder="홍길동"
                    required
                    className="input"
                  />
                </Field>
                <Field label="휴대폰 번호" required>
                  <input
                    type="tel"
                    value={resetPhone}
                    onChange={e => setResetPhone(formatPhone(e.target.value))}
                    placeholder="010-0000-0000"
                    required
                    maxLength={13}
                    className="input"
                  />
                </Field>
                <Field label="요청 메모" hint="선택">
                  <textarea
                    value={resetNote}
                    onChange={e => setResetNote(e.target.value)}
                    placeholder="예: 임시 비밀번호를 문자로 안내받고 싶어요"
                    maxLength={300}
                    rows={3}
                    className="input resize-none"
                  />
                </Field>

                <div className="text-[12px] text-[var(--color-text-muted)] leading-relaxed bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] rounded px-3 py-2">
                  보안을 위해 가입 여부는 화면에 표시하지 않습니다. 정보가 확인되면 관리자가 임시 비밀번호를 발급하고, 첫 로그인 시 새 비밀번호 변경이 강제됩니다.
                </div>

                {resetError && (
                  <div className="text-[13px] text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] px-3 py-2 rounded">
                    {resetError}
                  </div>
                )}
                {resetMessage && (
                  <div className="text-[13px] text-[var(--color-success)] bg-[var(--color-success-bg)] border border-[var(--color-success-border)] px-3 py-2 rounded">
                    {resetMessage}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowResetRequest(false)}
                    className="flex-1 h-10 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)]"
                  >
                    닫기
                  </button>
                  <button
                    type="submit"
                    disabled={resetSubmitting || !resetName.trim() || !resetPhone}
                    className={cn(
                      "flex-1 h-10 text-[13px] font-medium rounded transition-colors",
                      resetSubmitting || !resetName.trim() || !resetPhone
                        ? "bg-[var(--color-bg-hover)] text-[var(--color-text-disabled)] cursor-not-allowed"
                        : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                    )}
                  >
                    {resetSubmitting ? '접수 중…' : '요청 접수'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

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

/**
 * AgreementCheckbox — 회원가입 시 약관/개인정보 동의 체크박스.
 *
 * - 체크박스와 라벨 텍스트는 같은 label로 묶여 어디를 클릭해도 토글된다.
 * - 약관 본문 링크는 별도 anchor라서 새 탭에서 열리며, 체크 토글과 분리된다.
 * - 모바일에서 탭 영역 확보를 위해 min-height 11(=44px) 유지.
 */
function AgreementCheckbox({
  checked,
  onChange,
  label,
  href,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  href: string;
}) {
  return (
    <label className="flex items-center gap-2 min-h-11 sm:min-h-0 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
      />
      <span className="text-[13px] text-[var(--color-text-secondary)]">
        <span className="text-[var(--color-danger)]">[필수]</span>{' '}
        <a
          href={href}
          target="_blank"
          rel="noopener"
          className="underline underline-offset-2 hover:text-[var(--color-primary)]"
          onClick={e => e.stopPropagation()}
        >
          {label}
        </a>
        에 동의합니다
      </span>
    </label>
  );
}
