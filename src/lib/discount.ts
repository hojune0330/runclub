// ─── PR-DISCOUNT: 할인 계산 엔진 ───
// 멤버십 보유자 10% 자동 할인 + 적립금 10% + 쿠폰 + 프로모션을
// 단일 함수로 계산. Toss API 는 할인 개념이 없으므로 서버에서 할인 후
// 최종 금액만 Toss에 전달한다.
//
// 할인 적용 순서 (고정):
//   1. 멤버십 할인 (보유 수강권 있으면 무조건 10%)
//   2. 프로모션 할인 (기간 한정, 자동)
//   3. 쿠폰 할인 (코드 입력)
//   4. 적립금 사용 (회원 선택)
//
// 0원 이하가 되면 Toss를 우회하고 즉시 발급 (PR-C3 재활용).

import { dbGet, dbAll, dbRun, dbTx, ensureDiscountSchema } from '@/lib/db';

// ─── Types ───

export interface DiscountLineItem {
  type: 'membership' | 'promotion' | 'coupon' | 'mileage';
  label: string;        // UI 표시용 (예: "멤버십 10% 할인")
  amount: number;        // 할인 금액 (양수)
  refId?: string;        // 쿠폰ID / 프로모션ID / null
}

export interface DiscountResult {
  originalAmount: number;            // 상품 정가
  membershipDiscount: number;         // 멤버십 할인액
  promotionDiscount: number;          // 프로모션 할인액
  promotionId: string | null;
  couponDiscount: number;             // 쿠폰 할인액
  couponId: string | null;
  mileageUsed: number;               // 사용 적립금
  finalAmount: number;               // Toss 결제 금액 (0원이면 무료)
  discountLines: DiscountLineItem[];  // UI 표시용
}

export interface CouponValidation {
  valid: boolean;
  couponId?: string;
  couponName?: string;
  discountAmount?: number;
  error?: string;
}

// ─── 모듈 레벨 초기화 ───
// 이 모듈의 모든 함수가 member_passes, coupons, member_coupons,
// mileage_log 등을 쿼리하므로 스키마가 준비된 상태여야 한다.
// Promise singleton으로 idempotent 보장 (최초 1회만 실행).
let _discountReady: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  if (!_discountReady) _discountReady = ensureDiscountSchema();
  return _discountReady;
}

// ─── 멤버십 할인 체크 ───
// 활성(active) 또는 일시정지(paused) 상태의 수강권이 하나라도 있으면 10% 할인.

export async function getMembershipDiscountRate(memberId: string): Promise<number> {
  await ensureReady();
  const active = await dbGet<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM member_passes
      WHERE member_id = $1 AND status IN ('active','paused')
      LIMIT 1`,
    [memberId]
  );
  return Number(active?.cnt ?? 0) > 0 ? 0.10 : 0;
}

// ─── 쿠폰 검증 및 할인액 계산 ───

export async function validateCoupon(
  code: string,
  memberId: string,
  productId: string,
  orderAmount: number, // 할인 전 금액 기준
): Promise<CouponValidation> {
  await ensureReady();
  const coupon = await dbGet<any>(
    `SELECT * FROM coupons WHERE code = $1 AND is_active = TRUE LIMIT 1`,
    [code]
  );
  if (!coupon) return { valid: false, error: '존재하지 않는 쿠폰입니다' };

  // 기간 체크
  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now) {
    return { valid: false, error: '아직 사용할 수 없는 쿠폰입니다' };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < now) {
    return { valid: false, error: '만료된 쿠폰입니다' };
  }

  // 수량 체크
  if (coupon.total_quantity > 0 && coupon.used_count >= coupon.total_quantity) {
    return { valid: false, error: '쿠폰이 모두 소진되었습니다' };
  }

  // 1인당 사용 횟수 체크
  if (coupon.per_member > 0) {
    const usedByMember = await dbGet<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM member_coupons
        WHERE member_id = $1 AND coupon_id = $2 AND status = 'used'`,
      [memberId, coupon.id]
    );
    if (Number(usedByMember?.cnt ?? 0) >= coupon.per_member) {
      return { valid: false, error: '이미 사용한 쿠폰입니다' };
    }
  }

  // 대상 상품 체크
  if (coupon.target_products) {
    try {
      const targets = JSON.parse(coupon.target_products) as string[];
      if (targets.length > 0 && !targets.includes(productId)) {
        return { valid: false, error: '해당 상품에 사용할 수 없는 쿠폰입니다' };
      }
    } catch { /* 파싱 실패 시 통과 */ }
  }

  // 최소 주문 금액 체크
  if (orderAmount < coupon.min_order) {
    return { valid: false, error: `최소 ${coupon.min_order.toLocaleString()}원 이상 구매 시 사용 가능합니다` };
  }

  // 할인액 계산
  let discountAmount = 0;
  if (coupon.discount_type === 'fixed') {
    discountAmount = coupon.discount_value;
  } else {
    discountAmount = Math.round(orderAmount * (coupon.discount_value / 100));
    if (coupon.max_discount && coupon.max_discount > 0) {
      discountAmount = Math.min(discountAmount, coupon.max_discount);
    }
  }
  // 할인이 주문 금액을 초과하지 않도록
  discountAmount = Math.min(discountAmount, orderAmount);

  return {
    valid: true,
    couponId: coupon.id,
    couponName: coupon.name,
    discountAmount,
  };
}

// ─── 할인 계산 메인 함수 ───

export async function calculateDiscount(
  memberId: string,
  productId: string,
  productPrice: number,
  opts?: {
    couponCode?: string;
    useMileage?: number;    // 회원이 사용하겠다고 입력한 적립금
  }
): Promise<DiscountResult> {
  // Schema is guaranteed by getMembershipDiscountRate (which calls ensureReady).
  await ensureReady();

  const lines: DiscountLineItem[] = [];
  let remaining = productPrice;

  // 1. 멤버십 할인
  const membershipRate = await getMembershipDiscountRate(memberId);
  const membershipDiscount = Math.round(productPrice * membershipRate);
  if (membershipDiscount > 0) {
    lines.push({ type: 'membership', label: '멤버십 10% 할인', amount: membershipDiscount });
    remaining -= membershipDiscount;
  }

  // 2. 프로모션 (추후 활성화 — 지금은 빈 배열)
  let promotionDiscount = 0;
  let promotionId: string | null = null;
  // TODO: promotion lookup when admin creates promotions.

  // 3. 쿠폰
  let couponDiscount = 0;
  let couponId: string | null = null;
  if (opts?.couponCode) {
    const result = await validateCoupon(opts.couponCode, memberId, productId, remaining);
    if (!result.valid) {
      throw new Error(result.error);
    }
    couponDiscount = result.discountAmount!;
    couponId = result.couponId!;
    lines.push({ type: 'coupon', label: result.couponName!, amount: couponDiscount, refId: couponId });
    remaining -= couponDiscount;
  }

  // 4. 적립금 사용
  let mileageUsed = 0;
  if (opts?.useMileage && opts.useMileage > 0) {
    const member = await dbGet<{ mileage_balance: number }>(
      `SELECT mileage_balance FROM members WHERE id = $1`, [memberId]
    );
    const balance = member?.mileage_balance ?? 0;
    // 사용 요청 금액과 잔액 중 작은 쪽, 단 1,000원 단위로만 사용 가능
    const usable = Math.min(opts.useMileage, balance, remaining);
    mileageUsed = Math.floor(usable / 1000) * 1000; // 1,000원 단위 절사
    if (mileageUsed > 0) {
      lines.push({ type: 'mileage', label: '적립금 사용', amount: mileageUsed });
      remaining -= mileageUsed;
    }
  }

  const finalAmount = Math.max(0, remaining);

  return {
    originalAmount: productPrice,
    membershipDiscount,
    promotionDiscount,
    promotionId,
    couponDiscount,
    couponId,
    mileageUsed,
    finalAmount,
    discountLines: lines,
  };
}

// ─── 적립금 적립 ───
// 결제 완료 시 실제 결제액의 10%를 적립.
// dbTx로 감싸 UPDATE + INSERT를 원자적으로 처리.

export async function earnMileage(
  memberId: string,
  paidAmount: number,
  orderId: string
): Promise<number> {
  const earned = Math.round(paidAmount * 0.10);
  if (earned <= 0) return 0;

  await dbTx(async (client) => {
    await client.query(
      `UPDATE members SET mileage_balance = mileage_balance + $1 WHERE id = $2`,
      [earned, memberId]
    );

    const result = await client.query(
      `SELECT mileage_balance FROM members WHERE id = $1`,
      [memberId]
    );

    await client.query(
      `INSERT INTO mileage_log (member_id, amount, reason, reference_id, balance_after)
       VALUES ($1, $2, 'purchase', $3, $4)`,
      [memberId, earned, orderId, result.rows[0]?.mileage_balance ?? earned]
    );
  });

  return earned;
}

/**
 * 범용 마일리지 적립 (P2 코칭 활동/과제용).
 * reason 예: 'activity' | 'activity_long' | 'homework'.
 * 같은 reason+referenceId 조합이 이미 있으면 중복 적립을 막는다(idempotent).
 * @returns 실제 적립된 포인트(중복/0 이면 0)
 */
export async function grantMileage(
  memberId: string,
  amount: number,
  reason: string,
  referenceId?: string | null
): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  let granted = 0;
  await dbTx(async (client) => {
    if (referenceId) {
      const dup = await client.query(
        `SELECT 1 FROM mileage_log WHERE member_id = $1 AND reason = $2 AND reference_id = $3 LIMIT 1`,
        [memberId, reason, referenceId]
      );
      if ((dup.rowCount ?? 0) > 0) return; // 이미 적립됨
    }

    await client.query(
      `UPDATE members SET mileage_balance = mileage_balance + $1 WHERE id = $2`,
      [amount, memberId]
    );
    const result = await client.query(
      `SELECT mileage_balance FROM members WHERE id = $1`,
      [memberId]
    );
    await client.query(
      `INSERT INTO mileage_log (member_id, amount, reason, reference_id, balance_after)
       VALUES ($1, $2, $3, $4, $5)`,
      [memberId, amount, reason, referenceId ?? null, result.rows[0]?.mileage_balance ?? amount]
    );
    granted = amount;
  });

  return granted;
}

/** P2 마일리지 적립 규칙 (사용자 확정: +10 활동 / +20 롱런(10km+) / +30 과제 검증) */
export const COACHING_MILEAGE = {
  ACTIVITY: 10,        // 활동 1건 (하루 최대 2건까지만 적립)
  LONG_RUN: 20,        // 10km 이상 롱런 (활동 적립에 추가)
  HOMEWORK_VERIFIED: 30, // 과제 검증 완료
  ACTIVITY_DAILY_CAP: 2, // 활동 적립 일일 한도
  LONG_RUN_M: 10000,   // 롱런 기준 거리(미터)
} as const;
