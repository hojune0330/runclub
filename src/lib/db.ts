import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

/**
 * PostgreSQL data layer.
 *
 * Design notes
 * ────────────
 * - We use raw SQL through `pg` (not Drizzle's query builder) to keep API
 *   route code small and to make porting from the previous SQLite codebase
 *   trivial: every `?` placeholder becomes `$1, $2, …`.
 * - All call sites are async. Routes already used `await` for DB-side IO,
 *   so this matches the existing handler shape.
 * - Returned rows are plain JS objects with `snake_case` columns. Routes
 *   project them into `camelCase` exactly the same way they did before.
 * - SQLite-specific types are normalised:
 *     INTEGER (0/1)        → BOOLEAN   (e.g. is_active, is_indoor)
 *     TEXT timestamp       → TIMESTAMPTZ (use NOW(); ISO strings still parse)
 *     `datetime('now')`    → `NOW()`
 *     auto-incremented PKs → still TEXT IDs (we generate them in app code)
 *
 * Connection
 * ──────────
 * Provide DATABASE_URL. For local development, run a Postgres via Docker:
 *   docker run --name runclub-pg -e POSTGRES_PASSWORD=runclub \
 *     -e POSTGRES_DB=runclub -p 5432:5432 -d postgres:16
 *   export DATABASE_URL=postgres://postgres:runclub@localhost:5432/runclub
 */

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Allow build-time imports (e.g. `next build`) without a DB by deferring
  // the failure until the pool is actually used.
  console.warn('[db] DATABASE_URL is not set — DB calls will fail until configured.');
}

let _pool: Pool | null = null;
let _initPromise: Promise<void> | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  if (!DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Set it in your environment (e.g. .env.local for dev, Render dashboard for prod).'
    );
  }
  _pool = new Pool({
    connectionString: DATABASE_URL,
    // Render's PG requires SSL; when running locally we skip it.
    ssl: /sslmode=require|render\.com|neon\.tech|supabase|amazonaws/i.test(DATABASE_URL)
      ? { rejectUnauthorized: false }
      : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  _pool.on('error', err => {
    console.error('[db] unexpected pool error', err);
  });
  return _pool;
}

/**
 * Run a parameterised query and return all rows.
 * Replaces `db.prepare(sql).all(...params)`.
 */
export async function dbAll<T extends QueryResultRow = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const result: QueryResult<T> = await getPool().query<T>(sql, params);
  return result.rows;
}

/**
 * Run a parameterised query and return the first row (or undefined).
 * Replaces `db.prepare(sql).get(...params)`.
 */
export async function dbGet<T extends QueryResultRow = any>(
  sql: string,
  params: any[] = []
): Promise<T | undefined> {
  const result: QueryResult<T> = await getPool().query<T>(sql, params);
  return result.rows[0];
}

/**
 * Execute a statement (INSERT/UPDATE/DELETE) and return rowCount.
 * Replaces `db.prepare(sql).run(...params)`.
 */
export async function dbRun(sql: string, params: any[] = []): Promise<number> {
  const result = await getPool().query(sql, params);
  return result.rowCount ?? 0;
}

/**
 * Execute multiple statements within a single transaction.
 */
export async function dbTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

// ─── Helper: generate unique ID ───
//
// EXT-M1: Use crypto.randomBytes instead of Math.random so IDs are
// unpredictable. The id is still short and URL-safe, but no longer
// guessable by anyone who has seen a few prior IDs.
export function genId(prefix: string = ''): string {
  const ts = Date.now().toString(36);
  // 9 random bytes → 12 base64url chars (≈72 bits of entropy).
  const rand = randomBytes(9).toString('base64url');
  return prefix ? `${prefix}_${ts}${rand}` : `${ts}${rand}`;
}

// ─── Schema bootstrap (idempotent) ───
// Called once per process. Creates tables/indexes if they don't exist.
async function initSchema(): Promise<void> {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS members (
      id                    TEXT PRIMARY KEY,
      name                  TEXT NOT NULL,
      phone                 TEXT NOT NULL UNIQUE,
      email                 TEXT,
      password_hash         TEXT NOT NULL,
      role                  TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
      join_date             TEXT NOT NULL,
      is_active             BOOLEAN NOT NULL DEFAULT TRUE,
      memo                  TEXT,
      profile_image         TEXT,
      must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS sessions (
      id                       TEXT PRIMARY KEY,
      name                     TEXT NOT NULL,
      type                     TEXT NOT NULL CHECK (type IN ('ebw','slowrun','marathon')),
      date                     TEXT NOT NULL,
      start_time               TEXT NOT NULL,
      end_time                 TEXT,
      location                 TEXT DEFAULT '',
      location_address         TEXT DEFAULT '',
      location_map_url         TEXT,
      max_capacity             INTEGER NOT NULL,
      status                   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
      is_indoor                BOOLEAN NOT NULL DEFAULT FALSE,
      memo                     TEXT,
      memo_public              BOOLEAN NOT NULL DEFAULT FALSE,
      cancel_deadline_minutes  INTEGER NOT NULL DEFAULT 120,
      recurring_group_id       TEXT,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS reservations (
      id              TEXT PRIMARY KEY,
      member_id       TEXT NOT NULL REFERENCES members(id),
      session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      status          TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','attended','noshow','cancelled')),
      reserved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checked_in_at   TIMESTAMPTZ,
      cancelled_at    TIMESTAMPTZ,
      pass_id         TEXT,
      UNIQUE (member_id, session_id, status)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id           TEXT PRIMARY KEY,
      member_id    TEXT NOT NULL REFERENCES members(id),
      session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      position     INTEGER NOT NULL,
      status       TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','offered','confirmed','expired','cancelled')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      offered_at   TIMESTAMPTZ,
      expires_at   TIMESTAMPTZ
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS pass_products (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      category             TEXT NOT NULL CHECK (category IN ('count','season','monthly')),
      applicable_sessions  TEXT NOT NULL DEFAULT 'all',
      total_count          INTEGER,
      duration_days        INTEGER NOT NULL,
      price                INTEGER NOT NULL,
      description          TEXT,
      is_active            BOOLEAN NOT NULL DEFAULT TRUE,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS member_passes (
      id               TEXT PRIMARY KEY,
      member_id        TEXT NOT NULL REFERENCES members(id),
      product_id       TEXT NOT NULL REFERENCES pass_products(id),
      total_count      INTEGER,
      remaining_count  INTEGER,
      start_date       TEXT NOT NULL,
      expiry_date      TEXT NOT NULL,
      issued_date      TEXT NOT NULL,
      price            INTEGER NOT NULL,
      status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','paused','refunded')),
      paused_at        TIMESTAMPTZ,
      paused_until     TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS notices (
      id               TEXT PRIMARY KEY,
      title            TEXT NOT NULL,
      content          TEXT NOT NULL,
      target_sessions  TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS notice_reads (
      notice_id   TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
      member_id   TEXT NOT NULL REFERENCES members(id),
      read_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (notice_id, member_id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS qr_tokens (
      id           TEXT PRIMARY KEY,
      session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      token        TEXT NOT NULL UNIQUE,
      expires_at   TIMESTAMPTZ NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbRun(`CREATE INDEX IF NOT EXISTS idx_sessions_date         ON sessions(date)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_reservations_member   ON reservations(member_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_reservations_session  ON reservations(session_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_member_passes_member  ON member_passes(member_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_waitlist_session      ON waitlist(session_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_qr_tokens_session     ON qr_tokens(session_id)`);

  // ─── Lightweight, idempotent schema migrations ───
  // Only forward, only safe (ADD COLUMN IF NOT EXISTS). Keep them tiny.
  await dbRun(`
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE
  `);
  // EXT-H7: token_version is bumped to invalidate all previously issued JWTs
  // (e.g. on password change, account deactivation, suspected compromise).
  await dbRun(`
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
  `);
  // EXT-I8: Per-account login-failure tracking. Combined with the existing
  // per-IP rate limit, this stops password-spray attacks that come from a
  // changing IP pool but always target the same handful of accounts.
  await dbRun(`
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0
  `);
  await dbRun(`
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ
  `);
}

/**
 * Ensure the schema is initialised exactly once per process.
 * Called automatically by every public API in this module.
 */
export async function ensureSchema(): Promise<void> {
  if (!_initPromise) _initPromise = initSchema();
  await _initPromise;
}

// ─── Has the DB been seeded? ───
export async function isSeeded(): Promise<boolean> {
  await ensureSchema();
  try {
    const row = await dbGet<{ count: string }>('SELECT COUNT(*)::text AS count FROM members');
    return Number(row?.count ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─── Seed initial data ───
//
// Modes:
//   'production': the FIRST admin is created from env vars
//     (SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME).
//     Pass products and recurring sessions are seeded.
//     NO demo members, NO demo issued passes.
//
//   'demo' (default in dev): the original demo dataset is created — admin
//     account 010-0000-0000 / password 'admin' (must change on first login),
//     4 demo members (test1234), 3 sample issued passes.
//
// 우선순위: 명시적 인자 > SEED_MODE 환경변수 > NODE_ENV에 따른 기본값.
export async function seedDatabase(mode?: 'production' | 'demo') {
  await ensureSchema();

  const memberCountRow = await dbGet<{ count: string }>('SELECT COUNT(*)::text AS count FROM members');
  if (Number(memberCountRow?.count ?? 0) > 0) {
    return { message: 'Database already seeded' };
  }

  const isProd = process.env.NODE_ENV === 'production';
  const resolvedMode: 'production' | 'demo' =
    mode ??
    (process.env.SEED_MODE === 'production' || process.env.SEED_MODE === 'demo'
      ? (process.env.SEED_MODE as 'production' | 'demo')
      : isProd ? 'production' : 'demo');

  // ─── 1. Admin account ───
  if (resolvedMode === 'production') {
    const phone = (process.env.SEED_ADMIN_PHONE ?? '').trim();
    const pw = process.env.SEED_ADMIN_PASSWORD ?? '';
    const name = (process.env.SEED_ADMIN_NAME ?? '관리자').trim();
    const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim() || null;

    if (!/^010-\d{4}-\d{4}$/.test(phone)) {
      throw new Error('SEED_MODE=production requires SEED_ADMIN_PHONE in 010-1234-5678 format.');
    }
    // C5: Apply the same password policy as the user-facing validator —
    // length 8-64, must contain at least one letter and one digit, no whitespace.
    if (pw.length < 8 || pw.length > 64) {
      throw new Error('SEED_MODE=production requires SEED_ADMIN_PASSWORD between 8 and 64 characters.');
    }
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
      throw new Error('SEED_MODE=production requires SEED_ADMIN_PASSWORD to contain at least one letter and one digit.');
    }
    if (/\s/.test(pw)) {
      throw new Error('SEED_MODE=production requires SEED_ADMIN_PASSWORD without whitespace characters.');
    }

    const hash = await bcrypt.hash(pw, 12);
    const today = new Date().toISOString().split('T')[0];
    await dbRun(
      `INSERT INTO members (id, name, phone, email, password_hash, role, join_date, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, 'admin', $6, TRUE, FALSE)`,
      ['admin_001', name, phone, email, hash, today]
    );
  } else {
    // demo mode: legacy fixed admin used by the dev environment and the
    // automated mobile-E2E suite. Demo mode is never used in production
    // (production goes through SEED_MODE=production), so we don't force a
    // password change here — the test suite expects to log straight in.
    const adminHash = await bcrypt.hash('admin', 10);
    await dbRun(
      `INSERT INTO members (id, name, phone, email, password_hash, role, join_date, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, 'admin', $6, TRUE, FALSE)`,
      ['admin_001', '장호준 코치', '010-0000-0000', 'coach@runclub.kr', adminHash, '2025-01-01']
    );
  }

  // ─── 2. Demo members (demo mode only) ───
  let demoMemberCount = 0;
  if (resolvedMode === 'demo') {
    const memberHash = await bcrypt.hash('test1234', 10);
    const sampleMembers: Array<[string, string, string, string | null]> = [
      ['member_001', '강병규', '010-2345-6789', null],
      ['member_002', '안현지', '010-3456-7890', null],
      ['member_003', '정예진', '010-4567-8901', null],
      ['member_004', '김로운', '010-5678-9012', null],
    ];
    for (const [id, name, phone, email] of sampleMembers) {
      await dbRun(
        `INSERT INTO members (id, name, phone, email, password_hash, role, join_date, is_active, must_change_password)
         VALUES ($1, $2, $3, $4, $5, 'member', $6, TRUE, FALSE)`,
        [id, name, phone, email, memberHash, '2026-01-01']
      );
    }
    demoMemberCount = sampleMembers.length;
  }

  // ─── 3. Pass products (always — admin needs them to issue passes) ───
  const products: Array<[string, string, string, string, number | null, number, number]> = [
    ['pp_001', 'EBW 10회권', 'count', '["ebw"]', 10, 60, 200000],
    ['pp_002', 'EBW 20회권', 'count', '["ebw"]', 20, 90, 350000],
    ['pp_003', '런클럽(수/토) 10회권', 'count', '["slowrun","marathon"]', 10, 60, 150000],
    ['pp_004', '런클럽(수/토) 20회권', 'count', '["slowrun","marathon"]', 20, 90, 250000],
    ['pp_005', '시즌권', 'season', 'all', null, 90, 500000],
    ['pp_006', '월권', 'monthly', 'all', null, 30, 180000],
  ];
  for (const p of products) {
    await dbRun(
      `INSERT INTO pass_products (id, name, category, applicable_sessions, total_count, duration_days, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      p
    );
  }

  // ─── 4. Sample issued passes (demo mode only) ───
  let activePassCount = 0;
  if (resolvedMode === 'demo') {
    const todayStr = new Date().toISOString().split('T')[0];
    const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

    const passInsert = `
      INSERT INTO member_passes (id, member_id, product_id, total_count, remaining_count, start_date, expiry_date, issued_date, price, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
    `;
    await dbRun(passInsert, ['mp_001', 'member_001', 'pp_001', 10, 8, todayStr, addDays(55), todayStr, 200000]);
    await dbRun(passInsert, ['mp_002', 'member_002', 'pp_003', 10, 10, todayStr, addDays(60), todayStr, 150000]);
    await dbRun(passInsert, ['mp_003', 'member_003', 'pp_006', null, null, todayStr, addDays(29), todayStr, 180000]);
    activePassCount = 3;
  }

  // ─── 5. Recurring sessions ───
  const createdSessions = await generateRecurringSessions();

  return {
    message: 'Database seeded successfully',
    mode: resolvedMode,
    counts: {
      admin: 1,
      members: demoMemberCount,
      passProducts: products.length,
      activePasses: activePassCount,
      sessions: createdSessions,
    },
  };
}

// ─── 정기 세션 일괄 생성(백필) ───
// 기본적으로 오늘부터 2026-05-31까지 정기 스케줄을 채움.
// 이미 같은 날짜·시작시간·유형의 세션이 있으면 건너뜀(중복 방지).
// 반환값은 새로 INSERT한 세션 수.
export async function generateRecurringSessions(opts?: {
  from?: Date;
  to?: Date;
}): Promise<number> {
  await ensureSchema();
  const from = opts?.from ?? new Date();
  const to = opts?.to ?? new Date('2026-05-31T23:59:59');

  const toIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getOrCreateGroupId = async (seriesKey: string): Promise<string> => {
    const row = await dbGet<{ recurring_group_id: string }>(
      `SELECT recurring_group_id FROM sessions
       WHERE recurring_group_id LIKE $1 LIMIT 1`,
      [`rg_${seriesKey}_%`]
    );
    if (row?.recurring_group_id) return row.recurring_group_id;
    return `rg_${seriesKey}_${Date.now().toString(36)}`;
  };

  const ebwGroupId = await getOrCreateGroupId('ebw_mon');
  const slowGroupId = await getOrCreateGroupId('slow_wed');
  const marGroupId = await getOrCreateGroupId('mar_sat');

  let created = 0;

  const tryInsert = async (params: {
    id: string;
    name: string;
    type: 'ebw' | 'slowrun' | 'marathon';
    date: string;
    start: string;
    end: string;
    location: string;
    address: string;
    capacity: number;
    indoor: boolean;
    cancelMin: number;
    groupId: string;
    memo?: string | null;
  }) => {
    const exists = await dbGet(
      `SELECT id FROM sessions WHERE date = $1 AND start_time = $2 AND type = $3`,
      [params.date, params.start, params.type]
    );
    if (exists) return;
    await dbRun(
      `INSERT INTO sessions (
         id, name, type, date, start_time, end_time, location, location_address,
         max_capacity, status, is_indoor, memo, memo_public,
         cancel_deadline_minutes, recurring_group_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10, $11, FALSE, $12, $13)`,
      [
        params.id,
        params.name,
        params.type,
        params.date,
        params.start,
        params.end,
        params.location,
        params.address,
        params.capacity,
        params.indoor,
        params.memo ?? null,
        params.cancelMin,
        params.groupId,
      ]
    );
    created++;
  };

  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(to);
  endDay.setHours(23, 59, 59, 999);

  while (cursor <= endDay) {
    const iso = toIso(cursor);
    const dow = cursor.getDay(); // 0=일, 1=월, 3=수, 6=토

    if (dow === 1) {
      // 월: EBW 19:00 / 20:00 / 21:00
      const times: Array<[string, string]> = [
        ['19:00', '20:00'],
        ['20:00', '21:00'],
        ['21:00', '22:00'],
      ];
      for (const [s, e] of times) {
        await tryInsert({
          id: `ebw_${iso}_${s.replace(':', '')}`,
          name: 'EBW 실내 러닝',
          type: 'ebw',
          date: iso,
          start: s,
          end: e,
          location: 'EBW 러닝센터',
          address: '서울 송파구 올림픽로 ** (EBW 러닝센터)',
          capacity: 8,
          indoor: true,
          cancelMin: 120,
          groupId: ebwGroupId,
        });
      }
    } else if (dow === 3) {
      // 수: 슬로우 롱런 19:30~21:00
      await tryInsert({
        id: `slow_${iso}_1930`,
        name: '슬로우 롱런 클럽',
        type: 'slowrun',
        date: iso,
        start: '19:30',
        end: '21:00',
        location: '올림픽공원 평화의문',
        address: '서울 송파구 올림픽로 424 (평화의문 앞 집결)',
        capacity: 50,
        indoor: false,
        cancelMin: 60,
        groupId: slowGroupId,
        memo: '편안한 페이스의 LSD(Long Slow Distance) 세션. 날씨에 맞춰 복장 준비.',
      });
    } else if (dow === 6) {
      // 토: 아이오 마라톤 클래스 10:00~12:00
      await tryInsert({
        id: `mar_${iso}_1000`,
        name: '아이오 마라톤 클래스',
        type: 'marathon',
        date: iso,
        start: '10:00',
        end: '12:00',
        location: '잠실 종합운동장',
        address: '서울 송파구 올림픽로 25 (잠실 종합운동장 트랙)',
        capacity: 50,
        indoor: false,
        cancelMin: 120,
        groupId: marGroupId,
        memo: '대회 준비 맞춤 인터벌/템포런. 개인 페이스별 조 편성.',
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return created;
}
