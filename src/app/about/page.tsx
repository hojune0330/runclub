'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  MapPin,
  Clock,
  Users,
  Ticket,
  QrCode,
  Calendar,
  Heart,
  Target,
  Sparkles,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import PublicProductCard from '@/components/public/PublicProductCard';
import { cn } from '@/lib/utils';

const FAQS: { q: string; a: string }[] = [
  {
    q: '러닝이 처음이어도 참여할 수 있나요?',
    a: 'EBW 세션은 초급자를 위해 설계된 가벼운 트레이닝이에요. 페이스를 조절해가며 함께 뛰기 때문에 부담 없이 시작할 수 있습니다.',
  },
  {
    q: '수강권은 어떤 종류가 있나요?',
    a: '회수권(정해진 횟수만큼 사용), 기간권(특정 기간 동안 무제한), 월정액 3가지가 있어요. 내 러닝 스타일에 맞춰 선택할 수 있습니다.',
  },
  {
    q: '예약 취소는 언제까지 가능한가요?',
    a: '세션 시작 2시간 전까지 자유롭게 취소할 수 있어요. 그 이후에는 코치에게 직접 문의해야 합니다. 반복된 노쇼는 서비스 이용에 제한이 있을 수 있어요.',
  },
  {
    q: '출석은 어떻게 체크하나요?',
    a: '세션 현장에서 코치가 30초 한정 QR 코드를 보여주면, 회원 앱에서 스캔하여 즉시 출석이 됩니다. 수강권 회수도 자동으로 차감돼요.',
  },
  {
    q: '날씨가 나쁠 때는 어떻게 되나요?',
    a: '실외 세션은 호우·폭염 등 기상 상황에 따라 취소되거나 실내로 대체될 수 있어요. 공지사항과 알림을 통해 미리 안내드립니다.',
  },
  {
    q: '정원이 마감된 세션은 어떻게 하나요?',
    a: '대기 신청이 가능합니다. 취소 자리가 나면 순서대로 자동 배정되고, 회원 앱으로 알림이 가요.',
  },
  {
    q: '친구와 함께 참여할 수 있나요?',
    a: '물론이에요! 회원 앱에서 친구 초대 링크·QR 코드를 생성해 공유하면, 친구도 런클럽에 가입하고 함께 달릴 수 있습니다.',
  },
  {
    q: '환불 정책은 어떻게 되나요?',
    a: '사용하지 않은 수강권은 구매일로부터 7일 이내 전액 환불 가능하며, 이후에는 사용한 만큼 차감 후 환불됩니다. 자세한 내용은 문의해주세요.',
  },
];

export default function AboutPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-[var(--color-primary-bg)] to-white border-b border-[var(--color-border)]">
        <div className="max-w-[1000px] mx-auto px-4 md:px-6 py-10 md:py-16 text-center">
          <p className="text-[11px] md:text-[12px] font-semibold tracking-[0.18em] uppercase text-[var(--color-primary)]">
            About RunClub
          </p>
          <h1 className="mt-2.5 md:mt-3 text-[22px] md:text-[36px] font-bold text-[var(--color-text)] tracking-tight leading-[1.25]">
            달리는 건 혼자여도,<br />
            성장은 함께가 빠르니까.
          </h1>
          <p className="mt-3 md:mt-4 text-[13px] md:text-[15.5px] text-[var(--color-text-secondary)] leading-relaxed max-w-[640px] mx-auto">
            런클럽은 초급부터 마라톤 준비 러너까지, 서로 페이스를 맞춰가며
            꾸준히 달릴 수 있도록 돕는 러닝 크루예요.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-6 py-10 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
          <ValueCard
            icon={Heart}
            title="모두를 위한 러닝"
            description="초급자 환영, 경험자는 목표 달성. 수준에 맞는 세션으로 누구나 편안하게 참여해요."
            color="#ef4444"
            bgColor="#fef2f2"
          />
          <ValueCard
            icon={Target}
            title="목표 중심 운영"
            description="개별 러닝 목표에 맞춘 세션 설계. 대회 준비부터 건강 관리까지 체계적으로."
            color="#2563eb"
            bgColor="#eff6ff"
          />
          <ValueCard
            icon={Sparkles}
            title="즐거운 함께"
            description="함께 뛰는 기쁨, 출석 스트릭, 배지와 통계로 동기 부여. 러닝이 일상이 되도록."
            color="#059669"
            bgColor="#ecfdf5"
          />
        </div>
      </section>

      {/* How it works */}
      <section className="bg-[var(--color-bg-subtle)] border-y border-[var(--color-border)]">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-10 md:py-16">
          <div className="text-center mb-7 md:mb-10">
            <p className="text-[11px] md:text-[12px] font-semibold tracking-[0.18em] uppercase text-[var(--color-primary)]">
              How it works
            </p>
            <h2 className="mt-1.5 md:mt-2 text-[20px] md:text-[28px] font-bold text-[var(--color-text)] tracking-tight">
              시작하는 방법
            </h2>
            <p className="mt-1.5 md:mt-2 text-[12.5px] md:text-[14px] text-[var(--color-text-muted)]">
              세 단계면 첫 세션에서 만날 수 있어요.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 relative">
            <StepCard
              step={1}
              icon={Users}
              title="회원가입"
              description="휴대폰 번호와 비밀번호로 30초 만에 가입 완료."
            />
            <StepCard
              step={2}
              icon={Ticket}
              title="수강권 등록"
              description="코치와 상담 후 원하는 수강권을 선택하여 시작."
            />
            <StepCard
              step={3}
              icon={Calendar}
              title="세션 예약 & 참여"
              description="캘린더에서 예약, 현장에서 QR 출석, 기록 확인."
            />
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-6 py-10 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start">
          <div>
            <p className="text-[11px] md:text-[12px] font-semibold tracking-[0.18em] uppercase text-[var(--color-primary)]">
              Where we run
            </p>
            <h2 className="mt-1.5 md:mt-2 text-[20px] md:text-[28px] font-bold text-[var(--color-text)] tracking-tight">
              서울 곳곳에서 달려요
            </h2>
            <p className="mt-2 md:mt-3 text-[13px] md:text-[14px] text-[var(--color-text-secondary)] leading-relaxed">
              서울 주요 러닝 스팟에서 세션을 진행하고 있어요. 날씨에 따라
              실내 러닝 센터로 대체될 수 있으며, 세션별 상세 장소는
              앱에서 확인할 수 있습니다.
            </p>
            <ul className="mt-5 space-y-2">
              <LocationItem name="여의도공원 문화의마당" desc="런클럽 · 러닝 클래스 주 진행지 (비행기 모형 앞 집결)" />
              <LocationItem name="여의도공원 일대" desc="코스에 따라 공원 내 이동" />
            </ul>
          </div>
          <div className="bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg p-4 md:p-7">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-md bg-[var(--color-primary-bg)] flex items-center justify-center">
                <Clock size={16} className="text-[var(--color-primary)]" />
              </div>
              <div>
                <p className="text-[13.5px] font-semibold text-[var(--color-text)]">세션 운영 시간</p>
                <p className="text-[11.5px] text-[var(--color-text-muted)]">변경될 수 있어요</p>
              </div>
            </div>
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              <ScheduleRow day="매주 수 · 금" time="저녁 7:30" types="런클럽" />
              <ScheduleRow day="매주 화 · 토" time="저녁 7:30" types="러닝 클래스" />
            </ul>
            <Link
              href="/sessions"
              className="mt-4 block text-center py-2 rounded text-[13px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-bg)] transition-colors"
            >
              정확한 일정 보기 <ArrowRight size={12} className="inline ml-0.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features & QR */}
      <section className="bg-[var(--color-bg-subtle)] border-y border-[var(--color-border)]">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-10 md:py-16">
          <div className="text-center mb-7 md:mb-10">
            <p className="text-[11px] md:text-[12px] font-semibold tracking-[0.18em] uppercase text-[var(--color-primary)]">
              App features
            </p>
            <h2 className="mt-1.5 md:mt-2 text-[20px] md:text-[28px] font-bold text-[var(--color-text)] tracking-tight">
              간편한 앱으로 관리
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <InfoRow
              icon={QrCode}
              title="QR 출석 시스템"
              description="세션 시작 전 코치가 보여주는 30초 한정 QR 코드를 스캔하면 바로 출석. 수강권도 자동 차감되고, 노쇼·중복 출석을 방지합니다."
            />
            <InfoRow
              icon={Calendar}
              title="주간 캘린더 예약"
              description="주 단위로 세션을 한눈에 보고, 탭 한 번에 예약·취소·대기 등록까지. 정원이 마감돼도 자동 배정 대기열이 있어요."
            />
            <InfoRow
              icon={Ticket}
              title="수강권 투명 관리"
              description="잔여 회수·만료일·사용 이력을 언제든 확인. 만료 7일 전 알림, 잔여 3회 이하 경고까지 자동으로."
            />
            <InfoRow
              icon={Users}
              title="친구 초대 & 공유"
              description="초대 코드·QR로 친구를 쉽게 초대하고, 좋아하는 세션을 카카오·문자로 공유해요. 함께 달리면 더 즐겁죠."
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-[900px] mx-auto px-4 md:px-6 py-10 md:py-16">
        <div className="text-center mb-6 md:mb-10">
          <p className="text-[11px] md:text-[12px] font-semibold tracking-[0.18em] uppercase text-[var(--color-primary)]">
            FAQ
          </p>
          <h2 className="mt-1.5 md:mt-2 text-[20px] md:text-[28px] font-bold text-[var(--color-text)] tracking-tight">
            자주 묻는 질문
          </h2>
          <p className="mt-1.5 md:mt-2 text-[12.5px] md:text-[14px] text-[var(--color-text-muted)]">
            가장 많이 궁금해하시는 것들을 모아봤어요.
          </p>
        </div>

        <ul className="space-y-2">
          {FAQS.map((faq, i) => {
            const open = openFaq === i;
            return (
              <li
                key={i}
                className="border border-[var(--color-border)] rounded-md bg-white overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="w-full flex items-center justify-between px-4 md:px-5 py-3 md:py-3.5 text-left active:bg-[var(--color-bg-subtle)] sm:hover:bg-[var(--color-bg-subtle)] transition-colors"
                >
                  <span className="text-[13px] md:text-[14px] font-semibold text-[var(--color-text)] pr-3 leading-snug">
                    Q. {faq.q}
                  </span>
                  <ChevronDown
                    size={16}
                    className={cn(
                      'text-[var(--color-text-muted)] shrink-0 transition-transform',
                      open && 'rotate-180 text-[var(--color-primary)]'
                    )}
                  />
                </button>
                {open && (
                  <div className="px-4 md:px-5 pb-3.5 md:pb-4 pt-0 text-[12.5px] md:text-[13.5px] text-[var(--color-text-secondary)] leading-relaxed border-t border-[var(--color-border-subtle)]">
                    <p className="pt-2.5 md:pt-3">{faq.a}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Featured Products ── */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-6 py-10 md:py-16">
        <div className="text-center mb-6 md:mb-10">
          <p className="text-[11px] md:text-[12px] font-semibold tracking-[0.18em] uppercase text-[var(--color-primary)]">
            Pricing
          </p>
          <h2 className="mt-1.5 md:mt-2 text-[20px] md:text-[28px] font-bold text-[var(--color-text)] tracking-tight">
            수강권 안내
          </h2>
          <p className="mt-1.5 md:mt-2 text-[12.5px] md:text-[14px] text-[var(--color-text-muted)]">
            나에게 맞는 수강권을 선택하고 러닝을 시작하세요.
          </p>
        </div>
        <PublicProductCard variant="featured" featuredOnly max={4} />
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-[var(--color-primary)] to-[#1d4ed8] text-white">
        <div className="max-w-[900px] mx-auto px-4 md:px-6 py-10 md:py-16 text-center">
          <h2 className="text-[20px] md:text-[28px] font-bold leading-tight tracking-tight">
            다른 질문이 있으신가요?
          </h2>
          <p className="mt-2 md:mt-3 text-[13px] md:text-[14px] text-white/85">
            언제든 편하게 문의해주세요. 카카오톡 오픈채팅에서도 만날 수 있어요.
          </p>
          <div className="mt-5 md:mt-6 flex flex-col sm:flex-row gap-2 justify-center max-w-[300px] sm:max-w-none mx-auto">
            <Link
              href="/login?mode=register"
              className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-md text-[14px] font-semibold bg-white text-[var(--color-primary)] active:bg-white/90 sm:hover:bg-white/90 transition-colors"
            >
              회원가입 <ArrowRight size={13} />
            </Link>
            <Link
              href="/sessions"
              className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-md text-[14px] font-semibold bg-white/10 active:bg-white/20 sm:hover:bg-white/20 border border-white/30 transition-colors"
            >
              세션 일정 보기
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

// ──── Sub-components ────

function ValueCard({
  icon: Icon,
  title,
  description,
  color,
  bgColor,
}: {
  icon: typeof Heart;
  title: string;
  description: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-lg p-4 md:p-6 text-center sm:hover:shadow-md transition-shadow">
      <div
        className="w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4"
        style={{ backgroundColor: bgColor }}
      >
        <Icon size={18} style={{ color }} />
      </div>
      <h3 className="text-[14.5px] md:text-[16px] font-bold text-[var(--color-text)] mb-1.5 md:mb-2">{title}</h3>
      <p className="text-[12.5px] md:text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function StepCard({
  step,
  icon: Icon,
  title,
  description,
}: {
  step: number;
  icon: typeof Users;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-lg p-4 md:p-6 relative">
      <span className="absolute -top-3 -left-2 w-8 h-8 md:w-9 md:h-9 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-[13px] md:text-[14px] font-bold shadow-sm">
        {step}
      </span>
      <div className="w-9 h-9 md:w-10 md:h-10 rounded-md bg-[var(--color-primary-bg)] flex items-center justify-center mb-2.5 md:mb-3 ml-5 md:ml-6">
        <Icon size={17} className="text-[var(--color-primary)]" />
      </div>
      <h3 className="text-[14.5px] md:text-[16px] font-bold text-[var(--color-text)] mb-1 md:mb-1.5 ml-5 md:ml-6">{title}</h3>
      <p className="text-[12.5px] md:text-[13px] text-[var(--color-text-secondary)] leading-relaxed ml-5 md:ml-6">
        {description}
      </p>
    </div>
  );
}

function LocationItem({ name, desc }: { name: string; desc: string }) {
  return (
    <li className="flex items-start gap-2.5 p-3 border border-[var(--color-border)] bg-white rounded-md">
      <MapPin size={14} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
      <div>
        <p className="text-[13.5px] font-semibold text-[var(--color-text)]">{name}</p>
        <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">{desc}</p>
      </div>
    </li>
  );
}

function ScheduleRow({ day, time, types }: { day: string; time: string; types: string }) {
  return (
    <li className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-[13px] font-semibold text-[var(--color-text)]">{day}</p>
        <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">{types}</p>
      </div>
      <span className="text-[13px] text-[var(--color-text-secondary)] tabular-nums font-mono">
        {time}
      </span>
    </li>
  );
}

function InfoRow({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof QrCode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-lg p-4 md:p-5 flex items-start gap-2.5 md:gap-3">
      <div className="w-9 h-9 md:w-10 md:h-10 rounded-md bg-[var(--color-primary-bg)] flex items-center justify-center shrink-0">
        <Icon size={17} className="text-[var(--color-primary)]" />
      </div>
      <div className="min-w-0">
        <h3 className="text-[14px] md:text-[14.5px] font-semibold text-[var(--color-text)] mb-1">{title}</h3>
        <p className="text-[12px] md:text-[12.5px] text-[var(--color-text-secondary)] leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
