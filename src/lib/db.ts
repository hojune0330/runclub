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
  // HOTFIX: 회원가입 동시 폭주 시 풀 고갈로 다른 트래픽까지 멈추던 문제 대응.
  // - max 10 → 20 (Render Starter Postgres 의 max_connections 기본값
  //   97 안에서 안전. Sheets sync 워커/요청 폭주 동시 발생 시 여유 확보).
  // - connectionTimeoutMillis 추가: 풀 만석일 때 무한 대기 대신 5초 안에
  //   503 으로 떨어지도록 (사용자 측 폼 타임아웃이 우선 발화하지 않게).
  // - 환경변수 DB_POOL_MAX 로 운영 중 추가 튜닝 가능.
  const poolMax = Math.max(5, Math.min(50, Number(process.env.DB_POOL_MAX) || 20));
  _pool = new Pool({
    connectionString: DATABASE_URL,
    // Render's PG requires SSL; when running locally we skip it.
    ssl: /sslmode=require|render\.com|neon\.tech|supabase|amazonaws/i.test(DATABASE_URL)
      ? { rejectUnauthorized: false }
      : false,
    max: poolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
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

  // ─── Sheets member metadata import columns ───────────────────────────────
  // Members sheet J~O are intentionally manager-editable. Core profile fields
  // still belong to the DB/web app, but these safe CRM-style metadata columns
  // can be reviewed and imported back into the web admin view.
  await dbRun(`
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS sheet_manager_memo       TEXT,
      ADD COLUMN IF NOT EXISTS sheet_tag                TEXT,
      ADD COLUMN IF NOT EXISTS sheet_member_grade       TEXT,
      ADD COLUMN IF NOT EXISTS sheet_acquisition_source TEXT,
      ADD COLUMN IF NOT EXISTS sheet_next_contact_date  TEXT,
      ADD COLUMN IF NOT EXISTS sheet_assigned_manager   TEXT,
      ADD COLUMN IF NOT EXISTS sheet_meta_synced_at     TIMESTAMPTZ
  `);

  // ─── PR-6: Pass catalog & checkout columns ───
  //
  // pass_products gets richer "merchant catalog" fields so the future
  // checkout page can render a real menu (description_long for full
  // marketing copy + refund_policy, original_price for strikethrough
  // pricing, image_url for hero image, display_order for manual sort,
  // is_featured for the "추천" badge).
  //
  // member_passes gets the payment-state envelope. Today the admin fills
  // these manually at issue-time (cash / transfer / external card / unpaid);
  // when the Toss Payments SDK lands, the webhook handler will UPDATE the
  // exact same row by transaction_id. Keeping a single row per pass (not
  // a separate payments table) is enough for v1 because we don't yet
  // support partial payments or installment plans — when we do, we can
  // graduate to a child `payments` table without touching this column set.
  await dbRun(`
    ALTER TABLE pass_products
      ADD COLUMN IF NOT EXISTS description_long TEXT,
      ADD COLUMN IF NOT EXISTS refund_policy    TEXT,
      ADD COLUMN IF NOT EXISTS original_price   INTEGER,
      ADD COLUMN IF NOT EXISTS image_url        TEXT,
      ADD COLUMN IF NOT EXISTS display_order    INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_featured      BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ
  `);
  await dbRun(`
    ALTER TABLE member_passes
      ADD COLUMN IF NOT EXISTS payment_status  TEXT NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid','paid','refunded','partial_refund')),
      ADD COLUMN IF NOT EXISTS payment_method  TEXT,
      ADD COLUMN IF NOT EXISTS payment_amount  INTEGER,
      ADD COLUMN IF NOT EXISTS paid_at         TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS transaction_id  TEXT,
      ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS discount_reason TEXT,
      ADD COLUMN IF NOT EXISTS admin_memo      TEXT,
      ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_pass_products_active_order
      ON pass_products(is_active DESC, display_order ASC, price ASC)
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_member_passes_payment_status
      ON member_passes(payment_status)
  `);

  // ─── PR-7: Session "pre-registration info" columns ─────────────────────
  // Adds optional rich-info fields the admin can edit per session so members
  // see context (description, event link, Instagram review, OpenChat link,
  // ribbon badge, cover image) BEFORE they decide to register. All columns
  // are nullable / safe-default so existing rows keep working unchanged.
  await dbRun(`
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS description          TEXT,
      ADD COLUMN IF NOT EXISTS event_url            TEXT,
      ADD COLUMN IF NOT EXISTS instagram_url        TEXT,
      ADD COLUMN IF NOT EXISTS kakao_openchat_url   TEXT,
      ADD COLUMN IF NOT EXISTS ribbon               TEXT,
      ADD COLUMN IF NOT EXISTS cover_image_url      TEXT,
      ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ
  `);

  // ─── PR-C2: 오버부킹/대기예약 (정원의 N% 추가 수용 허용) ──────────────────
  // 사용자 요구: "정원의 10%는 중복 예약 되더라도 참석 가능". 정원 8명이면
  // 0.10 비율로 floor(8 × 0.10) = 0 (8명 만석 시 9번째는 대기), 정원 10명
  // 이면 ceil(10 × 0.10) = 1 (즉 11번째까지는 즉시 예약 가능, 12번째부터
  // 대기). 일단 ceil 로 가는 게 운영 의도에 가까우므로 reservation API 에서
  // ceil 로 계산한다. 컬럼은 기본 0.10. 음수/너무 큰 값은 API 레이어에서
  // 0..0.5 로 clamp.
  await dbRun(`
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS overbook_ratio NUMERIC(4,3) NOT NULL DEFAULT 0.10
  `);

  // ─── PR-C1: Tag-based session ↔ pass-product matching ──────────────────
  // 기존에는 sessions.type(enum 3종)과 pass_products.applicable_sessions(JSON)
  // 으로만 매칭했지만, 운영 중에 새 세션 종류(예: 금요 무료 슬로우 롱런)가
  // 늘어날 때마다 enum/마이그레이션이 필요했다. 태그 시스템으로 분리하면
  // 어드민이 코드 수정 없이 새 세션 카테고리를 만들고 기존 수강권을
  // 그대로 적용할 수 있다.
  //
  // 매칭 규칙:
  //   1) 수강권에 '*' 태그가 있으면 모든 세션 사용 가능 (옴니패스)
  //   2) 그 외에는 세션 태그집합 ∩ 수강권 태그집합 ≠ ∅ 이면 사용 가능
  //   3) 만약 세션이나 수강권에 태그가 하나도 없으면(legacy)
  //      기존 sessions.type / pass_products.applicable_sessions 로 fallback
  //      → PR-C4에서 fallback 경로 제거 예정
  await dbRun(`
    CREATE TABLE IF NOT EXISTS session_tags (
      id             TEXT PRIMARY KEY,
      label          TEXT NOT NULL,
      color          TEXT,
      icon           TEXT,
      display_order  INTEGER NOT NULL DEFAULT 0,
      is_active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS session_tag_map (
      session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      tag_id       TEXT NOT NULL REFERENCES session_tags(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, tag_id)
    )
  `);
  // pass_product_tag_map.tag_id 는 session_tags.id 또는 특수값 '*' 을 가진다.
  // '*' 은 마스터에 존재하지 않으므로 FK 를 걸지 않는다.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS pass_product_tag_map (
      product_id   TEXT NOT NULL REFERENCES pass_products(id) ON DELETE CASCADE,
      tag_id       TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (product_id, tag_id)
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_session_tag_map_tag       ON session_tag_map(tag_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_pass_product_tag_map_tag  ON pass_product_tag_map(tag_id)`);

  // ─── PR-C1: 시드 태그 3종 (idempotent) ───
  // 운영 데이터에 이미 'ebw'/'slowrun'/'marathon' id 의 row 가 있으면 INSERT 무시.
  await dbRun(`
    INSERT INTO session_tags (id, label, color, icon, display_order, is_active)
    VALUES
      ('ebw',      'EBW',          '#ef4444', 'lucide:zap',           10, TRUE),
      ('slowrun',  '슬로우 롱런',   '#3b82f6', 'lucide:trending-up',   20, TRUE),
      ('marathon', '마라톤',        '#10b981', 'lucide:flag',          30, TRUE)
    ON CONFLICT (id) DO NOTHING
  `);

  // ─── PR-C1: 기존 세션 데이터 → 태그 맵 백필 ───
  // sessions.type 값을 그대로 tag_id 로 사용해 session_tag_map 행이 없는
  // 세션에 한해서만 한 번 INSERT. 이미 매핑이 있는 세션은 건드리지 않음.
  await dbRun(`
    INSERT INTO session_tag_map (session_id, tag_id)
    SELECT s.id, s.type
      FROM sessions s
     WHERE NOT EXISTS (
       SELECT 1 FROM session_tag_map m WHERE m.session_id = s.id
     )
       AND s.type IN ('ebw','slowrun','marathon')
    ON CONFLICT DO NOTHING
  `);

  // ─── PR-C1: 기존 수강권 상품 → 태그 맵 백필 ───
  // applicable_sessions 가 'all' 이면 '*' 태그 1행, JSON 배열이면 펼쳐서 INSERT.
  // pass_product_tag_map 에 row 가 이미 하나라도 있는 상품은 건너뜀.
  // (운영에서 이미 PR-C1 마이그레이션이 한 번 끝난 환경 보호)
  const productsForBackfill = await dbAll<{ id: string; applicable_sessions: string }>(`
    SELECT p.id, p.applicable_sessions
      FROM pass_products p
     WHERE NOT EXISTS (
       SELECT 1 FROM pass_product_tag_map t WHERE t.product_id = p.id
     )
  `);
  for (const p of productsForBackfill) {
    const raw = (p.applicable_sessions ?? 'all').trim();
    let tagIds: string[];
    if (raw === 'all' || raw === '"all"') {
      tagIds = ['*'];
    } else {
      try {
        const parsed = JSON.parse(raw);
        tagIds = Array.isArray(parsed)
          ? parsed.filter((t: unknown): t is string => typeof t === 'string' && t.length > 0)
          : ['*'];
      } catch {
        tagIds = ['*'];
      }
    }
    for (const tagId of tagIds) {
      await dbRun(
        `INSERT INTO pass_product_tag_map (product_id, tag_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [p.id, tagId]
      );
    }
  }

  // ─── Google Sheets sync infrastructure (PR-1) ───
  // sheet_sync_queue : retry buffer. A row is inserted whenever a sync call
  //   fails (e.g. transient Sheets API outage, quota). The worker (PR-3)
  //   pops rows in FIFO order, replays them, and deletes on success.
  // sheet_sync_log   : append-only audit trail for ops + errors. Useful for
  //   "did X member update reach the sheet?" investigations.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sheet_sync_queue (
      id              BIGSERIAL PRIMARY KEY,
      tab             TEXT    NOT NULL,
      op              TEXT    NOT NULL CHECK (op IN ('upsert','append')),
      payload         JSONB   NOT NULL,
      attempts        INTEGER NOT NULL DEFAULT 0,
      error_message   TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_attempt_at TIMESTAMPTZ
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sheet_sync_log (
      id            BIGSERIAL PRIMARY KEY,
      tab           TEXT NOT NULL,
      op            TEXT NOT NULL,
      row_key       TEXT,
      status        TEXT NOT NULL CHECK (status IN ('ok','queued','retry-ok','retry-failed')),
      error_message TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_sheet_sync_queue_attempts ON sheet_sync_queue(attempts)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_sheet_sync_log_created    ON sheet_sync_log(created_at DESC)`);

  // Sheet → web member metadata import log. Stores the full preview snapshot
  // before applying so an accidental sheet edit can be inspected/replayed.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sheet_member_import_log (
      id            BIGSERIAL PRIMARY KEY,
      admin_id      TEXT NOT NULL,
      mode          TEXT NOT NULL DEFAULT 'manager_metadata',
      applied_count INTEGER NOT NULL DEFAULT 0,
      warning_count INTEGER NOT NULL DEFAULT 0,
      snapshot_json JSONB NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_sheet_member_import_log_created ON sheet_member_import_log(created_at DESC)`);

  // ─── Admin audit log (PR-5) ───
  // Append-only ledger of every admin-initiated state change. The cached
  // admin_name lets the log remain readable even after the admin record is
  // renamed or deleted. before_value/after_value are JSONB so different
  // entity shapes (member, session, pass, …) can share a single table.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id            BIGSERIAL PRIMARY KEY,
      admin_id      TEXT NOT NULL,
      admin_name    TEXT,
      action        TEXT NOT NULL,
      target_type   TEXT,
      target_id     TEXT,
      target_name   TEXT,
      summary       TEXT,
      before_value  JSONB,
      after_value   JSONB,
      ip_address    TEXT,
      user_agent    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_audit_admin   ON admin_audit_log(admin_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_audit_target  ON admin_audit_log(target_type, target_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC)`);

  // ─── PR-D1: 회원 정정 요청 (correction_requests) ───
  //
  // 회원이 직접 처리할 수 없는 케이스(이미 출석/노쇼 확정, 마감 시간 경과 등)
  // 를 위한 셀프-서비스 요청 큐. 관리자 인박스에서 1-클릭 승인/거절.
  //
  // reason_code 종류:
  //   - attended_marked_noshow  : 참석했는데 노쇼로 표시됨
  //   - noshow_marked_attended  : 참석 안 했는데 출석으로 표시됨
  //   - want_cancel             : 마감 후이지만 예약 취소 요청
  //   - swapped_with_other      : 다른 회원과 예약이 바뀜
  //   - other                   : 기타 (detail 필수)
  //
  // SLA 정책(앱 표시용):
  //   - 세션 시작 +48시간 이내에만 요청 가능 (UI 측 가드)
  //   - 그 외엔 관리자에게 직접 문의
  //
  // 상태 흐름: pending → approved | rejected | withdrawn(회원이 철회)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS correction_requests (
      id              TEXT PRIMARY KEY,
      reservation_id  TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      member_id       TEXT NOT NULL REFERENCES members(id),
      session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      reason_code     TEXT NOT NULL CHECK (reason_code IN (
                        'attended_marked_noshow',
                        'noshow_marked_attended',
                        'want_cancel',
                        'swapped_with_other',
                        'other'
                      )),
      detail          TEXT,
      status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','withdrawn')),
      resolution_note TEXT,
      requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at     TIMESTAMPTZ,
      resolved_by     TEXT REFERENCES members(id),
      /* 승인 시 어떤 상태로 전환했는지 기록 (rollback / 감사용) */
      applied_status  TEXT
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_correction_status  ON correction_requests(status)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_correction_member  ON correction_requests(member_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_correction_session ON correction_requests(session_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_correction_pending_created
                 ON correction_requests(status, requested_at DESC)`);

  // 동일 reservation 에 pending 요청은 1건만 허용 — 회원이 같은 건으로
  // 여러 번 요청해 인박스가 더러워지는 것 방지.
  await dbRun(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_correction_pending_per_reservation
      ON correction_requests(reservation_id)
      WHERE status = 'pending'
  `);

  // ─── PR-D2: 비로그인 비밀번호 재설정 요청 큐 ─────────────────────────────
  // 로그인할 수 없는 회원이 로그인 화면에서 이름+휴대폰으로 도움을 요청하면,
  // 관리자 인박스에서 확인 후 기존 임시 비밀번호 발급 플로우로 처리한다.
  // 공개 POST 응답은 계정 존재 여부를 노출하지 않으며, pending 은 회원당 1건만 유지.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id              TEXT PRIMARY KEY,
      member_id       TEXT NOT NULL REFERENCES members(id),
      request_name    TEXT NOT NULL,
      request_phone   TEXT NOT NULL,
      requester_note  TEXT,
      status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
      requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at     TIMESTAMPTZ,
      resolved_by     TEXT REFERENCES members(id),
      resolution_note TEXT
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_password_reset_status ON password_reset_requests(status)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_password_reset_member ON password_reset_requests(member_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_password_reset_pending_created
                 ON password_reset_requests(status, requested_at DESC)`);
  await dbRun(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_password_reset_pending_per_member
      ON password_reset_requests(member_id)
      WHERE status = 'pending'
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
  // PR-DISCOUNT: updated pricing per owner spec.
  //   슬로우 롱런 = 월 10,000원 (회당 ≈ 2,500원, 주 1회 × 4주)
  //   마라톤 = 회당 25,000원 × 8주 = 200,000원
  //   EBW = 월 100,000원 (회당 ≈ 6,250원, 주 4회 × 4주 = 월 16회)
  const products: Array<[string, string, string, string, number | null, number, number]> = [
    ['pp_001', 'EBW 멤버십',          'monthly', '["ebw"]',             null, 30, 100000],
    ['pp_002', '슬로우 롱런 멤버십',   'monthly', '["slowrun"]',         null, 30, 10000],
    ['pp_003', '마라톤 클래스 (8주)',  'count',   '["marathon"]',          8, 60, 200000],
    ['pp_004', 'EBW + 슬로우 롱런 패키지','monthly','["ebw","slowrun"]', null, 30, 105000],
    ['pp_005', '올인원 패키지',        'monthly', 'all',                 null, 30, 120000],
    ['pp_006', '마라톤 드롭인 (1회)',  'count',   '["marathon"]',          1, 30, 25000],
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
    // mp_001: EBW 멤버십 — 월 100,000원, monthly 상품이므로 total_count = null
    await dbRun(passInsert, ['mp_001', 'member_001', 'pp_001', null, null, todayStr, addDays(55), todayStr, 100000]);
    // mp_002: 마라톤 클래스 (8주) — 200,000원, total_count = 8
    await dbRun(passInsert, ['mp_002', 'member_002', 'pp_003', 8, 8, todayStr, addDays(60), todayStr, 200000]);
    // mp_003: 마라톤 드롭인 (1회) — 25,000원, total_count = 1
    await dbRun(passInsert, ['mp_003', 'member_003', 'pp_006', 1, 1, todayStr, addDays(29), todayStr, 25000]);
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

// ─── PR-DISCOUNT: 할인 시스템 인프라 ───
// 회원 등급 / 쿠폰 / 프로모션 / 적립금 테이블 + pending_payments 확장.
async function initDiscountSchema(): Promise<void> {
  // 1. 회원 등급 마스터
  await dbRun(`
    CREATE TABLE IF NOT EXISTS member_grades (
      id              TEXT PRIMARY KEY,
      label           TEXT NOT NULL,
      discount_rate   NUMERIC(4,3) NOT NULL DEFAULT 0,
      mileage_rate    NUMERIC(4,3) NOT NULL DEFAULT 0.10,
      min_purchase    INTEGER NOT NULL DEFAULT 0,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      display_order   INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 2. 회원 확장 (등급 + 적립금 + 누적구매액)
  await dbRun(`
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS grade_id        TEXT REFERENCES member_grades(id),
      ADD COLUMN IF NOT EXISTS mileage_balance INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_purchased INTEGER NOT NULL DEFAULT 0
  `);

  // 3. 쿠폰 마스터
  await dbRun(`
    CREATE TABLE IF NOT EXISTS coupons (
      id              TEXT PRIMARY KEY,
      code            TEXT NOT NULL UNIQUE,
      name            TEXT NOT NULL,
      discount_type   TEXT NOT NULL CHECK (discount_type IN ('fixed','percent')),
      discount_value  INTEGER NOT NULL,
      min_order       INTEGER NOT NULL DEFAULT 0,
      max_discount    INTEGER,
      total_quantity  INTEGER NOT NULL DEFAULT -1,
      used_count      INTEGER NOT NULL DEFAULT 0,
      per_member      INTEGER NOT NULL DEFAULT 1,
      starts_at       TIMESTAMPTZ,
      expires_at      TIMESTAMPTZ,
      target_products TEXT,
      target_grades   TEXT,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 4. 회원별 쿠폰 발급 내역
  await dbRun(`
    CREATE TABLE IF NOT EXISTS member_coupons (
      id              TEXT PRIMARY KEY,
      member_id       TEXT NOT NULL REFERENCES members(id),
      coupon_id       TEXT NOT NULL REFERENCES coupons(id),
      status          TEXT NOT NULL DEFAULT 'issued'
                        CHECK (status IN ('issued','used','expired','revoked')),
      used_at         TIMESTAMPTZ,
      used_order_id   TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (member_id, coupon_id, status)
    )
  `);

  // 5. 프로모션 마스터
  await dbRun(`
    CREATE TABLE IF NOT EXISTS promotions (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      discount_type   TEXT NOT NULL CHECK (discount_type IN ('fixed','percent')),
      discount_value  INTEGER NOT NULL,
      min_order       INTEGER NOT NULL DEFAULT 0,
      max_discount    INTEGER,
      target_products TEXT,
      target_grades   TEXT,
      starts_at       TIMESTAMPTZ NOT NULL,
      expires_at      TIMESTAMPTZ NOT NULL,
      stackable       BOOLEAN NOT NULL DEFAULT FALSE,
      priority        INTEGER NOT NULL DEFAULT 0,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 6. 적립금 이력
  await dbRun(`
    CREATE TABLE IF NOT EXISTS mileage_log (
      id              BIGSERIAL PRIMARY KEY,
      member_id       TEXT NOT NULL REFERENCES members(id),
      amount          INTEGER NOT NULL,
      reason          TEXT NOT NULL,
      reference_id    TEXT,
      balance_after   INTEGER NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_mileage_log_member ON mileage_log(member_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_mileage_log_created ON mileage_log(created_at DESC)`);

  // 7. pending_payments 확장 (할인 상세 추적)
  await dbRun(`
    ALTER TABLE pending_payments
      ADD COLUMN IF NOT EXISTS original_amount   INTEGER,
      ADD COLUMN IF NOT EXISTS membership_discount INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS coupon_id         TEXT,
      ADD COLUMN IF NOT EXISTS coupon_discount   INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS promotion_id      TEXT,
      ADD COLUMN IF NOT EXISTS promotion_discount INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mileage_used      INTEGER NOT NULL DEFAULT 0
  `);

  // 8. member_passes 확장 (할인 사유 구조화)
  await dbRun(`
    ALTER TABLE member_passes
      ADD COLUMN IF NOT EXISTS mileage_earned INTEGER NOT NULL DEFAULT 0
  `);

  // 9. 시드: 기본 등급 1종
  await dbRun(`
    INSERT INTO member_grades (id, label, discount_rate, mileage_rate, min_purchase, is_active, display_order)
    VALUES ('grade_default', '일반', 0, 0.10, 0, TRUE, 100)
    ON CONFLICT (id) DO NOTHING
  `);

  // 10. 쿠폰 인덱스
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_member_coupons_member ON member_coupons(member_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active, starts_at, expires_at)`);
}

// schema bootstrap 에 discount init 연결
let _discountInitPromise: Promise<void> | null = null;
export async function ensureDiscountSchema(): Promise<void> {
  if (!_discountInitPromise) _discountInitPromise = initDiscountSchema();
  await _discountInitPromise;
}
