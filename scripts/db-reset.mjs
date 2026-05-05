#!/usr/bin/env node
/**
 * DROP all tables in the database (DEV / staging only).
 *
 * Usage:
 *   node scripts/db-reset.mjs          # asks for confirmation
 *   node scripts/db-reset.mjs --yes    # skip confirmation
 *
 * Refuses to run when NODE_ENV=production unless ALLOW_DB_RESET=true.
 */
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

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

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DB_RESET !== 'true') {
  console.error('Refusing to reset production database. Set ALLOW_DB_RESET=true to override.');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const yes = process.argv.includes('--yes') || process.argv.includes('-y');

async function confirm() {
  if (yes) return true;
  const rl = readline.createInterface({ input, output });
  const ans = await rl.question(`This will DROP ALL TABLES on:\n  ${url.replace(/:[^:@]+@/, ':***@')}\nType 'reset' to continue: `);
  rl.close();
  return ans.trim() === 'reset';
}

const TABLES = [
  'qr_tokens', 'notice_reads', 'notices', 'member_passes', 'pass_products',
  'waitlist', 'reservations', 'sessions', 'members'
];

const pool = new Pool({
  connectionString: url,
  ssl: /sslmode=require|render\.com|neon\.tech|supabase|amazonaws/i.test(url)
    ? { rejectUnauthorized: false }
    : false,
});

async function main() {
  if (!(await confirm())) { console.log('Aborted.'); return; }
  for (const t of TABLES) {
    await pool.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    console.log(`dropped: ${t}`);
  }
  console.log('Done.');
}

main()
  .then(() => pool.end())
  .catch(err => { console.error(err); pool.end().catch(()=>{}); process.exit(1); });
