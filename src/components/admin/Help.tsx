'use client';

import {
  LayoutDashboard,
  Calendar,
  Users,
  Ticket,
  QrCode,
  Megaphone,
  BarChart3,
  HelpCircle,
  Shield,
  Tag,
  MessageSquareWarning,
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
    id: 'first',
    icon: LayoutDashboard,
    title: '처음 운영 세팅',
    summary: '회원이 예약·구매·출석까지 막힘없이 진행하도록 기본 데이터를 먼저 준비합니다.',
    steps: [
      { title: '회원/권한 확인', desc: '"회원 관리"에서 직접 회원을 추가하거나 회원가입한 계정을 확인합니다. 관리자 권한 부여, 비활성화, 삭제도 여기서 처리합니다.' },
      { title: '세션 태그와 수강권 상품 준비', desc: '"세션 태그"로 수강권 적용 범위를 정리한 뒤 "수강권 관리 > 상품"에서 판매/발급할 회차권·시즌권·월권을 등록합니다.' },
      { title: '수강권 발급 또는 구매 안내', desc: '운영자가 직접 발급할 수 있고, 회원은 "수강권 구매"에서 판매 중인 상품을 결제할 수 있습니다. 무료 상품은 즉시 발급됩니다.' },
      { title: '세션 생성과 공지 등록', desc: '"세션 관리"에서 날짜·시간·정원·취소 마감·상세 안내를 입력하고, "공지사항"으로 준비물/변경사항을 알립니다.' },
      { title: '현장 출석 운영', desc: '당일에는 "출석 체크"에서 현장 태블릿 체크인을 기본으로 사용하고, 필요하면 QR 체크인을 함께 띄웁니다.' },
    ],
    tips: [
      '권장 순서: 세션 태그 → 수강권 상품 → 회원/수강권 발급 → 세션 생성 → 공지 → 현장 출석 체크입니다.',
      '예약/출석/비밀번호 재설정/정정 요청 등 민감한 작업은 감사 로그에 남습니다.',
    ],
  },
  {
    id: 'sessions',
    icon: Calendar,
    title: '세션·예약자 관리',
    summary: '세션 생성부터 예약자 상태 변경, 대기/초과 수용, 노쇼 처리까지 관리합니다.',
    steps: [
      { title: '세션 만들기/수정', desc: '"세션 관리"에서 + 세션 추가 또는 세션 상세의 수정 버튼을 사용합니다. 정원, 장소, 취소 마감, 공개 메모, 커버 이미지 등을 관리할 수 있습니다.' },
      { title: '정원과 대기 관리', desc: '정원이 차면 회원에게 대기 등록이 표시됩니다. 세션 설정의 초과 수용 비율은 노쇼 대비 여유 좌석으로 활용됩니다.' },
      { title: '예약자 상태 4단계', desc: '예약자 목록에서 예약완료(reserved), 출석(attended), 노쇼(noshow), 취소(cancelled)를 클릭해 즉시 변경합니다. 상태 변경 시 회차권 환원/차감은 시스템이 자동 계산합니다.' },
      { title: '예약자 추가', desc: '"예약자 추가"로 관리자가 회원을 직접 추가할 수 있습니다. 수강권 차감 없이 추가하거나, 처음부터 출석 상태로 소급 등록할 수 있습니다.' },
      { title: '노쇼 일괄', desc: '세션 종료 후 남아 있는 예약완료 인원을 한 번에 노쇼 처리합니다. 노쇼는 패널티성 기록이므로 회차권은 환원되지 않습니다.' },
    ],
    tips: [
      '출석→취소, 출석→노쇼처럼 민감한 변경은 확인창이 표시됩니다.',
      '취소된 예약도 목록에 남으므로 잘못 취소된 경우 다시 예약완료 또는 출석으로 복구할 수 있습니다.',
    ],
  },
  {
    id: 'attendance',
    icon: QrCode,
    title: '출석 체크와 현장 워크플로우',
    summary: '현장 태블릿 체크인과 QR 체크인을 상황에 맞게 사용합니다.',
    steps: [
      { title: '현장 태블릿 체크인', desc: '"출석 체크"에서 세션을 선택하고 회원이 이름과 연락처(뒤 4자리 가능)를 입력하면 예약자는 즉시 출석 처리됩니다.' },
      { title: '예약 없는 현장 참석', desc: '관리자 옵션의 "예약이 없는 회원도 현장 추가 허용"이 켜져 있으면, 해당 세션에 사용할 수 있는 활성 수강권으로 바로 출석 예약이 생성됩니다.' },
      { title: '예외/무료 처리', desc: '게스트·강사·운영 예외는 "수강권 없이 관리자 무료/예외 처리"를 켜서 출석 처리할 수 있습니다. 이 작업도 감사 로그에 남습니다.' },
      { title: 'QR 체크인', desc: 'QR 탭에서 큰 QR을 띄우면 회원 앱 또는 휴대폰 기본 카메라로 열 수 있습니다. QR 토큰은 2분 유효하며 화면은 30초마다 새 QR로 갱신됩니다.' },
      { title: '시간 제한', desc: '회원 QR 검증은 오늘 세션에 대해 세션 시작 60분 전부터 종료 60분 후까지 허용됩니다.' },
    ],
    tips: [
      '회차권은 출석 시 1회 차감되고, 시즌권/월권은 잔여 횟수 차감 없이 출석 처리됩니다.',
      '스캔이 안 되거나 브라우저 카메라가 안 되는 회원은 같은 "출석 체크" 화면의 현장 태블릿 체크인으로 처리하세요.',
    ],
  },
  {
    id: 'corrections',
    icon: MessageSquareWarning,
    title: '출석/예약 정정 요청 처리',
    summary: '회원이 보낸 정정 요청을 관리자 인박스에서 확인하고 승인·반려합니다.',
    steps: [
      { title: '요청 확인', desc: '회원은 "내 예약" 또는 "출석 이력"에서 세션 시작 후 48시간 이내 정정 요청을 보낼 수 있습니다. 관리자는 "세션 관리" 상단 또는 세션별 배지에서 인박스를 엽니다.' },
      { title: '사유와 대상 확인', desc: '출석했는데 노쇼, 안 갔는데 출석, 취소 요청, 다른 사람과 바뀜, 기타 사유와 상세 메모를 확인합니다.' },
      { title: '승인 처리', desc: '자동 매핑되는 사유는 권장 상태가 선택됩니다. 필요하면 예약완료/출석/노쇼/취소 중 직접 골라 승인합니다.' },
      { title: '반려/메모', desc: '증빙이 부족하거나 운영 정책상 반영할 수 없으면 반려 메모를 남겨 닫습니다.' },
    ],
    tips: [
      '정정 승인으로 상태가 바뀌면 회차권 환원/차감도 기존 상태 변경 규칙에 따라 안전하게 처리됩니다.',
      '회원은 같은 예약에 처리 대기 중인 정정 요청을 1건만 보낼 수 있고, 필요하면 직접 철회할 수 있습니다.',
    ],
  },
  {
    id: 'members',
    icon: Users,
    title: '회원·로그인 지원',
    summary: '회원 정보, 권한, 비밀번호 문제, 중복 가입 혼선을 처리합니다.',
    steps: [
      { title: '회원 추가/검색', desc: '"회원 관리"에서 이름·연락처·이메일로 회원을 추가하고, 검색창으로 이름 또는 연락처 일부를 빠르게 찾습니다.' },
      { title: '활성/비활성·권한', desc: '비활성 회원은 로그인과 이용이 차단됩니다. 관리자 권한 부여/해제 시 기존 세션이 무효화될 수 있습니다.' },
      { title: '비밀번호 재설정 요청함', desc: '회원이 로그인 화면에서 "비밀번호 재설정 요청"을 남기면 "회원 관리" 상단 인박스에 표시됩니다. 승인하면 임시 비밀번호가 1회 표시됩니다.' },
      { title: '임시 비밀번호 전달', desc: '임시 비밀번호는 화면에서 한 번만 확인해 회원에게 안전한 채널로 전달합니다. 회원은 첫 로그인 직후 새 비밀번호로 강제 변경해야 합니다.' },
      { title: '직접 초기화', desc: '요청함을 거치지 않아도 회원 상세에서 임시 비밀번호를 재발급할 수 있습니다. 본인 관리자 계정은 직접 초기화할 수 없습니다.' },
    ],
    tips: [
      '회원가입에서 "이미 가입"이 보이면 새로 가입시키지 말고 로그인 또는 비밀번호 재설정 요청으로 안내하세요.',
      '비밀번호는 관리자도 볼 수 없습니다. 임시 비밀번호 발급 시 기존 로그인 세션은 즉시 만료됩니다.',
    ],
  },
  {
    id: 'passes',
    icon: Ticket,
    title: '수강권·결제 관리',
    summary: '상품, 발급, 결제 상태, 적용 범위를 관리합니다.',
    steps: [
      { title: '상품 관리', desc: '"수강권 관리 > 상품"에서 가격, 회차/기간, 판매 여부, 추천 여부, 설명/환불정책, 적용 세션 태그를 설정합니다.' },
      { title: '회원에게 발급', desc: '"발급"에서 회원·상품·시작일을 선택하면 만료일이 자동 계산됩니다. 운영상 할인/메모를 함께 기록할 수 있습니다.' },
      { title: '결제/상태 확인', desc: '미결제, 결제완료, 환불/정지/만료 상태를 필터링해 확인합니다. 잘못 발급한 수강권은 정지 처리하면 사용이 차단됩니다.' },
      { title: '차감 규칙', desc: '예약 또는 현장 출석 시 회차권은 1회 차감됩니다. 취소로 되돌릴 때는 환원되며, 노쇼는 환원되지 않는 패널티 상태입니다.' },
    ],
    tips: [
      '세션 태그를 사용하면 "이 상품은 특정 세션에만 사용 가능" 같은 정책을 더 정확하게 운영할 수 있습니다.',
      '만료 임박 또는 잔여 2회 이하 수강권은 대시보드에서도 확인해 미리 안내하세요.',
    ],
  },
  {
    id: 'tags-notices',
    icon: Tag,
    title: '세션 태그와 공지사항',
    summary: '상품 적용 범위와 회원 안내를 일관되게 관리합니다.',
    steps: [
      { title: '세션 태그 관리', desc: '"세션 태그"에서 태그를 만들고 세션/수강권 상품에 연결합니다. 전체 세션 상품은 전체 적용으로 설정합니다.' },
      { title: '공지 작성', desc: '"공지사항"에서 제목과 본문을 작성합니다. 전체 또는 특정 세션 유형/대상에게 안내할 수 있습니다.' },
      { title: '노출 확인', desc: '발행 후 회원 앱의 공지사항 메뉴와 알림 배지에 표시됩니다. 회원이 열람하면 읽음 처리됩니다.' },
    ],
    tips: [
      '장소 변경, 준비물, 우천 취소 등 당일 운영 변경은 공지 제목에 [긴급] 또는 [필수]를 붙이면 눈에 잘 띕니다.',
    ],
  },
  {
    id: 'stats-audit',
    icon: BarChart3,
    title: '통계와 감사 로그',
    summary: '운영 성과와 민감 작업 기록을 확인합니다.',
    steps: [
      { title: '통계 보기', desc: '"통계"에서 예약, 출석률, 노쇼, 수강권 매출, 신규 가입 흐름을 확인합니다.' },
      { title: '대시보드 알림', desc: '오늘 세션, 마감 임박 수강권, 잔여 부족 수강권, 출석/노쇼 미처리 세션을 빠르게 확인합니다.' },
      { title: '감사 로그', desc: '"감사 로그"에서 관리자 작업 이력을 확인합니다. 비밀번호/토큰/임시 비밀번호 등 민감 값은 저장·노출되지 않습니다.' },
    ],
    tips: [
      '출석률이 낮은 세션 유형은 정원, 시간대, 공지 방식, 노쇼 정책을 함께 점검하세요.',
      '데이터 백업·복원, 권한 변경, 대량 상태 변경 전에는 반드시 영향 범위를 확인하세요.',
    ],
  },
];

export default function Help() {
  return (
    <div className="max-w-[960px]">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle size={18} className="text-[var(--color-primary)]" />
          <h1 className="page-title">관리자 도움말</h1>
        </div>
        <p className="text-[13px] text-[var(--color-text-muted)]">
          현재 시스템 동작 기준으로 정리한 운영 매뉴얼입니다. 새로 추가된 현장 체크인, 정정 요청, 비밀번호 재설정 요청 흐름까지 포함합니다.
        </p>
      </div>

      <div className="bg-[var(--color-primary-bg)] border border-[var(--color-primary)]/20 rounded px-5 py-4 mb-6">
        <p className="text-[13px] text-[var(--color-text)] leading-relaxed">
          <strong>권장 운영 순서:</strong> ① 세션 태그/수강권 상품 준비 → ② 회원 등록·수강권 발급 또는 구매 안내 → ③ 세션 생성 → ④ 공지 등록 → ⑤ 현장 태블릿/QR 출석 체크 → ⑥ 정정 요청·통계 점검
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
          <Shield size={14} /> 운영상 주의사항
        </h3>
        <p className="text-[12.5px] text-[var(--color-text-secondary)] leading-relaxed">
          회원 비밀번호 원문은 확인할 수 없습니다. 임시 비밀번호는 발급 화면에서 한 번만 복사하고, 전달 후 회원이 즉시 변경하도록 안내하세요.
          예약/출석 상태를 수정하면 수강권 잔여 횟수와 통계가 함께 바뀔 수 있으므로 처리 전 대상 회원과 세션을 확인해주세요.
        </p>
      </div>
    </div>
  );
}
