'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, QrCode } from 'lucide-react';
import { api, AuthExpiredError } from '@/lib/api';

type CheckinState = 'loading' | 'success' | 'already' | 'login' | 'error';

export default function QRCheckinLandingPage() {
  const [state, setState] = useState<CheckinState>('loading');
  const [message, setMessage] = useState('QR 출석 정보를 확인하고 있습니다...');
  const [sessionLabel, setSessionLabel] = useState('');

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('sessionId') || '';
      const token = params.get('token') || '';

      if (!sessionId || !token) {
        setState('error');
        setMessage('체크인 QR 정보가 올바르지 않습니다. 코치 화면의 최신 QR을 다시 열어주세요.');
        return;
      }

      try {
        const result = await api.qr.verify(sessionId, token);
        setSessionLabel(`${result.sessionName} · ${result.sessionTime}`);
        setState(result.alreadyAttended ? 'already' : 'success');
        setMessage(result.message || (result.alreadyAttended ? '이미 출석 처리되어 있습니다.' : '출석 처리되었습니다.'));
      } catch (error: any) {
        if (error instanceof AuthExpiredError || error?.name === 'AuthExpiredError') {
          setState('login');
          setMessage('로그인 후 다시 QR을 열면 출석 처리됩니다.');
        } else {
          setState('error');
          setMessage(error?.message || '출석 처리 중 오류가 발생했습니다. 코치에게 현장 출석 처리를 요청해주세요.');
        }
      }
    };

    void run();
  }, []);

  const isSuccess = state === 'success' || state === 'already';

  return (
    <main className="min-h-screen bg-[var(--color-bg-subtle)] flex items-center justify-center px-5 py-10">
      <section className="w-full max-w-[420px] bg-white border border-[var(--color-border)] rounded-2xl shadow-sm p-6 text-center">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center bg-[var(--color-primary-bg)]">
          {state === 'loading' ? (
            <Loader2 size={30} className="text-[var(--color-primary)] animate-spin" />
          ) : isSuccess ? (
            <CheckCircle2 size={34} className="text-[var(--color-success)]" />
          ) : state === 'login' ? (
            <QrCode size={32} className="text-[var(--color-primary)]" />
          ) : (
            <AlertCircle size={32} className="text-[var(--color-danger)]" />
          )}
        </div>

        <h1 className="text-[22px] font-bold text-[var(--color-text)]">
          {state === 'loading' && 'QR 체크인'}
          {state === 'success' && '출석 완료'}
          {state === 'already' && '이미 출석 완료'}
          {state === 'login' && '로그인이 필요합니다'}
          {state === 'error' && '체크인 실패'}
        </h1>

        {sessionLabel && (
          <p className="mt-2 text-[14px] font-medium text-[var(--color-text-secondary)] tabular-nums">
            {sessionLabel}
          </p>
        )}

        <p className="mt-4 text-[14px] leading-relaxed text-[var(--color-text-secondary)] break-keep">
          {message}
        </p>

        <div className="mt-6 space-y-2">
          {state === 'login' ? (
            <Link
              href="/login"
              className="block w-full h-11 rounded-lg bg-[var(--color-primary)] text-white text-[14px] font-semibold leading-[44px] hover:opacity-90"
            >
              로그인하기
            </Link>
          ) : (
            <Link
              href="/app"
              className="block w-full h-11 rounded-lg bg-[var(--color-primary)] text-white text-[14px] font-semibold leading-[44px] hover:opacity-90"
            >
              앱으로 이동
            </Link>
          )}
          <p className="text-[12px] text-[var(--color-text-muted)]">
            문제가 계속되면 코치의 현장 태블릿에서 이름/연락처로 출석할 수 있습니다.
          </p>
        </div>
      </section>
    </main>
  );
}
