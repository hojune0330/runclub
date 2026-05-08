'use client';

import { Calendar, Ticket, QrCode, Bell, ClipboardList, History, User, HelpCircle } from 'lucide-react';

type Step = { title: string; desc: string };
type Section = {
  id: string;
  icon: typeof Calendar;
  title: string;
  summary: string;
  steps: Step[];
  tips?: string[];
};

const sections: Section[] = [
  {
    id: 'calendar',
    icon: Calendar,
    title: '세션 예약하기',
    summary: '원하는 날짜의 세션을 선택해 예약합니다.',
    steps: [
      { title: '세션 일정에서 날짜 선택', desc: '왼쪽 메뉴 "세션 일정"에서 주간/월간 보기로 날짜를 확인합니다.' },
      { title: '세션 카드 클릭', desc: '해당 날짜의 세션을 클릭하면 상세 정보와 예약 버튼이 나타납니다.' },
      { title: '예약하기', desc: '"예약하기" 버튼을 누르면 즉시 예약이 확정됩니다. 정원이 찼다면 대기 등록이 가능합니다.' },
    ],
    tips: [
      '수강권이 있어야 예약할 수 있습니다. 수강권이 없다면 관리자에게 문의하세요.',
      '세션 시작 2시간 전까지 무료로 취소할 수 있습니다 (세션에 따라 다를 수 있음).',
    ],
  },
  {
    id: 'passes',
    icon: Ticket,
    title: '수강권 확인하기',
    summary: '보유 중인 수강권의 잔여 횟수와 만료일을 확인합니다.',
    steps: [
      { title: '내 수강권 메뉴', desc: '왼쪽 메뉴 "내 수강권"에서 활성 수강권 목록을 볼 수 있습니다.' },
      { title: '잔여 횟수 확인', desc: '회차권은 남은 횟수와 진행률이, 기간권(시즌/월권)은 만료일이 표시됩니다.' },
      { title: '만료 임박 알림', desc: '만료일이 7일 이내면 빨간색으로 강조 표시됩니다.' },
    ],
    tips: [
      '수강권 구매·연장은 현장에서 관리자에게 요청하면 됩니다.',
    ],
  },
  {
    id: 'qr',
    icon: QrCode,
    title: 'QR 체크인하기',
    summary: '세션 당일 현장에서 QR 코드로 출석합니다.',
    steps: [
      { title: '세션 시작 30분 전부터 가능', desc: '현장에 도착해 "QR 체크인" 메뉴를 엽니다.' },
      { title: '카메라로 코치 QR 스캔', desc: '코치가 보여주는 QR 코드를 카메라로 비추면 자동 출석 처리됩니다.' },
      { title: '성공 확인', desc: '녹색 체크 표시가 뜨면 출석 완료입니다.' },
    ],
    tips: [
      'QR은 보안을 위해 30초마다 자동 갱신됩니다.',
      '카메라가 동작하지 않으면 코치에게 직접 요청해 수동 출석 처리를 받을 수 있습니다.',
    ],
  },
  {
    id: 'reservations',
    icon: ClipboardList,
    title: '예약 확인·취소',
    summary: '다가오는 예약과 지난 예약을 관리합니다.',
    steps: [
      { title: '내 예약 메뉴', desc: '왼쪽 "내 예약"에서 "다가오는 예약"과 "지난 예약" 탭을 볼 수 있습니다.' },
      { title: '예약 취소', desc: '다가오는 예약 카드의 "취소" 버튼을 누르면 예약이 취소되고 수강권 횟수가 복원됩니다.' },
    ],
    tips: [
      '세션 시작 임박 시간에는 취소가 불가능할 수 있습니다.',
    ],
  },
  {
    id: 'attendance',
    icon: History,
    title: '출석 이력 보기',
    summary: '지금까지 참여한 세션 기록을 월별로 확인합니다.',
    steps: [
      { title: '출석 이력 메뉴', desc: '출석 횟수, 노쇼 횟수, 출석률이 상단에 표시됩니다.' },
      { title: '월별 기록 확인', desc: '월 단위로 그룹화된 세션 목록에서 출석/노쇼 상태를 확인할 수 있습니다.' },
    ],
  },
  {
    id: 'notices',
    icon: Bell,
    title: '공지사항 확인',
    summary: '코치가 올린 공지를 놓치지 마세요.',
    steps: [
      { title: '공지사항 메뉴', desc: '새 공지가 있으면 사이드바와 상단 벨 아이콘에 빨간 점/숫자가 표시됩니다.' },
      { title: '공지 클릭', desc: '공지를 클릭하면 읽음 처리되고 본문을 확인할 수 있습니다.' },
    ],
  },
  {
    id: 'profile',
    icon: User,
    title: '내 정보 관리',
    summary: '이름·연락처·이메일을 확인하고 비밀번호를 변경할 수 있습니다.',
    steps: [
      { title: '프로필 메뉴', desc: '왼쪽 "프로필"에서 계정 정보와 활성 수강권을 확인합니다.' },
      { title: '비밀번호 변경', desc: '"비밀번호 변경" 버튼으로 비밀번호를 주기적으로 갱신하세요.' },
      { title: '로그아웃', desc: '공용 PC에서 사용했다면 반드시 로그아웃해주세요.' },
    ],
  },
];

export default function Help() {
  return (
    <div className="max-w-[960px]">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle size={18} className="text-[var(--color-primary)]" />
          <h1 className="page-title">도움말</h1>
        </div>
        <p className="text-[13px] text-[var(--color-text-muted)]">
          런클럽 매니저를 처음 사용하시나요? 주요 기능을 3분 안에 익혀보세요.
        </p>
      </div>

      <div className="bg-[var(--color-primary-bg)] border border-[var(--color-primary)]/20 rounded px-5 py-4 mb-6">
        <p className="text-[13px] text-[var(--color-text)] leading-relaxed">
          <strong>시작하기 전에:</strong> 예약하려면 <strong>수강권</strong>이 필요합니다.
          수강권이 없다면 현장에서 코치에게 문의하거나, <strong>프로필</strong> 메뉴의 "문의하기"를 이용해주세요.
        </p>
      </div>

      <div className="space-y-4">
        {sections.map((section, idx) => {
          const Icon = section.icon;
          return (
            <article
              key={section.id}
              className="bg-white border border-[var(--color-border)] rounded"
            >
              <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-[var(--color-bg-subtle)] flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={15} className="text-[var(--color-text-secondary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[14.5px] font-semibold text-[var(--color-text)]">
                    {idx + 1}. {section.title}
                  </h2>
                  <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">
                    {section.summary}
                  </p>
                </div>
              </header>
              <div className="px-5 py-4">
                <ol className="space-y-3">
                  {section.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-secondary)] flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[var(--color-text)]">{step.title}</p>
                        <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{step.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                {section.tips && section.tips.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
                    <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">TIP</p>
                    <ul className="space-y-1">
                      {section.tips.map((tip, i) => (
                        <li key={i} className="text-[12.5px] text-[var(--color-text-secondary)] leading-relaxed flex gap-2">
                          <span className="text-[var(--color-text-muted)] shrink-0">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6 p-5 bg-white border border-[var(--color-border)] rounded">
        <h3 className="text-[13.5px] font-semibold text-[var(--color-text)] mb-1">더 궁금한 점이 있나요?</h3>
        <p className="text-[12.5px] text-[var(--color-text-secondary)]">
          해결되지 않는 문제는 프로필 메뉴의 <strong>문의하기</strong>를 이용하거나, 현장에서 코치에게 직접 문의해주세요.
        </p>
      </div>
    </div>
  );
}
