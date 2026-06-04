# 코칭 플랫폼 확장 기획서 (Activity · Team · Homework · Leaderboard)

> 상태: **기획 확정 대기 → Phase 1 착수 준비**
> 작성 기준: 현행 코드베이스(Next.js App Router + PostgreSQL `pg`, 태그/마일리지/등급 인프라 보유)
> 목적: "예약·출석·수강권" 운영 도구 → **데이터 기반 목표 지향 코칭 플랫폼**으로 확장

---

## 0. 확정된 방향 (사용자 결정 반영)

| 항목 | 결정 | 설계 반영 |
|---|---|---|
| **a. 러닝 데이터 연동** | 다 구현 가능하면 다 구현. 어렵지 않은 것부터. | **Strava OAuth 우선 + 어느 기기든 쓰는 수동 입력 백업.** 가민/애플/삼성은 "소스(source) 필드"로 미리 구조화 → 나중에 API 붙이면 자동 채움. |
| **b. 9.5일 주기화** | 본인(코치)이 개발한 것 → **나중에 직접 구현**. | DB·UI에 **주기화 슬롯만 비워둠**(planning_protocol 자리). 지금은 만들지 않음. |
| **c. 바로잰핏(BaroJaenfit)** | 사용자가 자문/앰버서더. **지금은 사용자가 최대한 많이 입력**, 나중에 API로 자동화. | **수동 입력 우선 + `source='barojaenfit_manual'` 태깅.** 나중에 API 붙이면 같은 테이블에 `source='barojaenfit_api'`로 자동 적재. |
| **핵심 가치** | 마라톤·하이록스 등 **목표 지향 수업**의 **과제(숙제) 관리 + 거리/목표 리더보드 공유**가 최우선. | Phase 1을 **활동기록 + 리더보드 + 과제**에 집중. |

**설계 제1원칙 — "지금은 수동, 나중은 자동":**
모든 외부 데이터(러닝·혈당·체성분 등)는 **단일 `activity_*` 스키마에 `source` 필드로 출처를 구분**해 저장한다.
- 지금: `source = 'manual'` (사용자 입력) / `'strava'` (Strava 연동)
- 나중: `'garmin'`, `'apple_health'`, `'samsung_health'`, `'barojaenfit_api'`, `'libre_cgm'` 등 추가만 하면 됨.
- → UI·리더보드·코치 화면은 source를 신경 쓰지 않고 동작. 연동이 추가돼도 **하위 화면 변경 없음.**

---

## 1. 도메인 모델 개요

```
Class(수업/코호트)  ── 목표 지향 수업의 단위 (마라톤 풀코스반, 하이록스반, 혈당관리반…)
  │   * 기존 Session(개별 회차)과 별개. 여러 Session을 묶는 "기간제 프로그램".
  │   * 코치가 생성, 참가자 모집, 시작~종료일 보유.
  │
  ├─ Team(팀/조)            ── 클래스 내부를 임의로 구획 (초보반/중급반/풀코스반)
  │     * 코치 또는 참가자가 만들 수 있음. 리더보드/비교 단위.
  │
  ├─ Enrollment(수강 등록)   ── member ↔ class ↔ team 연결
  │
  ├─ Homework(과제/숙제)     ── 코치가 내는 주간/회차 과제 (예: "이번 주 누적 20km")
  │     └─ HomeworkSubmission ── 참가자 제출/달성 기록
  │
  ├─ ActivityLog(활동 기록)  ── 러닝/걷뛰/혈당/체성분 등 모든 측정 데이터의 단일 저장소
  │     * source 로 출처 구분 (manual / strava / garmin / barojaenfit_api …)
  │     * kind 로 종류 구분 (run / walk_run / glucose / body_comp / fasting …)
  │
  ├─ Leaderboard(리더보드)   ── ActivityLog + Homework 집계 (테이블 아님, 쿼리 뷰)
  │     * 팀별 / 클래스별 / 기간별 거리·마일리지·달성률 랭킹
  │
  └─ Encouragement(응원)     ── 기록/제출에 대한 좋아요·댓글(응원) (서로 공유·응원 시스템)
```

---

## 2. 데이터 스키마 (PostgreSQL, 신규 테이블)

> 모든 신규 테이블은 `ensureSchema()` 내 신규 함수 `initCoachingSchema()`로 idempotent 생성.
> 기존 `members`, `sessions`, `member_passes`, `session_tags` 와 FK로 연결.

### 2.1 classes — 목표 지향 수업(코호트)
```sql
CREATE TABLE IF NOT EXISTS classes (
  id            TEXT PRIMARY KEY,         -- cls_xxx
  name          TEXT NOT NULL,            -- "2026 봄 마라톤 풀코스반"
  kind          TEXT NOT NULL,            -- 'marathon' | 'hyrox' | 'glucose' | 'health' | 'pt' | 'custom'
  goal_summary  TEXT,                     -- "서울마라톤 sub-4 완주"
  coach_id      TEXT REFERENCES members(id),
  start_date    DATE,
  end_date      DATE,
  status        TEXT NOT NULL DEFAULT 'active', -- active | finished | archived
  tag_id        TEXT REFERENCES session_tags(id), -- 어떤 세션 태그와 연결되는지(선택)
  metric_focus  TEXT NOT NULL DEFAULT 'distance', -- 리더보드 기본 지표: distance|mileage|attendance|homework|glucose_in_range
  cover_image_url TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.2 class_teams — 팀/조 (1-2 팀 구현)
```sql
CREATE TABLE IF NOT EXISTS class_teams (
  id          TEXT PRIMARY KEY,           -- team_xxx
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,              -- "초보반" / "중급반" / "풀코스반"
  color       TEXT,                       -- 리더보드 색상
  created_by  TEXT REFERENCES members(id),-- 코치 또는 참가자
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.3 class_enrollments — 수강 등록 (member ↔ class ↔ team)
```sql
CREATE TABLE IF NOT EXISTS class_enrollments (
  id          TEXT PRIMARY KEY,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  team_id     TEXT REFERENCES class_teams(id) ON DELETE SET NULL, -- 미배정 가능
  role        TEXT NOT NULL DEFAULT 'member',  -- member | coach
  goal_text   TEXT,                       -- 개인 목표 ("10월 풀코스 완주")
  goal_target NUMERIC,                     -- 정량 목표 (예: 누적 200km)
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT NOT NULL DEFAULT 'active',  -- active | dropped | finished
  UNIQUE (class_id, member_id)
);
```

### 2.4 activity_logs — 모든 측정 데이터의 단일 저장소 (a · c 공통)
```sql
CREATE TABLE IF NOT EXISTS activity_logs (
  id            TEXT PRIMARY KEY,         -- act_xxx
  member_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  class_id      TEXT REFERENCES classes(id) ON DELETE SET NULL, -- 연결된 수업(선택)
  kind          TEXT NOT NULL,            -- run | walk_run | long_run | interval
                                          --  | glucose | body_comp | fasting | weight | custom
  source        TEXT NOT NULL DEFAULT 'manual',
                                          -- manual | strava | garmin | apple_health
                                          --  | samsung_health | barojaenfit_manual | barojaenfit_api | libre_cgm
  source_ref    TEXT,                     -- 외부 활동 id (Strava activity id 등) — 중복 적재 방지
  activity_date DATE NOT NULL,
  -- 러닝 지표 (kind = run 류)
  distance_m    INTEGER,                  -- 미터
  duration_s    INTEGER,                  -- 초
  avg_pace_s    INTEGER,                  -- 초/km
  elevation_m   INTEGER,
  avg_hr        INTEGER,
  -- 건강 지표 (kind = glucose/body_comp/fasting…) — 유연하게 JSONB
  metrics       JSONB,                    -- { glucose_mgdl, fasting_hours, body_fat_pct, weight_kg, ... }
  note          TEXT,
  photo_url     TEXT,                     -- 인증샷(스트라바 캡처/측정기 사진)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, source, source_ref)  -- 같은 외부 기록 중복 방지(source_ref NULL이면 미적용)
);
CREATE INDEX IF NOT EXISTS idx_activity_member_date ON activity_logs(member_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_activity_class ON activity_logs(class_id);
```

### 2.5 homeworks — 과제/숙제 (목표 지향 수업 핵심)
```sql
CREATE TABLE IF NOT EXISTS homeworks (
  id            TEXT PRIMARY KEY,         -- hw_xxx
  class_id      TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,            -- "이번 주 누적 20km"
  description   TEXT,
  metric        TEXT NOT NULL,            -- distance | count | duration | checkin | freeform
  target_value  NUMERIC,                  -- 20000(m) 등. freeform이면 NULL
  period_start  DATE,
  period_end    DATE,
  created_by    TEXT REFERENCES members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id            TEXT PRIMARY KEY,
  homework_id   TEXT NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  member_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- 자동 집계(activity_logs 합산) 또는 수동 제출 둘 다 지원
  achieved_value NUMERIC,                 -- 실제 달성치 (자동/수동)
  status        TEXT NOT NULL DEFAULT 'submitted', -- submitted | verified | rejected
  note          TEXT,
  photo_url     TEXT,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (homework_id, member_id)
);
```

### 2.6 encouragements — 응원(좋아요/댓글)
```sql
CREATE TABLE IF NOT EXISTS encouragements (
  id          TEXT PRIMARY KEY,
  member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE, -- 응원한 사람
  target_type TEXT NOT NULL,              -- activity | homework_submission
  target_id   TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'cheer', -- cheer(👏) | fire(🔥) | comment
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_encouragement_target ON encouragements(target_type, target_id);
```

### 2.7 (자리만 비워둠) planning_protocols — b. 9.5일 주기화
```sql
-- 사용자가 직접 개발 예정. 지금은 생성하지 않거나, 빈 골격만.
-- Phase 후순위. 확정 후 별도 PR.
```

---

## 3. 마일리지 연동 (기존 인프라 재사용)

이미 `mileage_log`, `members.mileage_balance` 가 존재.
- **활동/과제 달성 시 마일리지 적립** 규칙을 추가:
  - 러닝 활동 기록 1건 → +N 마일리지
  - 과제 달성(verified) → +M 마일리지
  - 출석(기존) → 기존 규칙 유지
- 적립은 `mileage_log` 에 `reason = 'activity'|'homework'` 로 기록 → **리더보드의 "마일리지" 지표**와 일관.

---

## 4. 리더보드 설계 (테이블 아님, 집계 쿼리)

`metric_focus` 에 따라 클래스/팀별 랭킹을 동적 계산:

| metric | 집계식 |
|---|---|
| `distance` | 기간 내 `SUM(activity_logs.distance_m)` |
| `mileage` | 기간 내 `SUM(mileage_log.amount WHERE amount>0)` |
| `attendance` | 기간 내 `COUNT(reservations.status='attended')` |
| `homework` | `달성 과제 수 / 전체 과제 수` (달성률) |
| `glucose_in_range` | 혈당반: 목표 범위 내 측정 비율 |

- **팀별 비교**: `class_enrollments.team_id` 로 GROUP BY → 팀 평균/합계 막대 비교.
- **개인 랭킹**: 멤버별 정렬 + 본인 하이라이트.
- 프라이버시: 클래스 단위 옵트인(코치가 "리더보드 공개" 토글). 혈당 등 민감지표는 **수치 노출 대신 "범위 내 %"** 같은 가공값만 공개.

---

## 5. 외부 연동 추상화 (a · c 미래 대비)

`src/lib/integrations/` 디렉터리 신설 (Phase 2):
```
integrations/
  types.ts          -- NormalizedActivity 인터페이스 (모든 소스 공통 형태)
  strava.ts         -- Strava OAuth + activity fetch → NormalizedActivity[]
  manual.ts         -- 수동 입력 폼 → NormalizedActivity
  barojaenfit.ts    -- (스텁) 지금은 수동, 나중에 API
  index.ts          -- source → adapter 매핑
```
- 모든 어댑터는 `NormalizedActivity` 로 변환 후 **동일한 `activity_logs` insert 함수** 사용.
- → Strava든 가민이든 바로잰핏이든 **insert 경로 1개**. 화면은 안 바뀜.

### Strava OAuth 메모 (Phase 2)
- `members` 에 `strava_athlete_id`, 토큰은 별도 `oauth_tokens` 테이블(암호화 권장).
- env: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`.
- 웹훅으로 신규 활동 자동 적재 가능(후순위). 초기엔 "연동 후 동기화 버튼" 수동 pull.

---

## 6. 알림/반응형 (2번 — 건강 클래스 알림)

기존 `push-subscribe` + 알림 인프라 재사용.
- **단식 알림 / 측정 리마인더**: `class` 또는 `homework` 단위 스케줄 알림.
- **칼로리 계산**: 클라이언트 계산(공식: Mifflin-St Jeor 등) → 결과를 `activity_logs(kind='custom', metrics)` 저장.
- 반응형: 기존 디자인 토큰/모바일 bottomNav 패턴 그대로 따름.
- **법적 톤 가드**: "관리·코칭 보조" 문구만 사용. "진단·치료" 표현 금지(의료광고 규제 회피).

---

## 7. 단계별 로드맵 (PR 단위)

| Phase | 범위 | 산출물 | 난이도 |
|---|---|---|---|
| **P1. 코어 스키마 + 클래스/팀/등록** | classes, class_teams, class_enrollments + 코치 CRUD + 회원 가입 | DB + API + 어드민/회원 기본 UI | ★★ |
| **P2. 활동 기록 (수동) + 과제 + 응원** | activity_logs(manual), homeworks, submissions, encouragements | 활동 입력 폼, 과제 카드, 응원 버튼 | ★★ |
| **P3. 리더보드** | 거리/마일리지/출석/과제 달성률 랭킹, 팀 비교 | 집계 쿼리 + 리더보드 화면 | ★★ |
| **P4. Strava 연동** | OAuth + activity pull → activity_logs(strava) | integrations/strava.ts + 동기화 | ★★★ |
| **P5. 건강 클래스(혈당/단식)** | glucose/body_comp/fasting + 알림/칼로리 | 측정 입력 + 알림 + 가공 리더보드 | ★★★ |
| **P6. 바로잰핏 API / 가민·애플·삼성** | source 어댑터 추가 | adapter만 추가, 하위 무변경 | (API 확보 후) |
| **P-b. 9.5일 주기화** | 사용자 직접 개발 → 슬롯에 통합 | planning_protocols | (보류) |

→ **권장 착수 순서: P1 → P2 → P3** (목표 지향 수업의 과제+리더보드라는 핵심 가치를 가장 먼저 완성).
→ P4(Strava)는 핵심 UX가 검증된 뒤 붙여도 화면 변경이 없음(추상화 덕분).

---

## 8. 기존 코드와의 정합성 / 마이그레이션

- `SessionType` enum 은 이미 "태그 시스템으로 이행 중(PR-C 시리즈)". `classes.kind` 는 enum 이 아니라 **자유 문자열 + 태그 연결**로 가서 확장성 확보.
- 신규 테이블은 전부 `IF NOT EXISTS` + `ensureSchema()` 싱글톤 경로로 생성 → 배포만 하면 자동 마이그레이션.
- 리더보드/응원은 **클래스 옵트인** 이므로 기존 일반 회원 경험에는 영향 없음.

---

## 9. 미해결 / 추가 확정 필요 (착수 전 체크)

- [ ] **P1 회원 UI 위치**: 회원 앱 사이드바에 "내 클래스" 그룹 신설? (기존 navGroups에 추가)
- [ ] **팀 생성 권한**: 코치만? 참가자도 자유 생성? → 스키마는 둘 다 허용, **정책만 결정** 필요.
- [ ] **혈당 수치 공개 범위**: 리더보드에 실수치 금지(범위 % 만) 확정.
- [ ] **마일리지 적립률**: 활동 1건 = ? P / 과제 달성 = ? P (운영 정책).
- [ ] **바로잰핏 데이터 항목**: 사용자가 "최대한 많이 입력"할 필드 목록 — 바로잰핏에서 어떤 값을 측정하는지(체지방·근육량·대사량 등) 목록 주시면 `metrics` JSONB 키 표준화.

---

## 부록. NormalizedActivity 인터페이스(초안)
```ts
// src/lib/integrations/types.ts
export interface NormalizedActivity {
  source: 'manual' | 'strava' | 'garmin' | 'apple_health'
        | 'samsung_health' | 'barojaenfit_manual' | 'barojaenfit_api' | 'libre_cgm';
  sourceRef?: string;          // 외부 고유 id (중복 방지)
  kind: 'run' | 'walk_run' | 'long_run' | 'interval'
      | 'glucose' | 'body_comp' | 'fasting' | 'weight' | 'custom';
  activityDate: string;        // YYYY-MM-DD
  distanceM?: number;
  durationS?: number;
  avgPaceS?: number;
  elevationM?: number;
  avgHr?: number;
  metrics?: Record<string, number | string>; // 건강지표 유연 저장
  note?: string;
  photoUrl?: string;
}
```
