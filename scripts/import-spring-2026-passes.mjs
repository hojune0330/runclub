#!/usr/bin/env node
/**
 * 2026 봄 시즌 유료 회원 장부(40건)를 member_passes 로 일괄 발급한다.
 *
 *  데이터 정본 : src/lib/spring-2026-passes.ts (이름·결제일·개월·금액)
 *  기간 규칙   : src/lib/pass-term.ts
 *  발급 로직   : src/lib/spring-pass-import.ts  ← API 와 100% 공유(단일 소스)
 *
 *  이 CLI 는 lib 의 buildSpringImportPreview / applySpringImport 를 그대로
 *  호출하므로, 관리자 API(/api/admin/pass-import)와 규칙·멱등성이 절대
 *  어긋나지 않는다. (예전엔 CLI 가 SQL 을 따로 들고 있었으나 lib 로 통합)
 *
 * Usage:
 *   npx tsx scripts/import-spring-2026-passes.mjs                 # dry-run(기본)
 *   npx tsx scripts/import-spring-2026-passes.mjs --apply         # 실제 발급
 *   npx tsx scripts/import-spring-2026-passes.mjs --map map.json  # 동명이인 해소
 *
 * 환경변수: DATABASE_URL 필수.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
const override = mapPath && fs.existsSync(mapPath)
  ? JSON.parse(fs.readFileSync(mapPath, 'utf8'))
  : undefined;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL 이 필요합니다. (.env.local 또는 환경변수)');
    process.exit(1);
  }

  const libUrl = pathToFileURL(path.resolve(process.cwd(), 'src/lib/spring-pass-import.ts')).href;
  const { buildSpringImportPreview, applySpringImport } = await import(libUrl);

  const preview = APPLY ? await applySpringImport(override) : await buildSpringImportPreview(override);

  console.log(`\n── 2026 봄 시즌 이용권 일괄 발급 (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`장부: ${preview.ledger.count}건 · 금액합 ${preview.ledger.totalAmount.toLocaleString()}원`
    + ` · 개강대기 ${preview.ledger.openingWaitlistCount} / 일반 ${preview.ledger.regularCount}\n`);

  const byStatus = (s) => preview.rows.filter((r) => r.status === s);

  console.log(`✅ 발급 가능(ready): ${preview.stats.ready}건`);
  for (const r of byStatus('ready')) {
    console.log(`   ${r.name}(${r.memberPhone}) ${r.paymentDate} → ${r.startDate}~${r.expiryDate}`
      + ` ${r.months}개월 ${r.amount.toLocaleString()}원${r.openingWaitlist ? ' [개강대기]' : ''}`);
  }

  const heldStatuses = ['unmatched', 'ambiguous', 'already_issued'];
  const held = preview.rows.filter((r) => heldStatuses.includes(r.status));
  console.log(`\n⏭️  보류: ${held.length}건`
    + ` (unmatched ${preview.stats.unmatched} · ambiguous ${preview.stats.ambiguous} · 중복 ${preview.stats.alreadyIssued})`);
  for (const r of held) {
    console.log(`   ${r.name} ${r.paymentDate} ${r.months}개월 — ${r.status}: ${r.reason ?? ''}`);
  }

  if (APPLY) {
    console.log(`\n🎉 발급 완료: ${preview.issued}건`);
  } else {
    console.log('\n[dry-run] 실제 발급하지 않았습니다. 적용하려면 --apply 를 붙이세요.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
