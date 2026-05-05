#!/usr/bin/env node
/**
 * One-shot codemod: convert API routes from better-sqlite3 to the
 * PostgreSQL helpers exposed by `src/lib/db.ts`.
 *
 * Transforms applied (per file):
 *   - `import { getDb, ... } from '@/lib/db'`
 *       → `import { dbAll, dbGet, dbRun, ... } from '@/lib/db'`
 *   - `const db = getDb();` → removed
 *   - `db.prepare(<sql>).all(<args>) as any[]` → `await dbAll(<sql>, [<args>])`
 *   - `db.prepare(<sql>).get(<args>) as any` / `as { ... }` → `await dbGet(<sql>, [<args>])`
 *   - `db.prepare(<sql>).run(<args>)` → `await dbRun(<sql>, [<args>])`
 *   - SQL placeholders `?` → `$1, $2, …` (one pass per .prepare() boundary)
 *   - SQLite `datetime('now')` → `NOW()`, `date('now')` → `CURRENT_DATE`
 *   - boolean comparisons:  ` = 1` → ` = TRUE`,  ` = 0` → ` = FALSE`
 *
 * Notes
 * ─────
 * The codemod intentionally rewrites *call boundaries* only — anything that
 * ends in `.all(...)`, `.get(...)`, or `.run(...)` directly off a prepared
 * statement. Multi-line SQL is preserved verbatim.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src/app/api');

function listRouteFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listRouteFiles(full));
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out;
}

function rewriteImport(src) {
  // Only touch imports from '@/lib/db'
  return src.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/db['"]\s*;?/g,
    (full, names) => {
      const items = names
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .filter(n => n !== 'getDb');
      const need = new Set(items);
      // We'll add helpers below if the file uses them. For now, mark placeholders;
      // we'll patch them again after rewriting the calls.
      // Always at least keep what was there.
      return `__DBIMPORT__(${[...need].join(',')})`;
    }
  );
}

function finalizeImport(src) {
  const usedAll = /\bdbAll\s*\(/.test(src);
  const usedGet = /\bdbGet\s*\(/.test(src);
  const usedRun = /\bdbRun\s*\(/.test(src);
  return src.replace(/__DBIMPORT__\(([^)]*)\)/, (_, names) => {
    const set = new Set(
      names
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
    if (usedAll) set.add('dbAll');
    if (usedGet) set.add('dbGet');
    if (usedRun) set.add('dbRun');
    const sorted = [...set].sort();
    return `import { ${sorted.join(', ')} } from '@/lib/db';`;
  });
}

function dropGetDbLines(src) {
  // Remove `const db = getDb();` (and surrounding blank line if it was alone)
  return src
    .replace(/^[ \t]*const\s+db\s*=\s*getDb\s*\(\s*\)\s*;?[ \t]*\r?\n/gm, '')
    .replace(/[ \t]*const\s+db\s*=\s*getDb\s*\(\s*\)\s*;?/g, '');
}

/**
 * Convert SQLite `?` placeholders to PostgreSQL `$1, $2, …`.
 * Quoted strings (single or double) and template literal interpolations are
 * skipped so that '?' inside SQL text stays literal where it appears outside
 * of a placeholder context. In our codebase placeholders are always bare `?`.
 */
function convertPlaceholders(sql) {
  let i = 0;
  let out = '';
  let n = 1;
  while (i < sql.length) {
    const c = sql[i];
    // Skip quoted strings
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += c;
      i++;
      while (i < sql.length) {
        const cc = sql[i];
        out += cc;
        i++;
        if (cc === '\\') {
          if (i < sql.length) {
            out += sql[i];
            i++;
          }
          continue;
        }
        if (cc === q) break;
      }
      continue;
    }
    if (c === '?') {
      out += '$' + n++;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function convertSqliteFunctions(sql) {
  return sql
    .replace(/datetime\(\s*'now'\s*\)/gi, 'NOW()')
    .replace(/date\(\s*'now'\s*\)/gi, 'CURRENT_DATE')
    // boolean integer comparisons inside WHERE clauses
    .replace(/(\bis_active\s*=\s*)1\b/g, '$1TRUE')
    .replace(/(\bis_active\s*=\s*)0\b/g, '$1FALSE')
    .replace(/(\bis_indoor\s*=\s*)1\b/g, '$1TRUE')
    .replace(/(\bis_indoor\s*=\s*)0\b/g, '$1FALSE')
    .replace(/(\bis_active\s*=\s*)1\b/g, '$1TRUE')
    .replace(/(\bmemo_public\s*=\s*)1\b/g, '$1TRUE')
    .replace(/(\bmemo_public\s*=\s*)0\b/g, '$1FALSE');
}

/**
 * Replace one occurrence of `db.prepare(<sql>).<method>(<args>)` and any
 * trailing `as Foo` cast with the corresponding helper call. Returns
 * { replaced, src }. Operates left-to-right by finding the first
 * `db.prepare(` and walking through balanced parentheses.
 */
function replaceFirstPreparedCall(src) {
  const idx = src.indexOf('db.prepare(');
  if (idx < 0) return { done: true, src };

  // Walk parentheses to find matching ) for prepare(
  const startSql = idx + 'db.prepare('.length;
  let depth = 1;
  let i = startSql;
  let inStr = null;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      inStr = c;
      i++;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  if (depth !== 0) return { done: true, src };

  const sqlEnd = i; // position of the closing ) of prepare(
  const sqlText = src.slice(startSql, sqlEnd);

  // After prepare(...), we expect either `.all(`, `.get(`, or `.run(`
  let after = sqlEnd + 1;
  // Skip whitespace
  while (after < src.length && /\s/.test(src[after])) after++;

  if (src[after] !== '.') return { done: false, src }; // unexpected
  let m = src.slice(after).match(/^\.(all|get|run)\s*\(/);
  if (!m) return { done: false, src };

  const method = m[1]; // all/get/run
  const argsStart = after + m[0].length;
  // Walk parens for args
  depth = 1;
  let j = argsStart;
  inStr = null;
  while (j < src.length && depth > 0) {
    const c = src[j];
    if (inStr) {
      if (c === '\\') {
        j += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      j++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      inStr = c;
      j++;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) break;
    }
    j++;
  }
  if (depth !== 0) return { done: true, src };

  const argsEnd = j;
  let argsText = src.slice(argsStart, argsEnd).trim();

  // Detect spread expansion: `...params`
  // We support either:
  //   - empty args
  //   - a single spread expression like `...params`
  //   - one or more explicit args
  let pgArgs = '[]';
  if (argsText.length > 0) {
    if (/^\.\.\./.test(argsText) && !/,/.test(argsText)) {
      // db.prepare(query).all(...params) → params is already an array
      pgArgs = argsText.slice(3).trim();
    } else {
      pgArgs = '[' + argsText + ']';
    }
  }

  // Look for trailing ` as <Type>` cast
  let castEnd = argsEnd + 1;
  // Skip whitespace
  while (castEnd < src.length && /\s/.test(src[castEnd])) castEnd++;
  let castMatch = src.slice(castEnd).match(/^as\s+([A-Za-z_$][\w$]*(?:\s*\[\s*\])?|\{[^{}]*\})/);
  let endOfWholeExpr = argsEnd + 1;
  if (castMatch) {
    endOfWholeExpr = castEnd + castMatch[0].length;
    // (We just drop the cast — helpers are already typed via generics if needed.)
  }

  // Build replacement
  const helper = method === 'all' ? 'dbAll' : method === 'get' ? 'dbGet' : 'dbRun';
  const newSql = convertPlaceholders(convertSqliteFunctions(sqlText));
  const replacement = `await ${helper}(${newSql.trim()}, ${pgArgs})`;

  const newSrc = src.slice(0, idx) + replacement + src.slice(endOfWholeExpr);
  return { done: false, src: newSrc };
}

function rewritePreparedCalls(src) {
  let cur = src;
  // Hard cap to avoid pathological loops.
  for (let n = 0; n < 200; n++) {
    const r = replaceFirstPreparedCall(cur);
    cur = r.src;
    if (r.done) break;
  }
  return cur;
}

/** Add `await` to `genId`-using inserts? No — genId is sync. Nothing to do. */

function processFile(file) {
  const orig = fs.readFileSync(file, 'utf8');
  let src = orig;
  src = rewriteImport(src);
  src = dropGetDbLines(src);
  src = rewritePreparedCalls(src);
  src = finalizeImport(src);

  if (src !== orig) {
    fs.writeFileSync(file, src, 'utf8');
    console.log('rewrote', path.relative(process.cwd(), file));
    return true;
  }
  return false;
}

let total = 0;
let changed = 0;
for (const f of listRouteFiles(ROOT)) {
  total++;
  if (processFile(f)) changed++;
}
console.log(`\nProcessed ${total} files, rewrote ${changed}.`);
