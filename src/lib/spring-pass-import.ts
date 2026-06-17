/**
 * 봄 시즌 장부(spring-2026-passes.ts) → member_passes 일괄 발급의 "서버 로직".
 *
 * CLI 스크립트(scripts/import-spring-2026-passes.mjs)와 관리자 API
 * (api/admin/pass-import)가 이 모듈을 함께 import 해서 규칙·멱등성·보류 처리가
 * 절대 어긋나지 않게 한다. (단일 진실 공급원)
 *
 *  매칭 규칙:
 *   - 장부의 "이름"으로 members 를 찾는다.
 *     · 정확히 1명 → 발급 후보
 *     · 0명        → unmatched (웹에서 먼저 가입 필요)
 *     · 2명 이상   → ambiguous (override 로 phone/id 지정 필요)
 *   - override: { "이름#장부순서": "phone 또는 memberId" } 또는 { "이름": ... }
 *
 *  멱등성: (member_id, product_id, start_date, issued_date) 가 이미 있으면 skip.
 *
 * ⚠️ 서버 전용(pg 사용). 클라이언트 컴포넌트에서 import 금지.
 */

import { dbAll, dbGet, dbTx, ensureSchema, genId } from './db';
import {
  buildSpring2026Passes,
  springPassSummary,
  SPRING_PASS_PRODUCT_ID,
  type SpringPassRecord,
} from './spring-2026-passes';

export type SpringImportOverride = Record<string, string>;

export type SpringImportStatus = 'ready' | 'unmatched' | 'ambiguous' | 'already_issued';

export interface SpringImportRow {
  index: number;
  name: string;
  paymentDate: string;
  startDate: string;
  expiryDate: string;
  months: number;
  amount: number;
  durationDays: number;
  openingWaitlist: boolean;
  status: SpringImportStatus;
  /** 매칭된 회원(있을 때). */
  memberId?: string;
  memberPhone?: string;
  /** ambiguous 일 때 후보 수. */
  candidateCount?: number;
  /** already_issued 일 때 기존 pass id. */
  existingPassId?: string;
  reason?: string;
}

export interface SpringImportPreview {
  generatedAt: string;
  ledger: ReturnType<typeof springPassSummary>;
  stats: {
    ready: number;
    unmatched: number;
    ambiguous: number;
    alreadyIssued: number;
  };
  rows: SpringImportRow[];
}

function normDigits(s: string): string {
  return String(s).replace(/\D/g, '');
}

/** 한 장부 행을 회원과 매칭하고 멱등성까지 검사해 상태를 결정한다. */
async function resolveRow(r: SpringPassRecord, override?: SpringImportOverride): Promise<SpringImportRow> {
  const base: SpringImportRow = {
    index: r.index,
    name: r.name,
    paymentDate: r.paymentDate,
    startDate: r.startDate,
    expiryDate: r.expiryDate,
    months: r.months,
    amount: r.amount,
    durationDays: r.durationDays,
    openingWaitlist: r.openingWaitlist,
    status: 'unmatched',
  };

  const ov = override?.[`${r.name}#${r.index}`] ?? override?.[r.name];
  let candidates: Array<{ id: string; name: string; phone: string }>;
  if (ov) {
    const digits = normDigits(ov);
    candidates = await dbAll<{ id: string; name: string; phone: string }>(
      `SELECT id, name, phone FROM members
        WHERE regexp_replace(phone,'[^0-9]','','g') = $1 OR id = $2`,
      [digits, String(ov)],
    );
  } else {
    candidates = await dbAll<{ id: string; name: string; phone: string }>(
      `SELECT id, name, phone FROM members WHERE name = $1`,
      [r.name],
    );
  }

  if (candidates.length === 0) {
    return { ...base, status: 'unmatched', reason: '해당 이름의 회원이 없습니다. 웹에서 먼저 가입이 필요합니다.' };
  }
  if (candidates.length > 1) {
    return {
      ...base,
      status: 'ambiguous',
      candidateCount: candidates.length,
      reason: `같은 이름 회원이 ${candidates.length}명입니다. 휴대폰으로 지정해야 합니다.`,
    };
  }

  const member = candidates[0];
  const dup = await dbGet<{ id: string }>(
    `SELECT id FROM member_passes
      WHERE member_id = $1 AND product_id = $2 AND start_date = $3 AND issued_date = $4`,
    [member.id, SPRING_PASS_PRODUCT_ID, r.startDate, r.paymentDate],
  );
  if (dup) {
    return { ...base, status: 'already_issued', memberId: member.id, memberPhone: member.phone, existingPassId: dup.id };
  }

  return { ...base, status: 'ready', memberId: member.id, memberPhone: member.phone };
}

/** 발급 없이 무엇이 발급/보류될지 미리보기만 만든다(dry-run). */
export async function buildSpringImportPreview(override?: SpringImportOverride): Promise<SpringImportPreview> {
  await ensureSchema();
  const records = buildSpring2026Passes();
  const rows: SpringImportRow[] = [];
  for (const r of records) {
    rows.push(await resolveRow(r, override));
  }
  const stats = {
    ready: rows.filter((x) => x.status === 'ready').length,
    unmatched: rows.filter((x) => x.status === 'unmatched').length,
    ambiguous: rows.filter((x) => x.status === 'ambiguous').length,
    alreadyIssued: rows.filter((x) => x.status === 'already_issued').length,
  };
  return {
    generatedAt: new Date().toISOString(),
    ledger: springPassSummary(),
    stats,
    rows,
  };
}

export interface SpringImportApplyResult extends SpringImportPreview {
  issued: number;
  issuedPassIds: string[];
}

export interface SpringImportApplyOptions {
  /** 지급 기록에 남길 실행자. API는 로그인 관리자, CLI는 기본 운영 계정을 사용한다. */
  adminId?: string;
  adminName?: string | null;
}

type SpringPassProductRow = {
  id: string;
  name: string;
  category: string;
  applicable_sessions: string;
  total_count: number | null;
  duration_days: number;
  price: number;
};

/**
 * 미리보기에서 status==='ready' 인 행만 실제 발급한다.
 * 만료일이 오늘보다 과거면 status='expired', 아니면 'active' 로 넣는다.
 * 결제는 현금/완납으로 기록(장부가 이미 입금 확정분이므로).
 * member_passes 와 지급 기록(pass_grant_records)은 한 트랜잭션으로 함께 저장한다.
 */
export async function applySpringImport(
  override?: SpringImportOverride,
  options?: SpringImportApplyOptions,
): Promise<SpringImportApplyResult> {
  const preview = await buildSpringImportPreview(override);
  const ready = preview.rows.filter((r) => r.status === 'ready' && r.memberId);
  const issuedPassIds: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const adminId = options?.adminId ?? 'spring_pass_import';
  const adminName = options?.adminName ?? '봄 장부 등록';

  if (ready.length === 0) {
    return { ...preview, issued: 0, issuedPassIds };
  }

  const product = await dbGet<SpringPassProductRow>(
    `SELECT id, name, category, applicable_sessions, total_count, duration_days, price
       FROM pass_products
      WHERE id = $1`,
    [SPRING_PASS_PRODUCT_ID],
  );
  if (!product) {
    throw new Error(`봄 장부 수강권 상품을 찾을 수 없습니다: ${SPRING_PASS_PRODUCT_ID}`);
  }

  await dbTx(async (client) => {
    for (const r of ready) {
      if (!r.memberId) continue;

      // 트랜잭션 시작 후 한 번 더 확인해, 동시에 실행돼도 같은 장부 행이 중복 발급되지 않게 한다.
      const dup = await client.query<{ id: string }>(
        `SELECT id FROM member_passes
          WHERE member_id = $1 AND product_id = $2 AND start_date = $3 AND issued_date = $4`,
        [r.memberId, SPRING_PASS_PRODUCT_ID, r.startDate, r.paymentDate],
      );
      if (dup.rows[0]) continue;

      const passId = genId('mp');
      const grantId = genId('pgr');
      const status = r.expiryDate < today ? 'expired' : 'active';
      const memo = `2026 봄 장부 일괄 등록${r.openingWaitlist ? ' · 4월결제·개강대기' : ''}`;

      await client.query(
        `INSERT INTO member_passes
           (id, member_id, product_id, total_count, remaining_count,
            start_date, expiry_date, issued_date, price, status,
            payment_status, payment_method, payment_amount, paid_at, admin_memo, updated_at)
         VALUES ($1,$2,$3,NULL,NULL,$4,$5,$6,$7,$8,'paid','cash',$7,NOW(),$9,NOW())`,
        [
          passId,
          r.memberId,
          SPRING_PASS_PRODUCT_ID,
          r.startDate,
          r.expiryDate,
          r.paymentDate,
          r.amount,
          status,
          memo,
        ],
      );

      await client.query(
        `INSERT INTO pass_grant_records (
          id, pass_id, member_id, member_name,
          product_id, product_name, product_category,
          admin_id, admin_name, grant_type, settlement_status,
          total_count, remaining_count, start_date, expiry_date, issued_date,
          regular_price, charged_amount, discount_amount,
          payment_status, payment_method, transaction_id,
          reason, memo, product_snapshot, created_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, 'manual_paid', 'settled',
          NULL, NULL, $10, $11, $12,
          $13, $13, 0,
          'paid', 'cash', NULL,
          $14, $15, $16::jsonb, NOW()
        )`,
        [
          grantId, passId, r.memberId, r.name,
          product.id, product.name, product.category,
          adminId, adminName,
          r.startDate, r.expiryDate, r.paymentDate,
          r.amount,
          '2026 봄 장부 등록', memo,
          JSON.stringify({
            id: product.id,
            name: product.name,
            category: product.category,
            applicableSessions: product.applicable_sessions,
            totalCount: product.total_count,
            durationDays: r.durationDays,
            catalogDurationDays: product.duration_days,
            catalogPrice: product.price,
            ledgerMonths: r.months,
            ledgerAmount: r.amount,
            openingWaitlist: r.openingWaitlist,
          }),
        ],
      );
      issuedPassIds.push(passId);
    }
  });

  // 발급 후 상태가 바뀌므로 미리보기를 다시 만들어 정확한 결과를 반환.
  const after = await buildSpringImportPreview(override);
  return { ...after, issued: issuedPassIds.length, issuedPassIds };
}
