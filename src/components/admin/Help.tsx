'use client';

import { LayoutDashboard, Calendar, Users, Ticket, QrCode, Megaphone, BarChart3, HelpCircle } from 'lucide-react';

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
    title: '처음 시작하기',
    summary: '클럽 운영을 시작하기 전, 이 순서대로 세팅하면 바로 사용할 수 있습니다.',
    steps: [
      { title: '회원 등록', desc: '"회원 관리" 메뉴에서 회원을 등록합니다. 이름·연락처만 있으면 가입이 완료됩니다.' },
      { title: '수강권 발급', desc: '"수강권 관리"에서 회원에게 수강권(회차권/시즌권/월권)을 발급합니다.' },
      { title: '세션 생성', desc: '"세션 관리"에서 이번 주·다음 주 세션을 만듭니다. 정기 세션은 반복 생성 기능을 이용하세요.' },
      { title: '공지 등록', desc: '"공지사항"에서 환영 메시지나 세션 안내를 올리면 회원들에게 즉시 노출됩니다.' },
    ],
    tips: [
      '최초 설정 시 회원 5명, 세션 3개, 수강권 3건부터 시작해 서비스에 익숙해진 후 확장하는 것을 권장합니다.',
    ],
  },
  {
    id: 'sessions',
    icon: Calendar,
    title: '세션 관리',
    summary: 'EBW·슬로우 롱런·마라톤 등 세션을 생성·수정·삭제합니다.',
    steps: [
      { title: '새 세션 추가', desc: '"세션 관리" 상단 "+ 세션 추가" 버튼을 클릭해 날짜·시간·정원·유형을 입력합니다.' },
      { title: '유형별 색상 구분', desc: 'EBW(오렌지) · 슬로우 롱런(파랑) · 마라톤(초록)으로 자동 색상이 적용됩니다.' },
      { title: '정원 관리', desc: '정원이 가득 차면 "모집 완료"로 자동 표시되고, 이후 신청자는 대기 등록됩니다.' },
      { title: '세션 메모', desc: '회원에게 공개할 메모(준비물·주의사항)를 작성하면 세션 상세 화면에 표시됩니다.' },
    ],
    tips: [
      '세션을 미리 여러 주 만들어 두면 회원들이 계획을 세우기 편합니다.',
      '취소된 세션은 삭제 대신 "취소" 상태로 변경해 기록을 남기세요.',
    ],
  },
  {
    id: 'members',
    icon: Users,
    title: '회원 관리',
    summary: '회원 가입 승인·정보 수정·활성 상태를 관리합니다.',
    steps: [
      { title: '회원 추가', desc: '"+ 회원 추가"로 수동 등록하거나, 회원이 직접 회원가입한 계정을 확인합니다.' },
      { title: '활성/비활성', desc: '탈퇴하거나 장기 휴면한 회원은 "비활성"으로 변경해 목록에서 정리할 수 있습니다.' },
      { title: '검색', desc: '상단 검색창에 이름 또는 연락처 일부를 입력해 빠르게 찾을 수 있습니다.' },
    ],
    tips: [
      '회원의 비밀번호는 직접 볼 수 없으니, 분실 시 회원이 재가입하거나 비밀번호 재설정을 요청하도록 안내하세요.',
    ],
  },
  {
    id: 'passes',
    icon: Ticket,
    title: '수강권 관리',
    summary: '수강권 상품을 등록하고 회원에게 발급합니다.',
    steps: [
      { title: '상품 탭', desc: '"수강권 관리 > 상품" 탭에서 EBW 10회권·시즌권 등 판매할 상품을 등록합니다.' },
      { title: '발급 탭', desc: '"발급" 탭에서 회원 → 상품 → 시작일을 선택해 발급합니다. 만료일은 자동 계산됩니다.' },
      { title: '잔여 관리', desc: '회원이 세션에 출석할 때마다 회차권은 1회씩 자동 차감됩니다. 수동 조정도 가능합니다.' },
    ],
    tips: [
      '실수로 잘못 발급한 수강권은 "정지" 처리하면 사용이 차단됩니다.',
      '만료 임박 수강권은 대시보드에 별도 표시되므로 회원에게 미리 안내하세요.',
    ],
  },
  {
    id: 'qr',
    icon: QrCode,
    title: '출석 QR',
    summary: '세션 현장에서 출석 QR 코드를 회원에게 보여줍니다.',
    steps: [
      { title: '세션 선택', desc: '"출석 QR"에서 오늘 진행하는 세션을 선택합니다.' },
      { title: 'QR 코드 표시', desc: '화면에 큰 QR 코드가 표시됩니다. 회원들이 각자 폰으로 스캔하면 자동 출석 처리됩니다.' },
      { title: '30초마다 갱신', desc: '보안을 위해 QR은 30초마다 자동으로 갱신됩니다.' },
    ],
    tips: [
      '모니터나 태블릿에 띄워두면 회원들이 편하게 스캔할 수 있습니다.',
      '스캔이 안 되는 회원은 "회원 관리"에서 수동으로 출석 체크를 할 수 있습니다.',
    ],
  },
  {
    id: 'notices',
    icon: Megaphone,
    title: '공지사항',
    summary: '전체 또는 특정 세션 유형의 회원에게 공지를 보냅니다.',
    steps: [
      { title: '공지 작성', desc: '"+ 공지 작성"으로 제목과 내용을 입력합니다.' },
      { title: '대상 선택', desc: 'EBW·슬로우 롱런·마라톤 중 해당 유형의 수강권을 가진 회원만 대상으로 지정할 수 있습니다.' },
      { title: '노출 확인', desc: '발행 후 회원 앱 사이드바와 상단 벨에 빨간 알림이 표시됩니다.' },
    ],
    tips: [
      '중요 공지는 제목에 [긴급], [필수] 같은 머리말을 붙이면 가독성이 좋아집니다.',
    ],
  },
  {
    id: 'stats',
    icon: BarChart3,
    title: '통계 보기',
    summary: '예약·출석·수강권 매출 현황을 한눈에 확인합니다.',
    steps: [
      { title: 'KPI 확인', desc: '상단 카드에서 총 예약·출석률·수강권 매출·신규 가입 현황을 볼 수 있습니다.' },
      { title: '세션 유형별 출석률', desc: 'EBW·슬로우 롱런·마라톤 각각의 출석/노쇼 비율을 확인합니다.' },
      { title: '주간 추이', desc: '최근 8주간 예약·출석·노쇼 추이를 차트로 볼 수 있습니다.' },
    ],
    tips: [
      '출석률이 떨어지는 유형이 있다면 해당 회원들에게 개별 공지로 동기 부여를 해보세요.',
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
          처음 운영을 시작하거나 특정 기능이 어떻게 동작하는지 확인할 때 참고하세요.
        </p>
      </div>

      <div className="bg-[var(--color-primary-bg)] border border-[var(--color-primary)]/20 rounded px-5 py-4 mb-6">
        <p className="text-[13px] text-[var(--color-text)] leading-relaxed">
          <strong>권장 운영 순서:</strong> ① 회원 등록 → ② 수강권 발급 → ③ 세션 생성 → ④ 공지 등록 → ⑤ 현장 QR 체크인
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
        <h3 className="text-[13.5px] font-semibold text-[var(--color-text)] mb-1">추가 지원이 필요하신가요?</h3>
        <p className="text-[12.5px] text-[var(--color-text-secondary)]">
          서비스 개선 제안이나 기술 문의는 시스템 관리자에게 연락해 주세요.
          데이터 백업·복원, 계정 권한 변경 등 민감한 작업은 반드시 백업 후 진행합니다.
        </p>
      </div>
    </div>
  );
}
