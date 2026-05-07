'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';

// PR-6: Toss redirects here when the user cancels or the payment fails.
// Query params: ?code=...&message=...&orderId=...
//
// Next.js requires `useSearchParams()` to be wrapped in a <Suspense>
// boundary so it can statically prerender the shell while deferring the
// search-params-dependent UI to the client.
function PaymentFailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get('code');
  const message = params.get('message');

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--color-bg-subtle)]">
      <div className="w-full max-w-[440px] bg-white border border-[var(--color-border)] rounded-md p-6 text-center">
        <AlertCircle size={40} className="text-[var(--color-danger)] mx-auto mb-3" />
        <p className="text-[16px] font-semibold text-[var(--color-text)]">결제가 완료되지 않았습니다</p>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-1">
          {message || '결제 도중 취소되었거나 오류가 발생했습니다.'}
        </p>
        {code && (
          <p className="text-[11.5px] text-[var(--color-text-muted)] mt-2 tabular-nums">오류 코드: {code}</p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => router.replace('/app')}
            className="h-11 inline-flex items-center justify-center text-[13.5px] font-semibold text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)]"
          >
            앱으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PaymentFailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--color-bg-subtle)]">
        <div className="w-full max-w-[440px] bg-white border border-[var(--color-border)] rounded-md p-6 text-center">
          <p className="text-[13px] text-[var(--color-text-muted)]">불러오는 중...</p>
        </div>
      </div>
    }>
      <PaymentFailContent />
    </Suspense>
  );
}
