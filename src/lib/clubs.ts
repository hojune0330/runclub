// ─── 클럽 메타데이터 & 내 클럽 판별 유틸 ───
//
// 이 앱의 세션은 SessionType(=클럽/시리즈) 단위로 묶인다.
// 실제 운영 정보(2026 기준, 여의도공원 문화의마당):
//   - slowrun  : 슬로우롱런클럽 (런클럽)  · 매주 수 · 금 저녁 7:30
//   - marathon : 러닝 클래스               · 매주 화 · 토
//   - ebw      : EBW 러닝 (보조 시리즈)     · 일정은 세션 캘린더 기준
//
// ⚠️ 운영 메모: 과거 메타데이터(올림픽공원/송파/잠실 등)는 창작용 더미였고,
//   현재 값은 운영진이 확인한 실제 정보다. 클럽 구성이 더 정리되면
//   이 한 곳(CLUBS)만 수정하면 회원 홈 전체에 반영된다.
//
// 회원 홈은 위 클럽 중 "내 클럽"(= 소속된 클럽) 목록을 먼저 보여주고,
// 각 클럽 카드에 진입하면 예약/출석/수강권 등 그 클럽에 초점을 맞춘
// 액션만 모아서 보여준다.

import type { MemberPass, Reservation, Session, SessionType } from '@/types';

export interface ClubMeta {
  type: SessionType;
  name: string;       // 정식 명칭
  short: string;      // 짧은 태그 (리스트에서 표기)
  dayLabel: string;   // 예: "매주 월요일"
  timeLabel: string;  // 예: "19:00 / 20:00 / 21:00"
  place: string;      // 운영 장소
  summary: string;    // 한 줄 설명
  heroEmoji: string;  // 카드 아이콘 (이모지 폴백)
  color: string;      // 아이덴티티 컬러 (sessionTypeConfig 와 동일)
  bgColor: string;    // 카드 바탕
  textColor: string;  // 타이틀 컬러
}

export const CLUBS: Record<SessionType, ClubMeta> = {
  slowrun: {
    type: 'slowrun',
    name: '슬로우롱런클럽',
    short: '런클럽',
    dayLabel: '매주 수 · 금요일',
    timeLabel: '저녁 7:30 (7:30 워밍업 · 7:40 출발)',
    place: '여의도공원 문화의마당',
    summary: '편안한 페이스로 함께 달리는 런클럽. 초보자도 부담 없이 참여할 수 있어요.',
    heroEmoji: '🌳',
    color: '#3b82f6',
    bgColor: '#eff6ff',
    textColor: '#1d4ed8',
  },
  marathon: {
    type: 'marathon',
    name: '러닝 클래스',
    short: '러닝클래스',
    dayLabel: '매주 화 · 토요일',
    timeLabel: '세션 일정 기준',
    place: '여의도공원 문화의마당',
    summary: '주법·페이스 향상에 초점을 맞춘 러닝 클래스. 단계별로 함께 성장해요.',
    heroEmoji: '🏅',
    color: '#10b981',
    bgColor: '#ecfdf5',
    textColor: '#065f46',
  },
  ebw: {
    type: 'ebw',
    name: 'EBW 러닝',
    short: 'EBW',
    dayLabel: '세션 일정 참고',
    timeLabel: '세션 일정 기준',
    place: '여의도공원 일대',
    summary: '보조 러닝 시리즈. 세부 일정은 세션 캘린더에서 확인해주세요.',
    heroEmoji: '🏃‍♀️',
    color: '#f97316',
    bgColor: '#fff7ed',
    textColor: '#c2410c',
  },
};

// 표시 우선순위: 메인 클럽(런클럽)을 먼저, 그 다음 러닝 클래스, EBW 순.
export const ALL_CLUB_TYPES: SessionType[] = ['slowrun', 'marathon', 'ebw'];

// ─────────────────────────────────────────────────────────
// 내 클럽 판별 로직
// ─────────────────────────────────────────────────────────
//
// 우선순위 (합집합으로 계산, 중복 없이):
//   1) 활성(active) 수강권의 applicableSessions
//      - 'all' 이면 모든 클럽 소속으로 간주
//      - 배열이면 배열의 각 타입이 소속
//   2) 최근 180일 내 attended/reserved 상태로 참여한 세션의 type
//
// 어느 것도 없으면 "아직 소속 없음" → UI 는 "둘러보기" 상태로 표시.
export interface ClubMembership {
  type: SessionType;
  /** 이 클럽에 매칭된 활성 수강권 (없으면 undefined) */
  pass?: MemberPass;
  /** 수강권 기반 소속 여부 */
  fromPass: boolean;
  /** 최근 참석(또는 예약) 이력 기반 소속 여부 */
  fromHistory: boolean;
}

export interface ClubStats {
  /** 해당 클럽에 대한 내 활성 수강권 목록 */
  passes: MemberPass[];
  /** 해당 클럽의 앞으로 남은 내 예약 수 */
  upcomingCount: number;
  /** 해당 클럽의 앞으로 남은 공개 세션 수(전체) */
  openSessionCount: number;
  /** 해당 클럽의 최근 출석 횟수 (지난 180일) */
  recentAttended: number;
}

/**
 * 회원의 "내 클럽" 목록을 반환한다.
 * - pass + history 합집합
 * - 존재하는 클럽만(= CLUBS 에 정의된 3종 중 일부)
 */
export function getMyClubs(
  myPasses: MemberPass[],
  myReservations: Reservation[],
  sessions: Session[],
  opts?: { historyWindowDays?: number }
): ClubMembership[] {
  const historyDays = opts?.historyWindowDays ?? 180;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - historyDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const matched = new Map<SessionType, ClubMembership>();

  // 1) 활성 수강권
  for (const p of myPasses) {
    if (p.status !== 'active') continue;
    const targets: SessionType[] =
      p.applicableSessions === 'all'
        ? ALL_CLUB_TYPES
        : (p.applicableSessions as SessionType[]);
    for (const t of targets) {
      if (!CLUBS[t]) continue;
      const prev = matched.get(t);
      matched.set(t, {
        type: t,
        pass: prev?.pass ?? p,
        fromPass: true,
        fromHistory: prev?.fromHistory ?? false,
      });
    }
  }

  // 2) 최근 history
  for (const r of myReservations) {
    if (r.status !== 'attended' && r.status !== 'reserved') continue;
    const s = r.session ?? sessions.find(s => s.id === r.sessionId);
    if (!s) continue;
    if (s.date < cutoffIso) continue;
    if (!CLUBS[s.type]) continue;
    const prev = matched.get(s.type);
    matched.set(s.type, {
      type: s.type,
      pass: prev?.pass,
      fromPass: prev?.fromPass ?? false,
      fromHistory: true,
    });
  }

  // 표시 우선순위(slowrun → marathon → ebw)로 정렬
  return ALL_CLUB_TYPES
    .map(t => matched.get(t))
    .filter((m): m is ClubMembership => !!m);
}

/** 특정 클럽의 회원 맞춤 통계(카드/허브 화면 숫자 뱃지에 사용) */
export function getClubStats(
  type: SessionType,
  myPasses: MemberPass[],
  myReservations: Reservation[],
  sessions: Session[],
  todayIso: string,
  opts?: { recentWindowDays?: number }
): ClubStats {
  const recentDays = opts?.recentWindowDays ?? 180;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - recentDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const passes = myPasses.filter(
    p =>
      p.status === 'active' &&
      (p.applicableSessions === 'all' ||
        (p.applicableSessions as SessionType[]).includes(type))
  );

  const upcomingCount = myReservations.filter(r => {
    if (r.status !== 'reserved') return false;
    const s = r.session ?? sessions.find(s => s.id === r.sessionId);
    return !!s && s.type === type && s.date >= todayIso;
  }).length;

  const openSessionCount = sessions.filter(
    s => s.type === type && s.status !== 'cancelled' && s.date >= todayIso
  ).length;

  const recentAttended = myReservations.filter(r => {
    if (r.status !== 'attended') return false;
    const s = r.session ?? sessions.find(s => s.id === r.sessionId);
    return !!s && s.type === type && s.date >= cutoffIso;
  }).length;

  return { passes, upcomingCount, openSessionCount, recentAttended };
}
