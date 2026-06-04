/**
 * 코칭 플랫폼 정책 단일 소스(Single Source of Truth).
 *
 * 마일리지 적립 규칙, 혈당(건강) 가드레일, 외부 데이터 연동 안내를
 * "구조화된 데이터"로 한 곳에 모아둔다. 회원 화면 / 관리자 화면 /
 * 클래스 소개·구매 화면 어디서든 이 데이터를 import 해서 동일하게
 * 보여줄 수 있도록 한다. (정책이 바뀌면 여기 한 곳만 고치면 전 화면 반영)
 *
 * ⚠️ 이 파일은 클라이언트 컴포넌트에서도 import 되므로 서버 전용 모듈
 *    (pg/db/discount 등)을 import 하면 안 된다. 따라서 마일리지 수치는
 *    여기서 별도 상수(COACHING_MILEAGE)로 정의한다.
 *    src/lib/discount.ts 의 COACHING_MILEAGE 와 "반드시 동일"해야 한다.
 *    (정책 숫자를 바꿀 땐 두 파일을 함께 수정)
 */

/** 마일리지 적립 수치 — discount.ts 의 COACHING_MILEAGE 와 동일하게 유지 */
export const COACHING_MILEAGE = {
  ACTIVITY: 10,
  LONG_RUN: 20,
  HOMEWORK_VERIFIED: 30,
  ACTIVITY_DAILY_CAP: 2,
  LONG_RUN_M: 10000,
} as const;

/* ────────────────────────────────────────────────────────────
 * 1) 마일리지 적립 규칙
 * ──────────────────────────────────────────────────────────── */

export interface MileageRule {
  id: string;
  /** lucide-react 아이콘 이름(컴포넌트에서 매핑) */
  icon: 'Footprints' | 'Route' | 'ClipboardCheck';
  title: string;
  points: number;
  /** "+10P" 처럼 화면에 바로 쓸 표시 문자열 */
  pointsLabel: string;
  /** 한 줄 요약 (카드/배지) */
  summary: string;
  /** 자세한 설명 (모달/안내문) */
  detail: string;
  /** 적립 조건/한도 칩 */
  conditions: string[];
}

export const MILEAGE_RULES: MileageRule[] = [
  {
    id: 'activity',
    icon: 'Footprints',
    title: '활동 기록',
    points: COACHING_MILEAGE.ACTIVITY,
    pointsLabel: `+${COACHING_MILEAGE.ACTIVITY}P`,
    summary: '운동/건강 활동을 1건 기록할 때마다',
    detail:
      '러닝·걷기·건강 측정 등 활동을 기록하면 적립됩니다. 꾸준한 기록 습관을 응원하기 위한 기본 적립이에요.',
    conditions: [
      `1건당 +${COACHING_MILEAGE.ACTIVITY}P`,
      `하루 최대 ${COACHING_MILEAGE.ACTIVITY_DAILY_CAP}건까지 적립`,
    ],
  },
  {
    id: 'long_run',
    icon: 'Route',
    title: '롱런 보너스',
    points: COACHING_MILEAGE.LONG_RUN,
    pointsLabel: `+${COACHING_MILEAGE.LONG_RUN}P`,
    summary: `${(COACHING_MILEAGE.LONG_RUN_M / 1000).toFixed(0)}km 이상 한 번에 달릴 때`,
    detail:
      `한 번의 활동에서 ${(COACHING_MILEAGE.LONG_RUN_M / 1000).toFixed(0)}km 이상 누적되면 활동 적립에 더해 보너스가 추가됩니다. 장거리 도전을 더 크게 보상해요.`,
    conditions: [
      `${(COACHING_MILEAGE.LONG_RUN_M / 1000).toFixed(0)}km 이상 1건당 +${COACHING_MILEAGE.LONG_RUN}P`,
      '활동 적립과 별도로 추가 지급',
    ],
  },
  {
    id: 'homework_verified',
    icon: 'ClipboardCheck',
    title: '과제 완료',
    points: COACHING_MILEAGE.HOMEWORK_VERIFIED,
    pointsLabel: `+${COACHING_MILEAGE.HOMEWORK_VERIFIED}P`,
    summary: '코치가 과제 달성을 확인하면',
    detail:
      '제출한 과제를 코치가 검증(확인)하면 적립됩니다. 목표를 향한 실제 실행을 가장 크게 보상하는 적립이에요.',
    conditions: [
      `검증 완료 1건당 +${COACHING_MILEAGE.HOMEWORK_VERIFIED}P`,
      '코치 확인 후 자동 지급',
    ],
  },
];

/** 마일리지 사용처/성격 안내(짧은 문구) */
export const MILEAGE_USAGE_NOTE =
  '적립한 마일리지는 수강권·패스 결제 시 할인으로 사용할 수 있어요.';

/* ────────────────────────────────────────────────────────────
 * 2) 건강(혈당) 가드레일 — 비의료 안내
 * ──────────────────────────────────────────────────────────── */

/** 일반 성인 식후 권장 목표 범위(비의료 일반 가이드라인) */
export const GLUCOSE_TARGET = {
  /** 목표 범위 하한 (mg/dL) */
  LOW: 70,
  /** 목표 범위 상한 (mg/dL) */
  HIGH: 180,
  unit: 'mg/dL',
} as const;

export const GLUCOSE_TARGET_LABEL = `${GLUCOSE_TARGET.LOW}–${GLUCOSE_TARGET.HIGH} ${GLUCOSE_TARGET.unit}`;

export interface GuardrailPoint {
  icon: 'ShieldCheck' | 'Percent' | 'EyeOff' | 'HeartPulse';
  title: string;
  text: string;
}

/**
 * 혈당/건강 클래스 가드레일.
 * 핵심 원칙: ① 진단·처방 아님(비의료) ② 리더보드는 "목표 범위 내 비율 %"만 노출,
 * 원시 수치는 공유하지 않음 ③ 데이터는 동기 부여/습관 형성 용도.
 */
export const GLUCOSE_GUARDRAILS: GuardrailPoint[] = [
  {
    icon: 'ShieldCheck',
    title: '의료 행위가 아니에요',
    text: '본 클래스의 정보와 수치는 건강한 습관 형성을 돕기 위한 일반 안내이며, 질병의 진단·치료·처방을 대체하지 않습니다. 증상이 있거나 치료 중이라면 반드시 전문의와 상담하세요.',
  },
  {
    icon: 'Percent',
    title: '리더보드는 “범위 내 비율”만 공유',
    text: `다른 참가자에게는 측정한 혈당 수치가 절대 공개되지 않아요. 오직 목표 범위(${GLUCOSE_TARGET_LABEL}) 안에 든 측정 비율(%)만 순위에 반영됩니다.`,
  },
  {
    icon: 'EyeOff',
    title: '원시 수치는 본인만',
    text: '내가 입력한 혈당·체성분 등 상세 값은 나와 담당 코치만 볼 수 있어요. 동료 피드에는 공유 여부를 직접 선택할 수 있습니다.',
  },
  {
    icon: 'HeartPulse',
    title: '목적은 “꾸준함”',
    text: '높낮이를 경쟁하기보다, 목표 범위 안에서 안정적으로 유지하는 습관을 함께 만드는 데 초점을 둡니다.',
  },
];

/** 혈당 목표 범위 한 줄 안내(짧은 배지용) */
export const GLUCOSE_GUARDRAIL_SHORT = `리더보드는 목표 범위(${GLUCOSE_TARGET_LABEL}) 내 비율(%)만 공유 · 수치 비공개 · 비의료 안내`;

/* ────────────────────────────────────────────────────────────
 * 3) 외부 데이터 연동(P4) 안내
 * ──────────────────────────────────────────────────────────── */

export type IntegrationStatus = 'available' | 'coming_soon';

export interface IntegrationProvider {
  /** ActivitySource 와 매핑되는 키 */
  id: 'manual' | 'strava' | 'garmin' | 'apple_health' | 'samsung_health' | 'barojaenfit_api' | 'libre_cgm';
  name: string;
  /** 짧은 카테고리(러닝/건강/혈당) */
  category: 'run' | 'health' | 'glucose';
  status: IntegrationStatus;
  desc: string;
  /** 브랜드 컬러(점/배지) */
  color: string;
}

/**
 * 연동 제공자 목록.
 * 설계 원칙 "지금은 수동, 나중은 자동": 모든 데이터는 activity_logs.source 로 통합.
 * 자동 연동이 열리면 status 만 'available' 로 바꾸면 됩니다.
 */
export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  {
    id: 'manual',
    name: '직접 입력',
    category: 'run',
    status: 'available',
    desc: '거리·시간·심박 등을 직접 기록해요. 지금 바로 사용할 수 있어요.',
    color: '#0ea5e9',
  },
  {
    id: 'strava',
    name: 'Strava',
    category: 'run',
    status: 'coming_soon',
    desc: '러닝/사이클 기록을 자동으로 불러와요.',
    color: '#fc4c02',
  },
  {
    id: 'garmin',
    name: 'Garmin',
    category: 'run',
    status: 'coming_soon',
    desc: '가민 워치의 운동·심박 데이터를 동기화해요.',
    color: '#007cc3',
  },
  {
    id: 'apple_health',
    name: 'Apple 건강',
    category: 'health',
    status: 'coming_soon',
    desc: 'iPhone·Apple Watch의 건강 데이터를 가져와요.',
    color: '#ff2d55',
  },
  {
    id: 'samsung_health',
    name: 'Samsung Health',
    category: 'health',
    status: 'coming_soon',
    desc: '삼성 헬스의 걸음·운동·수면 데이터를 가져와요.',
    color: '#1428a0',
  },
  {
    id: 'libre_cgm',
    name: '연속혈당측정(CGM)',
    category: 'glucose',
    status: 'coming_soon',
    desc: 'FreeStyle Libre 등 연속혈당 데이터를 안전하게 연동해요.',
    color: '#ffd400',
  },
  {
    id: 'barojaenfit_api',
    name: 'BaroJaenfit',
    category: 'health',
    status: 'coming_soon',
    desc: '체성분·건강 측정 결과를 자동으로 가져와요.',
    color: '#22c55e',
  },
];

export const INTEGRATION_PRINCIPLE_NOTE =
  '지금은 직접 입력으로 시작하고, 자동 연동(Strava·Garmin·Apple·Samsung 등)은 순차적으로 열립니다. 어떤 방식으로 들어온 기록이든 동일하게 리더보드·마일리지에 반영돼요.';

/* ────────────────────────────────────────────────────────────
 * 4) 클래스 종류별 "이런 분께 좋아요" 소개(구매 화면용)
 * ──────────────────────────────────────────────────────────── */

export interface ClassKindIntro {
  tagline: string;
  forWhom: string[];
  /** 이 종류에서 주로 쓰는 지표 */
  primaryMetric: string;
}

export const CLASS_KIND_INTRO: Record<string, ClassKindIntro> = {
  marathon: {
    tagline: '목표 대회를 향해, 누적 거리로 함께 달려요',
    forWhom: ['풀·하프 마라톤을 준비하는 분', '꾸준한 러닝 습관을 만들고 싶은 분'],
    primaryMetric: '누적 거리',
  },
  hyrox: {
    tagline: '근력 + 지구력, 종목별 기록을 함께 관리해요',
    forWhom: ['HYROX·기능성 운동 대회 준비', '복합 체력을 끌어올리고 싶은 분'],
    primaryMetric: '과제 달성률',
  },
  glucose: {
    tagline: '혈당을 “목표 범위”에서 안정적으로 — 습관 중심',
    forWhom: ['식후 혈당 관리를 시작하려는 분', '생활 습관으로 컨디션을 잡고 싶은 분'],
    primaryMetric: '혈당 목표 범위 비율',
  },
  health: {
    tagline: '체성분·생활 습관을 데이터로 꾸준히 관리해요',
    forWhom: ['체중·체성분 변화를 추적하고 싶은 분', '건강 루틴을 만들고 싶은 분'],
    primaryMetric: '출석·과제 달성률',
  },
  pt: {
    tagline: '1:1 맞춤 코칭으로 나만의 목표에 집중해요',
    forWhom: ['개인 맞춤 지도가 필요한 분', '특정 목표(자세·기록)를 빠르게 잡고 싶은 분'],
    primaryMetric: '과제 달성률',
  },
  custom: {
    tagline: '목표에 맞춰 자유롭게 구성하는 클래스',
    forWhom: ['그룹 목표를 함께 정하고 싶은 분'],
    primaryMetric: '코치 설정 지표',
  },
};
