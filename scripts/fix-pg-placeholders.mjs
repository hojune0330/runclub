#!/usr/bin/env node
/**
 * Follow-up codemod: walk every `dbAll(`, `dbGet(`, `dbRun(` call site,
 * find the first argument (the SQL string), and rewrite SQLite-style `?`
 * placeholders to PostgreSQL-style `$1, $2, …`.
 *
 * The previous migration script accidentally skipped placeholders inside
 * backtick-quoted multiline strings; this pass repairs them.
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

function rewritePlaceholdersInSql(sql) {
  let i = 0;
  let out = '';
  let n = 1;
  let inSingle = false;
  while (i < sql.length) {
    const c = sql[i];
    if (inSingle) {
      out += c;
      if (c === '\\' && i + 1 < sql.length) {
        out += sql[i + 1];
        i += 2;
        continue;
      }
      if (c === "'") inSingle = false;
      i++;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      out += c;
      i++;
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

/**
 * Find the SQL argument range inside a `dbXxx(<sql>, ...)` call.
 * The SQL argument is delimited by either backticks or single/double quotes,
 * starting right after `(` (and optional whitespace/newline).
 *
 * Returns null when the call doesn't start with a string literal (e.g. when
 * a variable is passed). For our codebase that case is the dynamic-query
 * pattern with `query += ...; await dbAll(query, params);` — those lines
 * are handled separately by `rewriteAccumulatedQueryStrings()` below.
 */
function findSqlLiteralRange(src, callOpenIdx) {
  let i = callOpenIdx + 1;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (i >= src.length) return null;
  const q = src[i];
  if (q !== '`' && q !== "'" && q !== '"') return null;
  const start = i + 1;
  let j = start;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === q) {
      return { quote: q, start, end: j };
    }
    j++;
  }
  return null;
}

function rewriteHelperCalls(src) {
  const re = /\b(dbAll|dbGet|dbRun)\s*\(/g;
  let m;
  let result = '';
  let lastIdx = 0;
  while ((m = re.exec(src)) !== null) {
    const callOpen = m.index + m[0].length - 1; // index of `(`
    const range = findSqlLiteralRange(src, callOpen);
    if (!range) continue;
    const sql = src.slice(range.start, range.end);
    if (!sql.includes('?')) continue;
    const newSql = rewritePlaceholdersInSql(sql);
    if (newSql === sql) continue;
    result += src.slice(lastIdx, range.start) + newSql;
    lastIdx = range.end;
  }
  result += src.slice(lastIdx);
  return result;
}

/**
 * Some routes assemble SQL dynamically into a `query` variable using
 * string concatenation (`query += ' WHERE x = ?'`) and then call
 * `await dbAll(query, params)`. We can't rely on placeholder counting
 * across statements, but in our codebase the *order* of `?` is always
 * stable (left-to-right). We rewrite each `query [+]= '...'` literal
 * by itself — the placeholders are numbered globally per file using a
 * shared counter that persists across all literals assigned to the same
 * `query` variable in a function.
 *
 * Implementation: for every line that looks like
 *     query += '… ? …'
 *     query  = '… ? …'
 *     let query = '… ? …'
 *     const query = '… ? …'
 * we rewrite `?` to `$N` while keeping a running counter that resets
 * whenever we encounter a `let query` / `const query` *initialiser*.
 */
function rewriteDynamicQueryStrings(src) {
  const lines = src.split('\n');
  let counter = 1;
  let inDynamic = false;
  const out = [];
  for (const line of lines) {
    // Reset counter on a new query initialiser.
    const initMatch = line.match(/^(\s*(?:let|const)\s+query\s*=\s*)(`|'|")/);
    if (initMatch) {
      counter = 1;
      inDynamic = true;
      out.push(rewriteLiteralOnLine(line, () => '$' + counter++));
      continue;
    }
    if (inDynamic && /^\s*query\s*\+?=/.test(line)) {
      out.push(rewriteLiteralOnLine(line, () => '$' + counter++));
      continue;
    }
    // We don't know when the dynamic block ends; safest to keep counter
    // valid across the function. The helper-call rewrite above is
    // independent of this, so other lines are unaffected.
    out.push(line);
  }
  return out.join('\n');
}

function rewriteLiteralOnLine(line, nextPh) {
  // Find every `?` that lies between matching string-literal delimiters
  // on this single line. Robust enough for our route code, which writes
  // SQL fragments on one line per concatenation.
  let res = '';
  let i = 0;
  let q = null;
  while (i < line.length) {
    const c = line[i];
    if (q) {
      if (c === '\\' && i + 1 < line.length) {
        res += c + line[i + 1];
        i += 2;
        continue;
      }
      if (c === '?') {
        res += nextPh();
        i++;
        continue;
      }
      if (c === q) {
        q = null;
        res += c;
        i++;
        continue;
      }
      res += c;
      i++;
      continue;
    }
    if (c === '`' || c === "'" || c === '"') {
      q = c;
      res += c;
      i++;
      continue;
    }
    res += c;
    i++;
  }
  return res;
}

let total = 0;
let changed = 0;
for (const f of listRouteFiles(ROOT)) {
  total++;
  const orig = fs.readFileSync(f, 'utf8');
  let next = orig;
  next = rewriteDynamicQueryStrings(next);
  next = rewriteHelperCalls(next);
  if (next !== orig) {
    fs.writeFileSync(f, next, 'utf8');
    console.log('fixed', path.relative(process.cwd(), f));
    changed++;
  }
}
console.log(`\nProcessed ${total} files, fixed ${changed}.`);
