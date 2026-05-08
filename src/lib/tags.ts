/**
 * PR-C1: 태그 기반 세션 ↔ 수강권 매칭 헬퍼.
 *
 * 호출 패턴
 *  - getSessionTags(sessionId)        → 세션에 붙은 tag_id 배열
 *  - getProductTags(productId)        → 수강권 상품에 붙은 tag_id 배열 (옴니패스는 ['*'])
 *  - replaceSessionTags(...)          → 세션 태그를 통째로 교체 (편집 시)
 *  - replaceProductTags(...)          → 상품 태그를 통째로 교체 (편집 시)
 *  - isPassEligibleForSession(...)    → 매칭 핵심 함수 (서버/SQL 양쪽에서 사용)
 *  - buildPassEligibilitySql(...)     → /api/reservations 의 SELECT 절에 끼울 SQL 조각
 *
 * 매칭 규칙(요약):
 *   1. 수강권 태그에 '*' 포함  →  모든 세션 사용 가능
 *   2. 그 외에는 세션태그 ∩ 수강권태그 ≠ ∅ 이면 사용 가능
 *   3. 세션 또는 상품의 태그가 비어 있으면 legacy 컬럼으로 fallback
 *      (sessions.type, pass_products.applicable_sessions)
 *      → PR-C4 에서 fallback 분기 제거 예정
 */

import { dbAll, dbRun, dbTx } from './db';
import type { SessionType } from '@/types';

export const OMNI_TAG = '*';

/** 세션 1건의 태그 id 배열 (정렬 보장 X) */
export async function getSessionTags(sessionId: string): Promise<string[]> {
  const rows = await dbAll<{ tag_id: string }>(
    `SELECT tag_id FROM session_tag_map WHERE session_id = $1`,
    [sessionId]
  );
  return rows.map(r => r.tag_id);
}

/** 수강권 상품 1건의 태그 id 배열 */
export async function getProductTags(productId: string): Promise<string[]> {
  const rows = await dbAll<{ tag_id: string }>(
    `SELECT tag_id FROM pass_product_tag_map WHERE product_id = $1`,
    [productId]
  );
  return rows.map(r => r.tag_id);
}

/** 여러 세션의 태그를 한 번에 조회 → { sessionId: tagId[] } 맵 반환 (N+1 방지) */
export async function getSessionTagsMap(sessionIds: string[]): Promise<Record<string, string[]>> {
  if (sessionIds.length === 0) return {};
  const rows = await dbAll<{ session_id: string; tag_id: string }>(
    `SELECT session_id, tag_id FROM session_tag_map
      WHERE session_id = ANY($1::text[])`,
    [sessionIds]
  );
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    (map[r.session_id] ??= []).push(r.tag_id);
  }
  return map;
}

/** 여러 상품의 태그 한 번에 조회 → { productId: tagId[] } */
export async function getProductTagsMap(productIds: string[]): Promise<Record<string, string[]>> {
  if (productIds.length === 0) return {};
  const rows = await dbAll<{ product_id: string; tag_id: string }>(
    `SELECT product_id, tag_id FROM pass_product_tag_map
      WHERE product_id = ANY($1::text[])`,
    [productIds]
  );
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    (map[r.product_id] ??= []).push(r.tag_id);
  }
  return map;
}

/**
 * 세션의 태그를 통째로 교체. 트랜잭션 안에서 DELETE → INSERT.
 * tagIds 가 비어 있으면 모든 매핑을 삭제만 한다.
 */
export async function replaceSessionTags(sessionId: string, tagIds: string[]): Promise<void> {
  const unique = Array.from(new Set(tagIds.map(t => t.trim()).filter(Boolean)));
  await dbTx(async client => {
    await client.query('DELETE FROM session_tag_map WHERE session_id = $1', [sessionId]);
    for (const tagId of unique) {
      await client.query(
        `INSERT INTO session_tag_map (session_id, tag_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [sessionId, tagId]
      );
    }
  });
}

/**
 * 수강권 상품의 태그 통째 교체. '*' 가 포함되어 있으면 다른 태그는 의미가
 * 없으므로 ['*'] 한 개로 정규화.
 */
export async function replaceProductTags(productId: string, tagIds: string[]): Promise<void> {
  let unique = Array.from(new Set(tagIds.map(t => t.trim()).filter(Boolean)));
  if (unique.includes(OMNI_TAG)) unique = [OMNI_TAG];
  await dbTx(async client => {
    await client.query('DELETE FROM pass_product_tag_map WHERE product_id = $1', [productId]);
    for (const tagId of unique) {
      await client.query(
        `INSERT INTO pass_product_tag_map (product_id, tag_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [productId, tagId]
      );
    }
  });
}

/**
 * 순수 함수: 메모리 상의 태그/legacy 필드 두 개로 매칭 판정.
 *
 *   sessionTags        : session_tag_map 행 (없으면 [])
 *   sessionType        : sessions.type (legacy fallback 용)
 *   productTags        : pass_product_tag_map 행 (없으면 [])
 *   productApplicable  : pass_products.applicable_sessions (legacy fallback 용)
 */
export function isPassEligibleForSession(args: {
  sessionTags: string[];
  sessionType: SessionType;
  productTags: string[];
  productApplicable: SessionType[] | 'all';
}): boolean {
  const { sessionTags, sessionType, productTags, productApplicable } = args;

  // 1) 옴니패스
  if (productTags.includes(OMNI_TAG)) return true;

  // 2) 양쪽 다 태그가 있으면 태그 교집합으로 판정 (정상 경로)
  if (productTags.length > 0 && sessionTags.length > 0) {
    return productTags.some(t => sessionTags.includes(t));
  }

  // 3) Legacy fallback — 둘 중 한쪽이라도 태그가 없으면 기존 컬럼으로 판정
  if (productApplicable === 'all') return true;
  if (Array.isArray(productApplicable)) {
    return productApplicable.includes(sessionType);
  }
  return false;
}

/**
 * /api/reservations 의 "사용 가능한 수강권 1건 찾기" 쿼리에 끼울
 * SQL 조각 + 파라미터를 만들어 준다. 호출 측이 이미 사용 중인 placeholder
 * 시작 인덱스를 받아 계산해 주는 방식.
 *
 * 반환:
 *   sql    — pp.id 와 join 된 후 추가로 AND 로 묶을 수 있는 조건문
 *   params — 추가로 push 해 줄 파라미터 배열
 *
 * 매칭 SQL 의미:
 *   ① pass_product_tag_map 에 ('*') 행이 있는 상품 → 무조건 OK
 *   ② OR : session_tag_map 과 같은 tag_id 가 하나라도 있으면 OK
 *   ③ OR : 세션 태그가 0행이거나 상품 태그가 0행이면 legacy 컬럼으로 fallback
 *          (pp.applicable_sessions = 'all' OR LIKE '%type%')
 */
export function buildPassEligibilitySql(opts: {
  sessionIdParamIdx: number;     // 예: 1 → $1
  sessionTypeLikeParamIdx: number; // 예: 2 → $2 ('%type%' 형태로 미리 만들어진 값)
}): string {
  const sId = `$${opts.sessionIdParamIdx}`;
  const sLike = `$${opts.sessionTypeLikeParamIdx}`;
  return `(
    EXISTS (
      SELECT 1 FROM pass_product_tag_map ptm
       WHERE ptm.product_id = pp.id AND ptm.tag_id = '${OMNI_TAG}'
    )
    OR EXISTS (
      SELECT 1
        FROM pass_product_tag_map ptm
        JOIN session_tag_map stm ON stm.tag_id = ptm.tag_id
       WHERE ptm.product_id = pp.id
         AND stm.session_id = ${sId}
    )
    OR (
      NOT EXISTS (SELECT 1 FROM session_tag_map      WHERE session_id = ${sId})
      AND (pp.applicable_sessions = 'all' OR pp.applicable_sessions LIKE ${sLike})
    )
    OR (
      NOT EXISTS (SELECT 1 FROM pass_product_tag_map WHERE product_id = pp.id)
      AND (pp.applicable_sessions = 'all' OR pp.applicable_sessions LIKE ${sLike})
    )
  )`;
}

/** 어드민 — 태그 ID 형식 검증 (소문자/숫자/하이픈/언더스코어 1~32자) */
export const TAG_ID_REGEX = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function validateTagId(id: string): { ok: true } | { ok: false; reason: string } {
  if (!id || typeof id !== 'string') return { ok: false, reason: 'tag id가 비어있습니다' };
  if (id === OMNI_TAG) return { ok: false, reason: "'*' 는 예약된 태그입니다" };
  if (!TAG_ID_REGEX.test(id)) {
    return { ok: false, reason: 'tag id는 소문자·숫자·하이픈·언더스코어 1~32자만 허용됩니다' };
  }
  return { ok: true };
}
