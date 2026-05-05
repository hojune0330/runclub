#!/usr/bin/env node
/**
 * Pre-deploy sanity check for production seeding.
 *
 * Verifies that the environment variables you'd set on Render satisfy the
 * SEED_MODE=production requirements *before* you push to production:
 *
 *   - DATABASE_URL          present (warned if obviously local)
 *   - JWT_SECRET            ≥ 32 characters
 *   - SEED_MODE             === 'production'
 *   - ALLOW_SEED            === 'true'
 *   - SEED_TOKEN            ≥ 16 characters
 *   - SEED_ADMIN_PHONE      matches 010-XXXX-XXXX
 *   - SEED_ADMIN_PASSWORD   ≥ 8 chars, contains letters AND digits
 *   - SEED_ADMIN_NAME       non-empty (defaults to '관리자' when unset — warn)
 *   - SEED_ADMIN_EMAIL      optional, but if set must look like an email
 *
 * Usage (loads .env.local by default):
 *   node scripts/verify-prod-seed.mjs
 *
 * Override values inline (recommended for testing Render-style env):
 *   SEED_MODE=production \
 *   ALLOW_SEED=true \
 *   SEED_TOKEN=xxxxxxxxxxxxxxxx \
 *   SEED_ADMIN_PHONE=010-1234-5678 \
 *   SEED_ADMIN_PASSWORD=Run!Club2026 \
 *   SEED_ADMIN_NAME='실운영 관리자' \
 *   node scripts/verify-prod-seed.mjs
 *
 * Exits 0 on PASS, 1 on FAIL. Prints WARN lines but does not fail on them.
 */
import fs from 'node:fs';
import path from 'node:path';

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

const errors = [];
const warns = [];
const oks = [];

function ok(msg)   { oks.push(msg); }
function warn(msg) { warns.push(msg); }
function fail(msg) { errors.push(msg); }

const env = process.env;

// ── DATABASE_URL ─────────────────────────────────────────────────
if (!env.DATABASE_URL) {
  fail('DATABASE_URL is not set');
} else {
  ok('DATABASE_URL present');
  if (/127\.0\.0\.1|localhost/.test(env.DATABASE_URL)) {
    warn('DATABASE_URL points to localhost — make sure you set the real Render URL on the dashboard');
  }
}

// ── JWT_SECRET ───────────────────────────────────────────────────
if (!env.JWT_SECRET) {
  fail('JWT_SECRET is not set');
} else if (env.JWT_SECRET.length < 32) {
  fail(`JWT_SECRET is only ${env.JWT_SECRET.length} chars — must be ≥ 32`);
} else if (/dev-local|please-replace|replace-me/i.test(env.JWT_SECRET)) {
  fail('JWT_SECRET looks like a placeholder/dev value');
} else {
  ok(`JWT_SECRET length=${env.JWT_SECRET.length}`);
}

// ── SEED_MODE ────────────────────────────────────────────────────
if (env.SEED_MODE !== 'production') {
  fail(`SEED_MODE must be 'production' for prod (got '${env.SEED_MODE ?? '(unset)'}')`);
} else {
  ok('SEED_MODE=production');
}

// ── ALLOW_SEED ───────────────────────────────────────────────────
if (env.ALLOW_SEED !== 'true') {
  fail(`ALLOW_SEED must be 'true' to permit /api/seed in production (got '${env.ALLOW_SEED ?? '(unset)'}')`);
} else {
  ok('ALLOW_SEED=true');
  warn('Remember to flip ALLOW_SEED back to false (and unset SEED_TOKEN) immediately after first seed');
}

// ── SEED_TOKEN ───────────────────────────────────────────────────
if (!env.SEED_TOKEN) {
  fail('SEED_TOKEN is not set (required while ALLOW_SEED=true)');
} else if (env.SEED_TOKEN.length < 16) {
  fail(`SEED_TOKEN is only ${env.SEED_TOKEN.length} chars — must be ≥ 16`);
} else {
  ok(`SEED_TOKEN length=${env.SEED_TOKEN.length}`);
}

// ── SEED_ADMIN_PHONE ─────────────────────────────────────────────
if (!env.SEED_ADMIN_PHONE) {
  fail('SEED_ADMIN_PHONE is not set');
} else if (!/^010-\d{4}-\d{4}$/.test(env.SEED_ADMIN_PHONE)) {
  fail(`SEED_ADMIN_PHONE='${env.SEED_ADMIN_PHONE}' must match 010-XXXX-XXXX`);
} else {
  ok(`SEED_ADMIN_PHONE=${env.SEED_ADMIN_PHONE}`);
}

// ── SEED_ADMIN_PASSWORD ──────────────────────────────────────────
const pw = env.SEED_ADMIN_PASSWORD ?? '';
if (!pw) {
  fail('SEED_ADMIN_PASSWORD is not set');
} else if (pw.length < 8) {
  fail(`SEED_ADMIN_PASSWORD is only ${pw.length} chars — must be ≥ 8`);
} else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
  fail('SEED_ADMIN_PASSWORD must contain both letters and digits');
} else if (/^(admin|test1234|password|qwerty|letmein|welcome)$/i.test(pw)) {
  fail(`SEED_ADMIN_PASSWORD='${pw}' is a known weak password`);
} else {
  ok(`SEED_ADMIN_PASSWORD strength OK (${pw.length} chars)`);
}

// ── SEED_ADMIN_NAME ──────────────────────────────────────────────
if (!env.SEED_ADMIN_NAME) {
  warn("SEED_ADMIN_NAME is not set — admin will be created as '관리자' (you can edit later)");
} else {
  ok(`SEED_ADMIN_NAME=${env.SEED_ADMIN_NAME}`);
}

// ── SEED_ADMIN_EMAIL (optional) ──────────────────────────────────
if (env.SEED_ADMIN_EMAIL) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.SEED_ADMIN_EMAIL)) {
    fail(`SEED_ADMIN_EMAIL='${env.SEED_ADMIN_EMAIL}' is not a valid email`);
  } else {
    ok(`SEED_ADMIN_EMAIL=${env.SEED_ADMIN_EMAIL}`);
  }
}

// ── NODE_ENV ─────────────────────────────────────────────────────
if (env.NODE_ENV !== 'production') {
  warn(`NODE_ENV is '${env.NODE_ENV ?? '(unset)'}' — Render sets this to 'production' for you, so this check just confirms what your shell sees right now`);
} else {
  ok('NODE_ENV=production');
}

// ── Output ───────────────────────────────────────────────────────
console.log('\n── PASS ──');
oks.forEach(m => console.log(`  ✓ ${m}`));
if (warns.length) {
  console.log('\n── WARN ──');
  warns.forEach(m => console.log(`  ! ${m}`));
}
if (errors.length) {
  console.log('\n── FAIL ──');
  errors.forEach(m => console.log(`  ✗ ${m}`));
  console.log(`\n${errors.length} blocking issue(s). Fix the env vars and re-run.\n`);
  process.exit(1);
}

console.log('\nAll required production-seed env vars look good. Safe to deploy.\n');
