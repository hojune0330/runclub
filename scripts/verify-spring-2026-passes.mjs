#!/usr/bin/env node
/**
 * src/lib/spring-2026-passes.ts 가 생성하는 40건이 오너 확정 장부와
 * 정확히 일치하는지 검증한다. (DB 불필요 · 순수 계산 검증)
 *
 *   npx tsx scripts/verify-spring-2026-passes.mjs
 *
 * 기대값은 오너가 확정한 최종 표(시작/종료/개월/개강대기 플래그)를 그대로 박아둔다.
 * 규칙(pass-term.ts)이나 데이터를 건드렸을 때 회귀를 즉시 잡기 위한 골든 테스트.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modUrl = pathToFileURL(path.resolve(process.cwd(), 'src/lib/spring-2026-passes.ts')).href;
const { buildSpring2026Passes, springPassSummary } = await import(modUrl);

// [이름, 시작 M/D, 종료 M/D, 개월, 개강대기]
const expected = [
  ['한혜지','5/6','6/5',1,true],['윤용기','5/6','6/5',1,true],['김은영','5/6','6/5',1,true],['류진희','5/6','6/5',1,true],
  ['김준택','5/6','6/5',1,true],['임안나','5/6','6/5',1,true],['김화경','5/6','6/5',1,true],['유명훈','5/6','6/5',1,true],
  ['노혜윤','5/6','6/5',1,true],['김명성','5/6','6/5',1,true],['유명훈','5/6','7/5',2,true],['최윤희','5/6','6/5',1,true],
  ['임주혁','5/6','6/5',1,true],['권준욱','5/6','8/4',3,true],['임송이','5/6','6/5',1,false],['조수연','5/13','6/12',1,false],
  ['조정호','5/23','6/22',1,false],['김도연','5/24','8/22',3,false],['오세욱','5/24','8/22',3,false],['정보민','5/24','8/22',3,false],
  ['이영훈','5/24','8/22',3,false],['고은희','5/26','8/24',3,false],['정예빈','5/29','6/28',1,false],['류서윤','5/30','6/29',1,false],
  ['홍지표','5/30','6/29',1,false],['홍은서','5/28','6/27',1,false],['김하나','6/3','7/3',1,false],['김준택','6/3','7/3',1,false],
  ['서보경','6/2','7/2',1,false],['김소영','5/1','7/30',3,false],['이지환','5/6','8/4',3,true],['김영환','5/6','8/4',3,true],
  ['정연경','6/2','7/2',1,false],['김동근','6/3','9/1',3,false],['전명익','5/6','8/4',3,true],['서보경','6/12','9/10',3,false],
  ['서희성','6/12','9/10',3,false],['송현섭','6/12','9/10',3,false],['박용진','5/8','6/7',1,false],['김원혁','5/8','6/7',1,false],
];

const md = (iso) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}`; };
const recs = buildSpring2026Passes();
let fail = 0;

recs.forEach((r, i) => {
  const [en, es, ee, em, ew] = expected[i];
  const gs = md(r.startDate), ge = md(r.expiryDate);
  if (!(r.name === en && gs === es && ge === ee && r.months === em && r.openingWaitlist === ew)) {
    fail++;
    console.log(`MISMATCH #${i} ${r.name}: got ${gs}->${ge} m${r.months} wl=${r.openingWaitlist} | exp ${en} ${es}->${ee} m${em} wl=${ew}`);
  }
});

const s = springPassSummary();
console.log(`건수 ${s.count} · 금액합 ${s.totalAmount.toLocaleString()}원 · 개강대기 ${s.openingWaitlistCount} / 일반 ${s.regularCount}`);
console.log(fail === 0 ? '✅ 40개 행이 확정 장부와 모두 일치합니다.' : `❌ ${fail}건 불일치`);

if (fail !== 0 || s.count !== 40 || s.totalAmount !== 690000) process.exit(1);
