'use client';

import {
  Calendar,
  Ticket,
  QrCode,
  Bell,
  ClipboardList,
  History,
  User,
  HelpCircle,
  ShoppingBag,
  Lock,
} from 'lucide-react';

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
    id: 'auth',
    icon: Lock,
    title: '로그인·회원가입·비밀번호 문제',
    summary: '로그인이 안 되거나 비밀번호를 잊었을 때의 해결 방법입니다.',
    steps: [
      { title: '휴대폰 번호로 로그인', desc: '가입 시 사용한 휴대폰 번호와 비밀번호를 입력합니다. 비밀번호가 틀린 경우 이제 "인증 만료"가 아니라 올바른 오류 메시지가 표시됩니다.' },
      { title: '이미 가입된 번호', desc: '회원가입 중 "이미 가입" 안내가 보이면 새로 가입하지 말고 로그인 탭으로 이동하세요. 비밀번호가 기억나지 않으면 재설정 요청을 사용합니다.' },
      { title: '비밀번호 재설정 요청', desc: '로그인 화면의 "비밀번호 재설정 요청 > 요청하기"에서 이름, 휴대폰 번호, 메모를 남깁니다. 보안을 위해 가입 여부는 화면에 표시하지 않습니다.' },
      { title: '임시 비밀번호 받기', desc: '관리자가 정보를 확인하면 임시 비밀번호를 안내합니다. 임시 비밀번호로 로그인하면 앱 사용 전 새 비밀번호로 변경해야 합니다.' },
      { title: '새 비밀번호 규칙', desc: '비밀번호는 8~64자, 영문과 숫자를 포함해야 하며 공백은 사용할 수 없습니다.' },
    ],
    tips: [
      '문자/카카오 등 외부 채널로 임시 비밀번호를 받았다면 첫 로그인 후 바로 새 비밀번호로 바꾸세요.',
      '공용 기기에서 사용했다면 반드시 로그아웃하세요.',
    ],
  },
  {
    id: 'calendar',
    icon: Calendar,
    title: '세션 예약하기',
    summary: '원하는 날짜의 세션을 선택해 예약하거나 대기 등록합니다.',
    steps: [
      { title: '세션 일정 열기', desc: '왼쪽 메뉴 또는 하단 메뉴의 "세션 일정"에서 주간/월간 일정을 확인합니다.' },
      { title: '세션 상세 확인', desc: '세션 카드를 누르면 시간, 장소, 정원, 준비물/안내 메모, 적용 가능한 수강권 조건을 확인할 수 있습니다.' },
      { title: '예약하기', desc: '사용 가능한 수강권이 있으면 "예약하기"로 예약이 확정됩니다. 회차권은 예약 시 1회 차감되고, 시즌권/월권은 횟수 차감 없이 예약됩니다.' },
      { title: '정원이 찬 경우', desc: '정원이 찼다면 대기 등록이 표시될 수 있습니다. 예약 취소 등으로 자리가 생기면 운영 정책에 따라 안내됩니다.' },
      { title: '적용 수강권 확인', desc: '수강권은 전체 세션 또는 특정 세션/태그에만 적용될 수 있습니다. 해당 세션에 맞는 활성 수강권이 없으면 예약할 수 없습니다.' },
    ],
    tips: [
      '세션 시작 후에는 직접 취소가 제한됩니다. 잘못 처리된 기록은 정정 요청을 이용하세요.',
      '예약하지 못했더라도 현장 QR 체크인은 해당 세션에 사용할 수 있는 활성 수강권이 있으면 가능합니다.',
    ],
  },
  {
    id: 'passes',
    icon: Ticket,
    title: '수강권 확인·구매하기',
    summary: '보유 수강권, 잔여 횟수, 만료일, 구매 가능한 상품을 확인합니다.',
    steps: [
      { title: '내 수강권 확인', desc: '"내 수강권"에서 사용 중인 수강권과 만료/정지된 수강권을 확인합니다. 회차권은 남은 횟수와 사용 횟수가 표시됩니다.' },
      { title: '적용 세션 확인', desc: '각 수강권에는 전체 세션 또는 특정 세션 태그가 표시됩니다. 이 범위와 맞는 세션에서만 예약/현장 체크인이 가능합니다.' },
      { title: '수강권 구매', desc: '"수강권 구매"에서 판매 중인 상품 카드를 누르면 상세 설명, 적용 범위, 가격, 환불정책을 보고 결제할 수 있습니다.' },
      { title: '결제 준비 중인 경우', desc: '온라인 결제가 준비되지 않았다는 안내가 나오면 운영자에게 문의하거나 현장에서 발급을 요청하세요. 무료 상품은 즉시 발급될 수 있습니다.' },
    ],
    tips: [
      '만료일이 가까운 수강권은 빨간색 또는 D-day로 강조됩니다.',
      '회차권은 예약/출석 흐름에서 자동 차감·환원되므로 잔여 횟수가 이상하면 정정 요청 또는 코치에게 문의하세요.',
    ],
  },
  {
    id: 'qr',
    icon: QrCode,
    title: 'QR·현장 체크인하기',
    summary: '세션 당일 현장에서 QR 또는 코치 태블릿으로 출석합니다.',
    steps: [
      { title: '가능 시간', desc: '회원 QR 체크인은 오늘 세션에 대해 세션 시작 60분 전부터 종료 60분 후까지 가능합니다.' },
      { title: '회원 앱으로 스캔', desc: '"QR 체크인" 메뉴에서 카메라를 켜고 코치가 보여주는 QR을 비추면 자동 출석 처리됩니다.' },
      { title: '기본 카메라로 열기', desc: 'QR은 링크 형식이라 휴대폰 기본 카메라로 열어도 체크인 페이지가 열립니다.' },
      { title: '예약 없이 현장 참석', desc: '오늘 예약이 없어도 해당 세션에 사용할 수 있는 활성 수강권이 있으면 QR 스캔으로 바로 출석 처리됩니다.' },
      { title: '성공 확인', desc: '녹색 체크 또는 출석 완료 메시지가 보이면 처리 완료입니다. 이미 출석된 경우 중복 차감 없이 안내됩니다.' },
    ],
    tips: [
      'QR 토큰은 2분 동안 유효합니다. 만료되었다는 안내가 나오면 코치에게 새 QR을 요청하세요.',
      '앱 내 카메라가 지원되지 않거나 권한이 거부되면 브라우저 카메라 권한을 허용하거나 코치에게 현장 태블릿 체크인을 요청하세요.',
      '예약도 없고 해당 세션에 맞는 수강권도 없으면 QR 체크인이 되지 않습니다.',
    ],
  },
  {
    id: 'reservations',
    icon: ClipboardList,
    title: '예약 확인·취소·정정 요청',
    summary: '다가오는 예약과 지난 기록을 확인하고 필요한 정정을 요청합니다.',
    steps: [
      { title: '내 예약 보기', desc: '"내 예약"에서 다가오는 예약과 지난 예약을 탭으로 나누어 볼 수 있습니다.' },
      { title: '예약 취소', desc: '다가오는 예약의 "예약 취소" 버튼을 누르면 예약이 취소되고 회차권은 복원됩니다. 단, 세션 시작 이후에는 직접 취소가 제한됩니다.' },
      { title: '정정 요청 보내기', desc: '예약/출석/노쇼/취소 상태가 잘못되었다면 세션 시작 후 48시간 이내 "정정 요청"을 누르고 사유와 상세 내용을 입력합니다.' },
      { title: '처리 중 요청 확인', desc: '보낸 요청은 "처리 중인 정정 요청" 영역에 표시됩니다. 잘못 보냈다면 관리자가 처리하기 전 철회할 수 있습니다.' },
    ],
    tips: [
      '정정 사유는 "출석했는데 노쇼", "안 갔는데 출석", "취소하고 싶었음", "다른 사람과 바뀜", "기타" 중 선택합니다.',
      '정정 요청 승인 시 예약 상태와 수강권 잔여 횟수가 함께 바로잡힐 수 있습니다.',
    ],
  },
  {
    id: 'attendance',
    icon: History,
    title: '출석 이력과 상태 이해하기',
    summary: '참여 기록과 출석률, 노쇼 기록을 확인합니다.',
    steps: [
      { title: '출석 이력 메뉴', desc: '"출석 이력"에서 출석 횟수, 노쇼 횟수, 출석률과 월별 기록을 확인합니다.' },
      { title: '상태 의미', desc: '예약완료는 아직 출석 전 예약, 출석은 참석 완료, 노쇼는 예약 후 미참석, 취소는 예약 취소 또는 관리자 취소 상태입니다.' },
      { title: '이상한 기록 정정', desc: '출석했는데 노쇼이거나, 참석하지 않았는데 출석으로 보이면 해당 기록의 정정 요청 버튼을 사용합니다. 기한은 세션 시작 후 48시간입니다.' },
    ],
    tips: [
      '노쇼는 패널티성 기록이라 수강권이 자동 환원되지 않습니다. 실제로 참석했다면 정정 요청을 보내세요.',
    ],
  },
  {
    id: 'notices',
    icon: Bell,
    title: '공지사항 확인',
    summary: '코치가 올린 운영 안내와 변경사항을 확인합니다.',
    steps: [
      { title: '공지사항 메뉴', desc: '새 공지가 있으면 사이드바 또는 상단/메뉴 알림 배지에 표시됩니다.' },
      { title: '공지 열람', desc: '공지를 클릭하면 본문을 확인하고 읽음 처리됩니다.' },
      { title: '대상 공지', desc: '전체 공지뿐 아니라 특정 세션 유형 또는 수강권 대상 공지가 표시될 수 있습니다.' },
    ],
    tips: [
      '장소 변경, 우천 취소, 준비물 공지는 세션 당일 전에 꼭 확인하세요.',
    ],
  },
  {
    id: 'profile',
    icon: User,
    title: '프로필과 내 정보',
    summary: '계정 정보, 활성 수강권, 설정 메뉴를 확인합니다.',
    steps: [
      { title: '계정 정보 확인', desc: '"프로필"에서 이름, 연락처, 이메일, 가입일을 확인합니다.' },
      { title: '활성 수강권 확인', desc: '프로필에서도 현재 사용 중인 수강권과 적용 세션, 잔여/만료일을 빠르게 볼 수 있습니다.' },
      { title: '비밀번호 변경', desc: '로그인 가능한 상태라면 프로필의 "비밀번호 변경" 메뉴에서 현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.' },
      { title: '문의하기', desc: '프로필의 "문의하기" 또는 현장 코치를 통해 결제, 수강권, 예약/출석 문제를 문의할 수 있습니다.' },
      { title: '로그아웃', desc: '공용 PC나 다른 사람의 기기에서 사용했다면 반드시 로그아웃하세요.' },
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
          예약, 수강권, QR 체크인, 정정 요청, 비밀번호 재설정까지 실제 화면 기준으로 정리했습니다.
        </p>
      </div>

      <div className="bg-[var(--color-primary-bg)] border border-[var(--color-primary)]/20 rounded px-5 py-4 mb-6">
        <p className="text-[13px] text-[var(--color-text)] leading-relaxed">
          <strong>시작하기 전에:</strong> 예약과 현장 QR 체크인은 보통 <strong>해당 세션에 사용할 수 있는 활성 수강권</strong>이 필요합니다.
          수강권은 <strong>수강권 구매</strong> 메뉴에서 구매하거나 현장에서 코치에게 문의하세요.
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
        <h3 className="text-[13.5px] font-semibold text-[var(--color-text)] mb-1 inline-flex items-center gap-1.5">
          <ShoppingBag size={14} /> 더 궁금한 점이 있나요?
        </h3>
        <p className="text-[12.5px] text-[var(--color-text-secondary)] leading-relaxed">
          수강권 구매/환불, 예약 마감 이후 취소, 출석 오류, 비밀번호 안내가 필요하면 프로필 메뉴의 <strong>문의하기</strong> 또는 현장 코치에게 문의해주세요.
          비밀번호를 잊어 로그인할 수 없다면 로그인 화면에서 <strong>비밀번호 재설정 요청</strong>을 남기면 됩니다.
        </p>
      </div>
    </div>
  );
}
