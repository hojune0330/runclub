# RunClub 할인 시스템 (Discount System)

> **PR-DISCOUNT** | 2026-05-31

## 개요

수강권 결제 시 자동/수동 할인을 적용하고, 결제 후 적립금을 적립하는 통합 할인 시스템.

## 핵심 원칙

1. **Toss Payments는 할인 개념이 없다.** Toss `/v1/payments/confirm` API는 `paymentKey`, `orderId`, `amount`만 받는다. 모든 할인은 서버에서 계산하여 최종 금액만 Toss에 전달한다.
2. **할인 적용 순서는 고정:** 멤버십 → 프로모션 → 쿠폰 → 적립금. 각 단계에서 차감된 금액을 기준으로 다음 단계를 계산한다.
3. **적립금은 1,000원 단위**로만 사용 가능하다.

## 가격 정책 (네이버 스마트스토어 라인업 기준)

> **가격 전략 = 미끼(loss-leader) → 전문화 클래스 업셀 funnel**
>
> - **미끼**: `pp_001` 아이오 런클럽 멤버십(10,000원). 누구나 부담 없이 결제하도록 진입장벽을 극단적으로 낮춘 상품. 결제 즉시 `member_passes`에 active pass가 생기고, 이때부터 `getMembershipDiscountRate()`가 **모든 상품에 10% 자동 할인**을 적용한다.
> - **전문 클래스(고액 마진)**: 런클럽 회원에게는 10% 할인된 가격으로 노출되어 "이미 멤버니까 할인받고 듣자"는 심리로 자연스럽게 업셀된다.

| id | 상품 | 유형 | 정가 | 기간/횟수 | 비고 |
|----|------|------|------|-----------|------|
| `pp_001` | **아이오 런클럽 멤버십** | 월권 | **10,000원** | 30일 무제한 | 🎣 **미끼** — 할인 트리거(featured) |
| `pp_002` | EBW 원데이 체험 [E.B.W] | 횟수권 | 35,000원 | 1회 × 30일 | 입문 |
| `pp_003` | EBW 정기반 (월) | 월권 | 100,000원 | 30일 (월 16회) | 정기 |
| `pp_004` | io러닝 러닝 클래스 (6주) | 횟수권 | 150,000원 | 6회 × 60일 | 정기 |
| `pp_005` | 공무원 체력시험 준비반 | 월권 | 250,000원 | 30일 | 특화 |
| `pp_006` | 러너 맞춤형 깔창 제작 | 횟수권 | 130,000원 | 1회 × 30일 | 제작/굿즈 |
| `pp_007` | 유소년 러닝 교육 (1:1/그룹) | 횟수권 | 130,000원 | 1회 × 60일 | PT |
| `pp_008` | 강병규 코치 원데이 PT (1:1) | 횟수권 | 80,000원 | 1회 × 30일 | PT 입문 |
| `pp_009` | 강병규 코치 러닝 PT 4회 (1:1) | 횟수권 | 480,000원 | 4회 × 90일 | 고액 |
| `pp_010` | 강병규 코치 러닝 PT 8회 (1:1) | 횟수권 | 800,000원 | 8회 × 120일 | 최고액 |

런클럽 회원은 위 `pp_002`~`pp_010` 전 상품을 결제 시 **자동 10% 할인** 받는다 (예: 800,000원 → 720,000원).

## 할인 유형

### 1. 멤버십 할인 (자동) — funnel의 핵심
- **조건:** 활성(`active`) 또는 일시정지(`paused`) 상태의 수강권을 하나라도 보유
- **할인율:** 모든 상품 정가의 **10%**
- **구현:** `src/lib/discount.ts` → `getMembershipDiscountRate()`
- **전략적 의미:** 가장 저렴한 **런클럽 멤버십(10,000원)**만 보유해도 이 조건이 충족된다.
  즉 "런클럽 가입 = 모든 전문 클래스 상시 10% 할인 자격"이라는 구조가 되어,
  저가 미끼 상품이 고액 전문 클래스로 가는 진입 관문 역할을 한다.
- **UX:**
  - 미보유자에게는 `PassCatalog`의 `MembershipDiscountBanner`가 "월 10,000원 런클럽 멤버십으로 모든 클래스 10% 할인받기 →" 안내(클릭 시 런클럽 멤버십 페이지로 이동)
  - 보유자에게는 "멤버십 10% 할인 적용 중" 배너 표시
  - 런클럽 멤버십 안내 페이지(`SlowRunMembership.tsx`)는 `runclub` 태그 상품으로 상태를 감지

### 2. 프로모션 할인 (예약)
- 현재 스텁(stub) 상태. 추후 관리자가 프로모션을 등록하면 자동 적용.
- `promotions` 테이블 설계 완료. `stackable`이 true면 다른 할인과 중첩 가능.

### 3. 쿠폰 할인
- 회원이 결제 시 쿠폰 코드 입력
- **지원 유형:** 정액(`fixed`) / 정률(`percent`)
- **제약 조건:** 최소 주문 금액, 최대 할인 금액, 대상 상품, 대상 등급, 1인당 사용 횟수
- **구현:** `src/lib/discount.ts` → `validateCoupon()`

### 4. 적립금 사용
- 회원이 보유한 적립금 중 일부를 결제에 사용
- **1,000원 단위**로만 사용 가능
- 사용 후 잔액에서 차감됨

### 적립금 적립
- **실제 결제액의 10%**를 적립
- 결제 완료 시 자동 적립 (`earnMileage()`)
- `mileage_log` 테이블에 이력 기록

## DB 스키마

### 신규 테이블
| 테이블 | 용도 |
|--------|------|
| `member_grades` | 회원 등급 마스터 (할인율, 적립률) |
| `coupons` | 쿠폰 마스터 |
| `member_coupons` | 회원별 쿠폰 발급/사용 이력 |
| `promotions` | 프로모션 마스터 |
| `mileage_log` | 적립금 적립/사용 이력 |

### 확장 컬럼
| 테이블 | 컬럼 | 용도 |
|--------|------|------|
| `members` | `grade_id` | 회원 등급 FK |
| `members` | `mileage_balance` | 적립금 잔액 |
| `members` | `total_purchased` | 누적 구매액 |
| `pending_payments` | `original_amount` | 할인 전 원금 |
| `pending_payments` | `membership_discount` | 멤버십 할인액 |
| `pending_payments` | `coupon_id`, `coupon_discount` | 쿠폰 정보 |
| `pending_payments` | `promotion_id`, `promotion_discount` | 프로모션 정보 |
| `pending_payments` | `mileage_used` | 사용 적립금 |
| `member_passes` | `mileage_earned` | 적립된 마일리지 |

### 시드 데이터
- 기본 등급 `일반` (discount_rate=0, mileage_rate=0.10)

## API 엔드포인트

### POST `/api/payments/checkout`
- **Request:**
```json
{
  "productId": "pp_001",
  "couponCode": "WELCOME10",   // optional
  "useMileage": 5000            // optional
}
```
- **Response:** 기존 checkout 응답에 `originalAmount`, `discountLines` 추가
- `amount`는 할인 후 최종 결제 금액

### POST `/api/payments/confirm`
- 기존 confirm 흐름에 다음이 추가됨:
  - `member_passes`에 `discount_amount`, `discount_reason` 기록
  - `earnMileage()` 호출로 적립금 적립
  - 쿠폰 사용 처리 (`member_coupons` INSERT, `coupons.used_count` 증가)
  - 적립금 차감 (`members.mileage_balance` 감소, `mileage_log` 기록)

### GET/POST/PUT/DELETE `/api/coupons` (관리자)
- 쿠폰 CRUD. GET은 모든 쿠폰 목록, POST/PUT/DELETE는 관리자만 가능

### GET `/api/mileage`
- 일반 회원: 본인의 적립금 잔액, 등급, 이력, 보유 쿠폰 조회
- 관리자 `?admin=1`: 전체 회원 적립금 현황

## 파일 구조

```
src/
├── lib/
│   ├── db.ts                          # initDiscountSchema(), ensureDiscountSchema()
│   ├── discount.ts                     # calculateDiscount(), validateCoupon(), earnMileage()
│   └── api.ts                          # checkout() 함수 시그니처 업데이트
├── app/api/
│   ├── payments/
│   │   ├── checkout/route.ts           # 할인 계산 통합
│   │   └── confirm/route.ts            # 할인 기록, 적립금 적립
│   ├── coupons/route.ts               # 관리자 쿠폰 CRUD
│   └── mileage/route.ts               # 회원 적립금/등급 조회
└── components/member/
    └── PassCatalog.tsx                 # 쿠폰 입력, 적립금 사용, 멤버십 할인 배너
```

## 아키텍처 다이어그램

```
회원 → [PassCatalog 구매버튼]
         │
         ├─ couponCode, useMileage
         ▼
[POST /api/payments/checkout]
         │
         ├─ calculateDiscount()
         │   ├─ 멤버십 체크 (10%)
         │   ├─ 프로모션 (stub)
         │   ├─ 쿠폰 검증
         │   └─ 적립금 계산
         │
         ├─ pending_payments INSERT (할인 상세 포함)
         │
         └─ 응답 { amount: finalAmount, discountLines, ... }
              │
              ▼
[Toss Payments SDK] ← 결제 금액 = finalAmount
              │
              ▼
[POST /api/payments/confirm]
         │
         ├─ pending_payments 할인 상세 읽기
         ├─ member_passes INSERT (discount_amount, discount_reason)
         ├─ earnMileage() (paidAmount × 10%)
         ├─ 쿠폰 used_count 증가
         └─ 적립금 차감
```

## 테스트용 쿠폰 생성 예시

```bash
# 관리자 API로 테스트 쿠폰 생성
curl -X POST /api/coupons \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "WELCOME10",
    "name": "웰컴 10% 할인 쿠폰",
    "discountType": "percent",
    "discountValue": 10,
    "minOrder": 10000,
    "maxDiscount": 50000,
    "totalQuantity": 100,
    "perMember": 1,
    "expiresAt": "2026-12-31T23:59:59Z"
  }'
```

## 향후 확장 계획

- [ ] 프로모션 자동 매칭 로직 (`calculateDiscount` 2단계)
- [ ] 등급 자동 승급 (누적 구매액 기준)
- [ ] 생일 쿠폰 자동 발급
- [ ] 친구 초대 보상 적립금
- [ ] 관리자 대시보드에서 할인/쿠폰 사용 통계
