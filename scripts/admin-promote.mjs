#!/usr/bin/env node
/**
 * Admin promotion CLI.
 *
 * Usage:
 *   node scripts/admin-promote.mjs <phone>          # promote
 *   node scripts/admin-promote.mjs <phone> --demote # demote
 *   node scripts/admin-promote.mjs --list           # list current admins
 *
 * Requires DATABASE_URL in env (reads .env.local automatically).
 */
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

// ── Load .env.local manually so we don't pull in dotenv as a dep ───────
function loadEnv() {
  const candidates = ['.env.local', '.env'];
  for (const name of candidates) {
    const p = path.resolve(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (!m) continue;
      const [, k, v] = m;
      if (process.env[k] === undefined) process.env[k] = v.replace(/^['"]|['"]$/g, '');
    }
  }
}

loadEnv();

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Usage:
  node scripts/admin-promote.mjs <phone>            promote member to admin
  node scripts/admin-promote.mjs <phone> --demote   demote admin back to member
  node scripts/admin-promote.mjs --list             list current admins`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Configure it in .env.local or your environment.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  ssl: /sslmode=require|render\.com|neon\.tech|supabase|amazonaws/i.test(url)
    ? { rejectUnauthorized: false }
    : false,
});

async function main() {
  if (args[0] === '--list') {
    const { rows } = await pool.query(
      `SELECT id, name, phone, email, role, is_active FROM members WHERE role = 'admin' ORDER BY name`
    );
    if (rows.length === 0) {
      console.log('(no admins)');
    } else {
      for (const r of rows) {
        console.log(`- ${r.name} (${r.phone}) [${r.id}] ${r.is_active ? 'active' : 'inactive'}`);
      }
    }
    return;
  }

  const phoneRaw = args[0];
  const demote = args.includes('--demote');
  if (!phoneRaw || phoneRaw.startsWith('--')) {
    console.error('Phone number is required.');
    process.exit(2);
  }

  // Normalise: strip spaces, accept either "010-1234-5678" or "01012345678".
  const phone = phoneRaw.replace(/\s+/g, '');
  const candidates = new Set([phone]);
  // 01012345678 → 010-1234-5678
  if (/^\d{11}$/.test(phone)) {
    candidates.add(`${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`);
  }
  // 010-1234-5678 → 01012345678
  if (/^\d{3}-\d{4}-\d{4}$/.test(phone)) {
    candidates.add(phone.replace(/-/g, ''));
  }

  const placeholders = [...candidates].map((_, i) => `$${i + 1}`).join(',');
  const findQ = `SELECT id, name, phone, role FROM members WHERE phone IN (${placeholders}) LIMIT 1`;
  const found = await pool.query(findQ, [...candidates]);
  const member = found.rows[0];
  if (!member) {
    console.error(`No member found for phone: ${phoneRaw}`);
    process.exit(3);
  }

  const newRole = demote ? 'member' : 'admin';
  if (member.role === newRole) {
    console.log(`${member.name} (${member.phone}) is already ${newRole}. No change.`);
    return;
  }

  await pool.query(`UPDATE members SET role = $1, updated_at = NOW() WHERE id = $2`, [newRole, member.id]);
  console.log(`OK — ${member.name} (${member.phone}) is now ${newRole.toUpperCase()}.`);
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error(err);
    pool.end().catch(() => {});
    process.exit(1);
  });
