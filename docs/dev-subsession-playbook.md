# 런클럽 매니저 개발 서브 세션 — 플레이북

> 이 세션을 통해 "장부/시트 데이터를 시스템에 반영", "작은 운영 기능 추가",
> "규칙을 코드로 고정" 같은 가벼운 개발을 반복적으로 돕기 위한 작업 가이드.
> 다음 세션이 빠르게 컨텍스트를 잡고 같은 패턴으로 일하도록 정리한다.

---

## 0. 프로젝트 한눈에

- **스택**: Next.js 16 (App Router) · React 19 · PostgreSQL(raw `pg`) · Tailwind v4 · shadcn/ui
- **DB 레이어**: `src/lib/db.ts` — 원시 SQL(`dbAll/dbGet/dbRun/dbTx`), 스키마는 `ensureSchema()` 가 idempotent 부트스트랩
- **운영 브랜치**: `genspark_ai_developer` (Render watch · 진실 공급원), `main` 은 ff 미러
- **시트 연동**: DB→시트 단방향 미러 + Members 탭 J~O 메타데이터만 웹으로 가져오기
- **UI 정책**: shadcn 우선, 색은 `var(--color-*)`, 본문 13px, radius `rounded-md` (CLAUDE.md 참조)

### 핵심 도메인 테이블
| 테이블 | 용도 |
|--------|------|
| `members` | 회원 마스터(전화 unique, role member/admin) |
| `member_passes` | 발급된 이용권(잔여/상태/결제). product_id→pass_products |
| `pass_products` | 상품 카탈로그(단일 소스 `PASS_PRODUCT_CATALOG`) |
| `pass_grant_records` | 관리자 직접 지급 원장(append-only, 정산/감사) |
| `sessions`/`reservations` | 세션·예약·출석 |
| `classes`/`activity_logs` | 코칭 플랫폼(클래스/활동/과제) |

---

## 1. 이번 세션 산출물 (재사용 자산)

| 자산 | 경로 | 패턴 |
|------|------|------|
| 기간 계산 규칙 | `src/lib/pass-term.ts` | "규칙은 순수 함수 단일 소스" |
| 장부 정본 fixture | `src/lib/spring-2026-passes.ts` | "raw 입력만 손으로, 파생은 코드" |
| 골든 테스트 | `scripts/verify-spring-2026-passes.mjs` | "확정 표 = 기대값 박제, DB 불필요" |
| 일괄 import | `scripts/import-spring-2026-passes.mjs` | "dry-run 기본 · 이름 매칭 · 멱등 · 트랜잭션" |
| 문서 | `docs/spring-2026-passes.md` | "규칙+표+매뉴얼 한 파일" |

이 패턴은 앞으로 다른 시즌/다른 장부에도 그대로 복제하면 된다.

---

## 2. 자주 들어올 요청 유형 & 대응 레시피

### A. "장부/표를 시스템에 반영해줘"
1. 표를 **raw fixture**(이름·결제일·개월·금액 등 손입력 최소)로 만든다.
2. 파생값(시작/종료/상태)은 **규칙 함수**로 계산 → 손으로 적지 않는다.
3. 확정 표를 **골든 테스트**로 박제 → `npm run ...:verify` 로 회귀 차단.
4. **dry-run import** 로 매칭/보류를 먼저 보여주고, 확인 후 `--apply`.
5. FK(회원 존재) 같은 제약은 **보류 처리 + 리포트**로 투명하게.

### B. "이 규칙대로 계산되게 해줘"
- 규칙은 반드시 `src/lib/*.ts` **단일 순수 함수**로. 화면/스크립트가 공유.
- 엣지/특수 케이스(예: 4월 개강대기)는 **플래그**로 표현하고 문서에 명시.

### C. "관리자 화면에 보여줘 / 버튼 추가"
- shadcn 컴포넌트 우선(Dialog/Table/Form…). 도메인 컴포넌트만 from-scratch.
- 상태 변경은 `admin_audit_log` 에 남기는 기존 패턴을 따른다.

### D. "시트에서 가져와줘"
- 회원 메타데이터(J~O)면 기존 `member-sheet-import.ts` 미리보기→적용 사용.
- 그 외(이용권 등)는 시트 import 범위 밖 → import 스크립트 패턴으로.

---

## 3. 작업 체크리스트 (매번)

- [ ] `pwd` 확인 후 `cd /home/user/webapp`
- [ ] 규칙/데이터/파생을 분리했는가 (raw만 손입력)
- [ ] 검증 스크립트(골든 테스트)로 확정값과 일치 확인
- [ ] DB 쓰기는 dry-run → 멱등 → 트랜잭션
- [ ] `npx tsc --noEmit` 새 모듈 에러 없음
- [ ] 커밋(conventional) → `genspark_ai_developer` 푸시 → PR
- [ ] PR 링크 공유

---

## 4. 안전 가드 (운영 데이터 보호)

- **카탈로그 보존**: `syncPassProductCatalog()` 는 마커/force 로만 덮어씀 — 함부로 리셋 금지.
- **이용권 발급 멱등성**: (member·product·start·issued) 중복이면 skip.
- **회원 핵심정보(A~I)** 는 시트에서 못 고침 — 항상 웹 DB 가 진실.
- 큰 데이터 백업은 AI Drive에 **tar로 묶어 단일 파일**로만 (느린 원격 FS).

---

## 5. 다음에 바로 할 수 있는 후속 작업 후보

1. **관리자 화면용 "장부 일괄 발급" UI** — 현재 CLI 스크립트를 admin 페이지의
   미리보기/적용 버튼으로(기존 시트 import preview 패턴 재사용).
2. **회원 자동 생성 옵션** — unmatched 행을 (이름+휴대폰 입력 시) 회원까지 함께 생성.
3. **정산 리포트** — `pass_grant_records` 기준 기간별 매출/개강대기 분리 집계.
4. **이용권 만료 알림** — expiry_date 임박 회원 추출(주간 리포트와 연계).
5. **합계 검증 자동화** — 장부 금액합 vs 실제 입금 대조 경고.

> 요청이 오면 위 레시피(2절)와 자산(1절)을 먼저 재사용하고, 없으면 같은
> 패턴으로 새로 만든다.
