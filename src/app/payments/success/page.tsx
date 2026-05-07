'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { TestModeBanner } from '@/components/member/PassCatalog';
import BusinessFooter from '@/components/public/BusinessFooter';

// ─────────────────────────────────────────────────────────────────────
// PR-6: Toss redirects here on successful checkout with three params:
//   ?paymentKey=...&orderId=...&amount=...
//
// We immediately POST to /api/payments/confirm which calls Toss's
// confirm endpoint server-side (with the secret key) and provisions
// the member_passes row. Confirmation is idempotent so a refresh is safe.
//
// Next.js requires `useSearchParams()` to be wrapped in a <Suspense>
// boundary so it can statically prerender the shell while deferring the
// search-params-dependent UI to the client.
// ─────────────────────────────────────────────────────────────────────

function PaymentSuccessContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<'pending' | 'ok' | 'fail'>('pending');
  const [message, setMessage] = useState<string>('결제 승인 중입니다…');
  const [passId, setPassId] = useState<string | null>(null);

  useEffect(() => {
    const paymentKey = params.get('paymentKey');
    const orderId = params.get('orderId');
    const amount = Number(params.get('amount'));

    if (!paymentKey || !orderId || !Number.isFinite(amount)) {
      setState('fail');
      setMessage('결제 정보가 올바르지 않습니다.');
      return;
    }

    (async () => {
      try {
        const r = await api.payments.confirm({ paymentKey, orderId, amount });
        if (r.success) {
          setPassId(r.passId);
          setState('ok');
          setMessage(r.alreadyConfirmed ? '이미 처리된 결제입니다.' : '결제가 완료되어 수강권이 발급되었습니다.');
        } else {
          setState('fail');
          setMessage('결제 승인에 실패했습니다.');
        }
      } catch (e: any) {
        setState('fail');
        setMessage(e?.message ?? '결제 승인 중 오류가 발생했습니다.');
      }
    })();
  }, [params]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg-subtle)]">
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] space-y-3">
          <TestModeBanner compact />
          <div className="bg-white border border-[var(--color-border)] rounded-md p-6 text-center">
          {state === 'pending' && (
            <>
              <Loader2 size={36} className="text-[var(--color-primary)] mx-auto mb-3 animate-spin" />
              <p className="text-[15px] font-semibold text-[var(--color-text)]">{message}</p>
              <p className="text-[12.5px] text-[var(--color-text-muted)] mt-1">잠시만 기다려주세요.</p>
            </>
          )}
          {state === 'ok' && (
            <>
              <CheckCircle2 size={40} className="text-[var(--color-success)] mx-auto mb-3" />
              <p className="text-[16px] font-semibold text-[var(--color-text)]">결제가 완료되었습니다</p>
              <p className="text-[13px] text-[var(--color-text-muted)] mt-1">{message}</p>
              {passId && <p className="text-[11.5px] text-[var(--color-text-muted)] mt-2 tabular-nums">발급 ID: {passId}</p>}
              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={() => router.replace('/app')}
                  className="h-11 inline-flex items-center justify-center text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)]"
                >
                  내 수강권으로 돌아가기
                </button>
              </div>
            </>
          )}
          {state === 'fail' && (
            <>
              <AlertCircle size={40} className="text-[var(--color-danger)] mx-auto mb-3" />
              <p className="text-[16px] font-semibold text-[var(--color-text)]">결제를 완료하지 못했습니다</p>
              <p className="text-[13px] text-[var(--color-text-muted)] mt-1 whitespace-pre-wrap">{message}</p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={() => router.replace('/app')}
                  className="h-11 inline-flex items-center justify-center text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)]"
                >
                  다시 시도하기
                </button>
              </div>
            </>
          )}
          </div>
        </div>
      </div>
      {/* 전자상거래법 제13조·시행령 제10조 — 사업자 정보 의무 표기 */}
      <BusinessFooter variant="compact" />
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--color-bg-subtle)]">
        <div className="w-full max-w-[440px] bg-white border border-[var(--color-border)] rounded-md p-6 text-center">
          <Loader2 size={36} className="text-[var(--color-primary)] mx-auto mb-3 animate-spin" />
          <p className="text-[15px] font-semibold text-[var(--color-text)]">결제 정보를 불러오는 중…</p>
        </div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
