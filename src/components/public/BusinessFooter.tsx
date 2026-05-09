'use client';

import Link from 'next/link';
import { BUSINESS_INFO, telDigits } from '@/lib/business-info';

/**
 * BusinessFooter — 전자상거래법 제13조·시행령 제10조에 따른 사업자 정보 의무 표기.
 *
 * 비회원(공개 페이지) 푸터, 회원 앱(`/app`), 어드민 앱, 결제 결과 페이지 등
 * 결제가 발생할 수 있는 모든 화면에서 동일한 정보를 표시하기 위해 단일 컴포넌트로 분리.
 *
 * ── 표기 정책 (2025-05 정리) ──
 * 전상법 제13조 제1항이 의무화하는 항목 + PG 심사 통과를 위한 약관/개인정보/환불 링크.
 * - 의무 (사업자 정보): 상호, 대표자, 사업장 주소, 전화, 이메일, 사업자등록번호, 통신판매업 신고번호, 결제대행 고지
 * - 의무 (정책): 이용약관, 개인정보처리방침, 환불·청약철회
 *
 * variant
 *  - 'full'    : 공개 푸터(사업자 정보 + 정책 링크 + 카피라이트). PublicLayout 에서 사용.
 *  - 'compact' : 사업자 정보 + 정책 링크 + 카피라이트. 회원/어드민/결제 페이지에서 사용.
 */

type Variant = 'full' | 'compact';

const B = BUSINESS_INFO;

export default function BusinessFooter({ variant = 'compact' }: { variant?: Variant }) {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
      <div className="bg-white">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4 md:py-5">
          <p className="text-[11px] font-semibold text-[var(--color-text-secondary)] mb-2">사업자 정보</p>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            <div className="flex gap-1.5">
              <dt className="shrink-0">상호</dt>
              <dd>{B.companyName}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0">대표자</dt>
              <dd>{B.ceo}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0">사업자등록번호</dt>
              <dd className="tabular-nums">{B.businessRegistrationNumber}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0">통신판매업 신고</dt>
              <dd className="tabular-nums">{B.mailOrderNumber}</dd>
            </div>
            <div className="flex gap-1.5 md:col-span-2">
              <dt className="shrink-0">사업장 소재지</dt>
              <dd>{B.address}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0">전화</dt>
              <dd>
                <a href={`tel:${telDigits()}`} className="hover:text-[var(--color-primary)]">{B.tel}</a>
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0">이메일</dt>
              <dd>
                <a href={`mailto:${B.email}`} className="hover:text-[var(--color-primary)]">{B.email}</a>
              </dd>
            </div>
          </dl>
          <p className="text-[10.5px] text-[var(--color-text-muted)] mt-3 leading-relaxed">
            결제대행: {B.paymentProvider} · 본 사이트는 결제·취소·환불을 토스페이먼츠를 통해 처리합니다.
          </p>
          {/*
            정책 링크 — PG 심사 필수 항목.
            토스 심사관이 결제 페이지/푸터에서 약관·개인정보·환불 정책을
            클릭으로 열람 가능한지 확인하므로 모든 variant에서 노출한다.
          */}
          <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <Link href="/terms" className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:underline">
              이용약관
            </Link>
            <Link
              href="/privacy"
              className="font-medium text-[var(--color-text)] hover:text-[var(--color-primary)] hover:underline"
            >
              개인정보처리방침
            </Link>
            <Link href="/refund" className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:underline">
              환불·취소 정책
            </Link>
          </nav>
          {variant === 'compact' && (
            <p className="text-[10.5px] text-[var(--color-text-muted)] mt-2">
              © 2026 {B.companyName}. All rights reserved.
            </p>
          )}
        </div>
      </div>
      {variant === 'full' && (
        <div className="border-t border-[var(--color-border)] py-3 px-4 md:px-6 text-center text-[11px] text-[var(--color-text-muted)]">
          © 2026 {B.companyName}. All rights reserved.
        </div>
      )}
    </footer>
  );
}
