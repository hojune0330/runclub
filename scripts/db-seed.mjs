#!/usr/bin/env node
/**
 * Seed the database with initial admin/member/pass-products data via the
 * running Next.js server's POST /api/seed endpoint. This guarantees we
 * always use the canonical seed routine in src/lib/db.ts (so SEED_MODE,
 * must_change_password, schema migrations etc. are applied consistently).
 *
 * Usage:
 *   npm run dev           # in another terminal
 *   npm run db:seed       # this script
 *
 * Environment:
 *   PORT          override server port (default 3000)
 *   SEED_TOKEN    forwarded as Authorization: Bearer <token> when set
 *
 * Why no direct-pg fallback? A standalone seed path quickly drifts out of
 * sync with src/lib/db.ts (column adds, mode flags, recurring sessions…)
 * and a half-seeded DB is worse than a clear error message.
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

const port = process.env.PORT || 3000;
const url = `http://localhost:${port}/api/seed`;
const headers = { 'Content-Type': 'application/json' };
if (process.env.SEED_TOKEN) headers['Authorization'] = `Bearer ${process.env.SEED_TOKEN}`;

try {
  const res = await fetch(url, { method: 'POST', headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Seed failed (${res.status}):`, body);
    process.exit(1);
  }
  console.log('Seeded:', body);
} catch (err) {
  console.error(`Could not reach ${url} — start the server first (npm run dev).`);
  console.error(`  ${err.message}`);
  process.exit(1);
}
