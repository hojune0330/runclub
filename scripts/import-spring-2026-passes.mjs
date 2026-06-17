#!/usr/bin/env node
/**
 * 2026 봄 시즌 유료 회원 장부(40건)를 member_passes 로 일괄 발급한다.
 *
 *  데이터 정본 : src/lib/spring-2026-passes.ts (이름·결제일·개월·금액)
 *  기간 규칙   : src/lib/pass-term.ts
 *               - 4월 결제 = 개강 대기 → 시작 5/6 고정, 종료 = 5/6 + 개월×30일
 *               - 5월+ 결제 = 결제일 = 시작, 종료 = 결제일 + 개월×30일
 *
 *  ⚠️ member_passes.member_id 는 FK 라서, 장부의 "이름"을 먼저 웹 DB members
 *     와 매칭해야 한다. 이 스크립트는 이름으로 후보를 찾고:
 *       - 정확히 1명 매칭 → 발급 대상
 *       - 0명/2명 이상   → 보류(unmatched/ambiguous)로 리포트만 하고 건너뜀
 *     동명이인·재결제(서보경·김준택·유명훈)는 phone 매핑 파일로 풀어야 한다.
 *
 *  멱등성: 같은 (member_id, product_id, start_date, issued_date) 조합이 이미
 *     있으면 건너뛴다. 두 번 돌려도 중복 발급되지 않는다.
 *
 * Usage:
 *   node scripts/import-spring-2026-passes.mjs               # dry-run(기본): 무엇이 발급/보류될지 출력만
 *   node scripts/import-spring-2026-passes.mjs --apply       # 실제 발급
 *   node scripts/import-spring-2026-passes.mjs --map map.json # 이름→phone/memberId 매핑으로 동명이인 해소
 *
 * 환경변수:
 *   DATABASE_URL   필수 (Render/로컬 Postgres)
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (!m) continue;
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
loadEnv();

const APPLY = process.argv.includes('--apply');
const mapIdx = process.argv.indexOf('--map');
const mapPath = mapIdx >= 0 ? process.argv[mapIdx + 1] : null;

// 동명이인/재결제 해소용 매핑. 형식 예:
//   { "서보경#0": "010-1111-2222", "서보경#1": "010-3333-4444" }
//   ("이름#장부순서(0-based)" → phone 또는 memberId)
const overrideMap = mapPath && fs.existsSync(mapPath)
  ? JSON.parse(fs.readFileSync(mapPath, 'utf8'))
  : {};

function genId(prefix) {
  const ts = Date.now().toString(36);
  const rand = randomBytes(9).toString('base64url');
  return `${prefix}_${ts}${rand}`;
}

async function loadFixture() {
  // src/lib 의 TS 모듈을 직접 import 하기 위해 tsx 로더가 필요하다.
  // 이 스크립트는 `npx tsx scripts/import-spring-2026-passes.mjs` 로 실행한다.
  const modUrl = pathToFileURL(path.resolve(process.cwd(), 'src/lib/spring-2026-passes.ts')).href;
  const mod = await import(modUrl);
  return mod;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL 이 필요합니다. (.env.local 또는 환경변수)');
    process.exit(1);
  }

  const { buildSpring2026Passes, SPRING_PASS_PRODUCT_ID, springPassSummary } = await loadFixture();
  const records = buildSpring2026Passes();
  const summary = springPassSummary();

  console.log(`\n── 2026 봄 시즌 이용권 일괄 발급 (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`장부: ${summary.count}건 · 금액합 ${summary.totalAmount.toLocaleString()}원`
    + ` · 개강대기 ${summary.openingWaitlistCount} / 일반 ${summary.regularCount}\n`);

  const { Pool } = pg;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /sslmode=require|render\.com|neon\.tech|supabase|amazonaws/i.test(process.env.DATABASE_URL)
      ? { rejectUnauthorized: false } : false,
  });

  const matched = [];
  const skipped = [];

  try {
    for (const r of records) {
      const overrideKey = `${r.name}#${r.index}`;
      const override = overrideMap[overrideKey] || overrideMap[r.name];
      let candidates;
      if (override) {
        const digits = String(override).replace(/\D/g, '');
        candidates = (await pool.query(
          `SELECT id, name, phone FROM members
            WHERE regexp_replace(phone,'[^0-9]','','g') = $1 OR id = $2`,
          [digits, String(override)]
        )).rows;
      } else {
        candidates = (await pool.query(
          `SELECT id, name, phone FROM members WHERE name = $1`, [r.name]
        )).rows;
      }

      if (candidates.length === 0) {
        skipped.push({ ...r, reason: 'unmatched (해당 이름 회원 없음 — 웹에서 먼저 가입 필요)' });
        continue;
      }
      if (candidates.length > 1) {
        skipped.push({ ...r, reason: `ambiguous (${candidates.length}명 — --map 으로 phone 지정 필요)` });
        continue;
      }
      const member = candidates[0];

      // 멱등성: 같은 회원·상품·시작일·발급일이면 건너뜀.
      const dup = (await pool.query(
        `SELECT id FROM member_passes
          WHERE member_id = $1 AND product_id = $2 AND start_date = $3 AND issued_date = $4`,
        [member.id, SPRING_PASS_PRODUCT_ID, r.startDate, r.paymentDate]
      )).rows[0];
      if (dup) {
        skipped.push({ ...r, reason: `already issued (${dup.id})`, memberId: member.id });
        continue;
      }

      matched.push({ ...r, memberId: member.id, memberPhone: member.phone });
    }

    // 리포트
    console.log(`✅ 발급 가능: ${matched.length}건`);
    for (const m of matched) {
      console.log(`   ${m.name}(${m.memberPhone}) ${m.paymentDate} → ${m.startDate}~${m.expiryDate}`
        + ` ${m.months}개월 ${m.amount.toLocaleString()}원${m.openingWaitlist ? ' [개강대기]' : ''}`);
    }
    console.log(`\n⏭️  보류: ${skipped.length}건`);
    for (const s of skipped) {
      console.log(`   ${s.name} ${s.paymentDate} ${s.months}개월 — ${s.reason}`);
    }

    if (!APPLY) {
      console.log('\n[dry-run] 실제 발급하지 않았습니다. 적용하려면 --apply 를 붙이세요.');
      return;
    }

    // 실제 발급 (트랜잭션)
    const client = await pool.connect();
    let issued = 0;
    try {
      await client.query('BEGIN');
      for (const m of matched) {
        const passId = genId('mp');
        await client.query(
          `INSERT INTO member_passes
             (id, member_id, product_id, total_count, remaining_count,
              start_date, expiry_date, issued_date, price, status,
              payment_status, payment_method, payment_amount, paid_at, admin_memo)
           VALUES ($1,$2,$3,NULL,NULL,$4,$5,$6,$7,
              CASE WHEN $5 < to_char(now(),'YYYY-MM-DD') THEN 'expired' ELSE 'active' END,
              'paid', 'cash', $7, now(),
              $8)`,
          [passId, m.memberId, SPRING_PASS_PRODUCT_ID, m.startDate, m.expiryDate,
            m.paymentDate, m.amount,
            `2026 봄 장부 일괄 등록${m.openingWaitlist ? ' · 4월결제·개강대기' : ''}`]
        );
        issued++;
      }
      await client.query('COMMIT');
      console.log(`\n🎉 발급 완료: ${issued}건`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('발급 중 오류 — 롤백했습니다:', err.message);
      process.exitCode = 1;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
