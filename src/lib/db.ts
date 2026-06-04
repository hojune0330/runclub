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

  // ─── 시드 태그 (idempotent) ───
  // 운영 데이터에 이미 같은 id 의 row 가 있으면 INSERT 무시.
  //
  // 가격 전략(미끼 → 전문화 funnel):
  //   • runclub  = "아이오 런클럽 멤버십"(10,000원) — 미끼(loss-leader).
  //                회원이 일단 멤버십을 보유하면 member_passes 에 active pass 가
  //                생기고, getMembershipDiscountRate() 가 이후 모든 상품에 10%
  //                할인을 자동 적용한다. (= 런클럽이 할인 트리거)
  //   • special  = 공무원 체력시험·전문 특화 클래스
  //   • pt       = 1:1 러닝 PT(강병규 코치) / 유소년 교육
  //   • product  = 맞춤형 깔창 등 굿즈/제작 상품
  await dbRun(`
    INSERT INTO session_tags (id, label, color, icon, display_order, is_active)
    VALUES
      ('runclub',  '런클럽 멤버십', '#f59e0b', 'lucide:badge-check',   5,  TRUE),
      ('ebw',      'EBW',          '#ef4444', 'lucide:zap',           10, TRUE),
      ('slowrun',  '슬로우 롱런',   '#3b82f6', 'lucide:trending-up',   20, TRUE),
      ('marathon', '마라톤',        '#10b981', 'lucide:flag',          30, TRUE),
      ('special',  '특화 클래스',   '#8b5cf6', 'lucide:target',        40, TRUE),
      ('pt',       '1:1 PT',       '#ec4899', 'lucide:user-check',    50, TRUE),
      ('product',  '제작/굿즈',     '#6b7280', 'lucide:package',       60, TRUE)
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
  if (!_initPromise) {
    // 스키마 생성 → 그 직후 상품 카탈로그를 idempotent 하게 동기화한다.
    // seedDatabase() 는 "회원이 이미 있으면 통째로 스킵"하므로, 운영 DB 의
    // 상품 가격/이름/설명은 여기(ensureSchema) 에서만 최신 카탈로그로 반영된다.
    _initPromise = initSchema().then(() => syncPassProductCatalog());
  }
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

// ─── 상품 카탈로그 (단일 진실 공급원) ───
//
// 네이버 스마트스토어 실제 라인업을 반영한 "미끼 → 전문화 클래스" funnel.
//
//   ① 미끼(loss-leader): pp_001 아이오 런클럽 멤버십 (10,000원, is_featured)
//        - 누구나 부담 없이 결제 → member_passes 에 active pass 생성
//        - 이 순간부터 getMembershipDiscountRate() 가 10% 자동 할인 적용
//        - 즉 "런클럽 회원" 자체가 모든 전문 클래스의 상시 10% 할인 자격
//   ② 전문 클래스(고액 마진): 런클럽 회원에게 10% 할인된 가격으로 노출되어
//        "이미 멤버니까 할인받고 듣자"는 심리로 자연스럽게 업셀.
//
// 컬럼 순서:
//   [id, name, category, applicable_sessions, total_count, duration_days,
//    price, original_price, display_order, is_featured, description, description_long]
//
// price          = 실제 판매가(런클럽 회원이 결제 시 추가 10% 자동 차감)
// original_price = 비회원 정가(취소선 표기용). 런클럽 가입을 유도하는 앵커.
type ProdSeed = [
  string, string, string, string, number | null, number,
  number, number | null, number, boolean, string, string,
];
const PASS_PRODUCT_CATALOG: ProdSeed[] = [
  // ── 미끼 상품 (최상단·추천) ──
  ['pp_001', '아이오 런클럽 멤버십', 'monthly', '["runclub","ebw","slowrun","marathon"]', null, 30,
    10000, null, 0, true,
    '월 10,000원으로 시작하는 러닝 라이프. 전문 코치·매니저가 함께하는 안전한 야외 러닝 클럽.',
    '아이오 런클럽 멤버십은 단돈 10,000원으로 누리는 "헬스장 같은" 야외 러닝 공간입니다. 전문 코치와 매니저의 보조 아래 안전하게 달리고, 짐 보관·급수까지 해결됩니다. ★ 멤버가 되는 순간, 아이오의 모든 전문 클래스(EBW·마라톤·특화·1:1 PT 등)를 상시 10% 할인된 가격으로 수강할 수 있습니다. 가장 먼저, 가장 가볍게 시작하세요.'],

  // ── 전문화 클래스 (원데이 → 정기 → 특화 → 고액 PT 순으로 업셀) ──
  ['pp_002', '러너를 위한 실내훈련 원데이 체험 [E.B.W]', 'count', '["ebw"]', 1, 30,
    35000, null, 10, false,
    '잘 달리기 위한 체력 프로그램 EBW를 하루 체험. 러닝 퍼포먼스 향상을 위한 기능성 트레이닝 입문.',
    '초보 러너부터 숙련 러너까지, 실내에서 다양한 기능성 운동으로 러닝 퍼포먼스를 끌어올리는 EBW 원데이 체험 클래스입니다. 부상 예방·체력 증진·고칼로리 소모 효과까지. "잘 달리기 위해 잘 움직이는 법"부터 시작하세요. ※ 런클럽 멤버는 10% 할인.'],

  ['pp_003', 'EBW 정기반 (월) — 러닝 기반 실내체력 운동', 'monthly', '["ebw"]', null, 30,
    100000, null, 20, false,
    '매주 월·목 진행하는 EBW 월 정기반. 기능적이고 전문적인 러닝 트레이닝으로 몸을 더 튼튼하게.',
    '러닝뿐 아니라 기능적·전문적인 러닝 트레이닝으로 몸을 튼튼하게, 움직임을 유연하게 만드는 월 정기 프로그램입니다. 실내 기능성 운동, 러닝 퍼포먼스 집중 트레이닝, 부상 예방, 고강도 칼로리 소모. 초보~숙련 러너 모두 참여 가능. ※ 런클럽 멤버는 10% 할인.'],

  ['pp_004', 'io러닝 러닝 클래스 (6주 과정)', 'count', '["marathon"]', 6, 60,
    150000, null, 30, false,
    '6주 마라톤 클래스. 각자의 컨디션·수준에 맞춰 체계적으로 훈련하는 러닝 전문 교육.',
    '아이오 러닝의 6주 마라톤 클래스입니다. 꾸준히 준비해온 러너부터 흐름을 놓쳤던 러너까지, 지금 상태에서 다시 제대로 시작할 수 있도록 설계되었습니다. 기록을 한 단계 끌어올리거나, 무리 없이 페이스를 회복하도록 수준별로 체계적 훈련을 진행합니다. ※ 런클럽 멤버는 10% 할인.'],

  ['pp_005', '[상시반] 공무원 체력시험 준비반', 'monthly', '["special"]', null, 30,
    250000, 250000, 40, false,
    '전직 육상선수 코치진의 종목별 맞춤 훈련. 단기간 기록 향상을 위한 특화 프로그램.',
    '공무원 체력시험은 전략적으로 준비하면 충분히 합격할 수 있습니다. 전직 육상선수 출신 코치진이 왕복달리기·윗몸일으키기·팔굽혀펴기 등 종목별 맞춤 훈련을 직접 지도하고, 개인별 피드백과 체력 향상 플랜을 제공합니다. 단순 훈련이 아닌 "기록 단축을 위한 최적의 방법". ※ 런클럽 멤버는 결제 시 10% 추가 할인.'],

  ['pp_006', '러너를 위한 맞춤형 깔창 제작', 'count', '["product"]', 1, 30,
    130000, null, 50, false,
    '러닝에 적합한 발은 단 25%. 발의 고유한 윤곽에 맞춘 맞춤형 깔창으로 부상을 예방하세요.',
    '지문처럼 모든 발은 고유한 모양과 윤곽을 가집니다. 러닝에 적합한 발을 가진 사람은 단 25%뿐, 75%의 러너가 불균형을 안고 달립니다. 발의 불균형은 불필요한 통증과 부상을 유발합니다. 개인의 발에 맞춘 맞춤형 깔창으로 균형을 회복하세요. ※ 런클럽 멤버는 10% 할인.'],

  ['pp_007', '[강병규 코치] 유소년 러닝 교육 (1:1 / 그룹)', 'count', '["pt"]', 1, 60,
    130000, null, 60, false,
    '선수 출신 코치의 유소년 전문 러닝 교육. 1:1 또는 2~3:1 소그룹으로 진행.',
    '"무한한 기회, 끝없는 시작"을 모토로 한 러닝 전문 교육팀 아이오. 십수 년의 선수 생활과 수많은 유소년·직장인 러너 지도 노하우로 아이의 올바른 러닝 자세와 체력을 길러줍니다. 1:1 또는 2~3:1 소그룹 진행. ※ 런클럽 멤버는 10% 할인.'],

  // ── 고액 1:1 PT (최종 전환·최고 마진) ──
  ['pp_008', '[강병규 코치] 원데이 체험 (1:1 러닝 PT)', 'count', '["pt"]', 1, 30,
    80000, null, 70, false,
    '선수 출신 코치와의 1:1 러닝 PT 원데이 체험. 정식 PT 등록 전 맛보기.',
    '강병규 코치와 1:1로 진행하는 러닝 PT 원데이 체험입니다. 스케줄 조율 후 예약하세요. 선수 생활과 유소년·직장인 지도 노하우로 여러분의 목표 달성을 돕습니다. ※ 런클럽 멤버는 10% 할인.'],

  ['pp_009', '[강병규 코치] 러닝 PT 4회 (1:1)', 'count', '["pt"]', 4, 90,
    480000, null, 80, false,
    '선수 출신 코치와의 1:1 러닝 PT 4회권. 체계적 관리와 꾸준한 동기부여.',
    '강병규 코치와 1:1로 진행하는 러닝 PT 4회권입니다. 스케줄을 코치와 조율해 예약합니다. 자세 교정부터 기록 향상까지 개인 맞춤 PT로 목표에 도달하세요. ※ 런클럽 멤버는 10% 할인.'],

  ['pp_010', '[강병규 코치] 러닝 PT 8회 (1:1)', 'count', '["pt"]', 8, 120,
    800000, null, 90, false,
    '선수 출신 코치와의 1:1 러닝 PT 8회권. 가장 깊이 있는 1:1 전문 관리.',
    '강병규 코치와 1:1로 진행하는 러닝 PT 8회 풀패키지입니다. 가장 체계적이고 밀도 높은 개인 맞춤 관리로 자세·체력·기록을 종합적으로 끌어올립니다. ※ 런클럽 멤버는 10% 할인.'],
];

const PASS_PRODUCT_REFUND_POLICY =
  '수업 시작 7일 전까지 전액 환불, 3일 전까지 50% 환불, 이후 환불 불가. 횟수권은 미사용분에 한해 환불 가능합니다.';

// 카탈로그에 더 이상 존재하지 않는 (옛) 시드 상품 id 목록.
// 운영 DB 에 이미 들어가 있던 구버전 상품을 정리하기 위함. 회원이 실제로
// 구매(member_passes 참조)한 상품은 FK 보호를 위해 삭제하지 않고 비활성화만 한다.
const LEGACY_PASS_PRODUCT_IDS = ['pp_011', 'pp_012', 'pp_013', 'pp_014', 'pp_015'];

// ─── 상품 카탈로그 동기화 (idempotent upsert) ───
//
// seedDatabase() 는 "회원이 이미 있으면 통째로 스킵"하므로, 운영 DB 의 상품을
// 절대 갱신하지 못한다. 따라서 카탈로그 동기화는 시드와 분리해 ensureSchema()
// 끝에서 항상 실행한다. INSERT ... ON CONFLICT DO UPDATE 로 가격/이름/설명 등을
// 최신 카탈로그로 맞추고, 태그 매핑도 applicable_sessions 기준으로 재동기화한다.
//
// ⚠️ 안전 정책 (운영 데이터 보호):
//   관리자가 운영 중에 pass_products 를 직접 추가/수정했을 수 있다. 따라서
//   이 함수는 절대 무조건 덮어쓰지 않는다. 다음 두 경우에만 동기화한다.
//     (A) pass_products 가 완전히 비어 있음 (= 신규 설치/빈 DB) → 안전하게 시드
//     (B) 환경변수 SYNC_CATALOG_FORCE=1 → 관리자가 의도적으로 카탈로그 리셋 요청
//   그 외(이미 상품이 존재)에는 아무것도 하지 않아 운영 데이터를 보존한다.
// 1회성 강제 리셋 마커. 이 값이 app_meta 에 기록되어 있지 않으면, 다음 부팅 때
// 단 한 번 네이버 카탈로그로 강제 리셋(+orphan 정리)하고 마커를 남긴다. 이후
// 부팅에서는 마커가 있으므로 건너뛰어 관리자 수동 편집을 보존한다("나중에 정리").
// 새 강제 리셋이 필요하면 이 상수를 v2, v3... 으로 올리면 된다.
const CATALOG_RESET_MARKER = 'catalog_reset_naver_v1';

let _catalogSynced: Promise<void> | null = null;
export function syncPassProductCatalog(): Promise<void> {
  if (!_catalogSynced) _catalogSynced = (async () => {
    // 메타 플래그 저장용 키-값 테이블 (없으면 생성).
    await dbRun(
      `CREATE TABLE IF NOT EXISTS app_meta (
         key   TEXT PRIMARY KEY,
         value TEXT NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`, []
    );

    const envForce = process.env.SYNC_CATALOG_FORCE === '1';
    const markerRow = await dbGet<{ value: string }>(
      `SELECT value FROM app_meta WHERE key = $1`, [CATALOG_RESET_MARKER]
    );
    const markerApplied = !!markerRow;
    // 마커가 아직 없으면(=이 리셋을 한 번도 안 했으면) 1회 강제 리셋한다.
    const force = envForce || !markerApplied;

    const existing = await dbGet<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM pass_products`, []
    );
    const productCount = Number(existing?.cnt ?? 0);

    // 이미 상품이 있고 강제 플래그도 없으면 → 운영 데이터 보존, no-op.
    if (productCount > 0 && !force) {
      return;
    }

    for (const p of PASS_PRODUCT_CATALOG) {
      const [id, name, category, applicable, totalCount, durationDays,
        price, originalPrice, displayOrder, isFeatured, description, descriptionLong] = p;
      await dbRun(
        `INSERT INTO pass_products (
           id, name, category, applicable_sessions, total_count, duration_days,
           price, original_price, display_order, is_featured,
           description, description_long, refund_policy, is_active
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, TRUE)
         ON CONFLICT (id) DO UPDATE SET
           name                = EXCLUDED.name,
           category            = EXCLUDED.category,
           applicable_sessions = EXCLUDED.applicable_sessions,
           total_count         = EXCLUDED.total_count,
           duration_days       = EXCLUDED.duration_days,
           price               = EXCLUDED.price,
           original_price      = EXCLUDED.original_price,
           display_order       = EXCLUDED.display_order,
           is_featured         = EXCLUDED.is_featured,
           description         = EXCLUDED.description,
           description_long    = EXCLUDED.description_long,
           refund_policy       = EXCLUDED.refund_policy,
           is_active           = TRUE,
           updated_at          = NOW()`,
        [id, name, category, applicable, totalCount, durationDays,
          price, originalPrice, displayOrder, isFeatured,
          description, descriptionLong, PASS_PRODUCT_REFUND_POLICY]
      );

      // 태그 매핑 재동기화: applicable_sessions(JSON 배열 또는 'all') → pass_product_tag_map.
      let tagIds: string[];
      const raw = (applicable ?? 'all').trim();
      if (raw === 'all' || raw === '"all"') {
        tagIds = ['*'];
      } else {
        try {
          const parsed = JSON.parse(raw);
          tagIds = Array.isArray(parsed)
            ? parsed.filter((t: unknown): t is string => typeof t === 'string' && t.length > 0)
            : ['*'];
        } catch { tagIds = ['*']; }
      }
      // 기존 매핑을 지우고 카탈로그 기준으로 다시 채운다(정확한 동기화).
      await dbRun(`DELETE FROM pass_product_tag_map WHERE product_id = $1`, [id]);
      for (const tagId of tagIds) {
        await dbRun(
          `INSERT INTO pass_product_tag_map (product_id, tag_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, tagId]
        );
      }
    }

    // ─── 카탈로그에 없는 상품 정리 ───
    // 정리 대상:
    //   • force 모드: 카탈로그(PASS_PRODUCT_CATALOG)에 없는 *모든* 상품
    //     (관리자가 운영 중 만든 orphan pp_mxxx, 옛 데이터 pp_001~006 변형 등 포함).
    //     → 네이버 카탈로그로 1회성 전체 리셋. "나중에 정리"는 force 끈 평소 운영에서.
    //   • 비-force 모드(빈 DB 초기 시드): 알려진 LEGACY id 만 보수적으로 정리.
    // 회원이 실제 구매(member_passes 참조)한 상품은 FK 보호를 위해 삭제 대신 비활성화.
    const catalogIds = new Set(PASS_PRODUCT_CATALOG.map((p) => p[0] as string));
    let cleanupTargets: string[];
    if (force) {
      const all = await dbAll<{ id: string }>(`SELECT id FROM pass_products`, []);
      cleanupTargets = all.map((r) => r.id).filter((id) => !catalogIds.has(id));
    } else {
      cleanupTargets = LEGACY_PASS_PRODUCT_IDS.filter((id) => !catalogIds.has(id));
    }
    for (const staleId of cleanupTargets) {
      const used = await dbGet<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM member_passes WHERE product_id = $1`,
        [staleId]
      );
      if (Number(used?.cnt ?? 0) > 0) {
        await dbRun(`UPDATE pass_products SET is_active = FALSE WHERE id = $1`, [staleId]);
      } else {
        await dbRun(`DELETE FROM pass_product_tag_map WHERE product_id = $1`, [staleId]);
        await dbRun(`DELETE FROM pass_products WHERE id = $1`, [staleId]);
      }
    }

    // 1회성 리셋 마커 기록 → 이후 부팅에서는 force 가 꺼져 운영 편집을 보존.
    // (envForce 로 들어온 경우에도 마커를 남겨 둔다.)
    await dbRun(
      `INSERT INTO app_meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [CATALOG_RESET_MARKER, new Date().toISOString()]
    );
  })();
  return _catalogSynced;
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
  // 카탈로그는 모듈 상수(PASS_PRODUCT_CATALOG) + syncPassProductCatalog() 로
  // 단일화되어 있다. 신규 시드든 기존 운영 DB든 동일한 upsert 경로를 타도록
  // 여기서도 같은 함수를 호출한다. (idempotent)
  await syncPassProductCatalog();
  const products = PASS_PRODUCT_CATALOG;

  // ─── 4. Sample issued passes (demo mode only) ───
  let activePassCount = 0;
  if (resolvedMode === 'demo') {
    const todayStr = new Date().toISOString().split('T')[0];
    const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

    const passInsert = `
      INSERT INTO member_passes (id, member_id, product_id, total_count, remaining_count, start_date, expiry_date, issued_date, price, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
    `;
    // mp_001: 아이오 런클럽 멤버십(미끼) — 월 10,000원, monthly 상품이라 total_count = null.
    //         이 active pass 보유만으로 member_001 은 모든 전문 클래스 10% 할인 자격.
    await dbRun(passInsert, ['mp_001', 'member_001', 'pp_001', null, null, todayStr, addDays(30), todayStr, 10000]);
    // mp_002: io러닝 6주 클래스 — 런클럽 회원이 10% 할인받아 결제한 사례(150,000 → 135,000).
    await dbRun(passInsert, ['mp_002', 'member_002', 'pp_004', 6, 6, todayStr, addDays(60), todayStr, 135000]);
    // mp_003: EBW 원데이 체험 — 35,000원, total_count = 1.
    await dbRun(passInsert, ['mp_003', 'member_003', 'pp_002', 1, 1, todayStr, addDays(29), todayStr, 35000]);
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
// 기본적으로 오늘부터 90일 뒤까지 정기 스케줄을 채움.
// 이미 같은 날짜·시작시간·유형의 세션이 있으면 건너뜀(중복 방지).
// 반환값은 새로 INSERT한 세션 수.
export async function generateRecurringSessions(opts?: {
  from?: Date;
  to?: Date;
}): Promise<number> {
  await ensureSchema();
  const from = opts?.from ?? new Date();
  const to = opts?.to ?? new Date(Date.now() + 90 * 86_400_000);

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
  const slowGroupId = await getOrCreateGroupId('slow_wedfri');
  const marGroupId = await getOrCreateGroupId('class_tuesat');

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

  // 실제 운영 스케줄 (여의도공원 문화의마당, 저녁 7:30):
  //   런클럽(slowrun)   → 매주 수(3) · 금(5)
  //   러닝 클래스(marathon) → 매주 화(2) · 토(6)
  const FORUM_LOCATION = '여의도공원 문화의마당';
  const FORUM_ADDRESS = '서울 영등포구 여의공원로 68 (여의도공원 문화의마당 · 비행기 모형 앞 집결)';

  while (cursor <= endDay) {
    const iso = toIso(cursor);
    const dow = cursor.getDay(); // 0=일, 1=월, 2=화, 3=수, 5=금, 6=토

    if (dow === 3 || dow === 5) {
      // 수 · 금: 슬로우롱런클럽 (런클럽) 19:30
      const dayKr = dow === 3 ? '수' : '금';
      await tryInsert({
        id: `slow_${iso}_1930`,
        name: '슬로우롱런클럽',
        type: 'slowrun',
        date: iso,
        start: '19:30',
        end: '21:00',
        location: FORUM_LOCATION,
        address: FORUM_ADDRESS,
        capacity: 50,
        indoor: false,
        cancelMin: 60,
        groupId: slowGroupId,
        memo: `매주 ${dayKr} 저녁 7:30 워밍업 시작, 7:40 출발. 편안한 페이스로 함께 달려요.`,
      });
    } else if (dow === 2 || dow === 6) {
      // 화 · 토: 러닝 클래스 19:30
      const dayKr = dow === 2 ? '화' : '토';
      await tryInsert({
        id: `class_${iso}_1930`,
        name: '러닝 클래스',
        type: 'marathon',
        date: iso,
        start: '19:30',
        end: '21:00',
        location: FORUM_LOCATION,
        address: FORUM_ADDRESS,
        capacity: 50,
        indoor: false,
        cancelMin: 60,
        groupId: marGroupId,
        memo: `매주 ${dayKr} 진행하는 러닝 클래스. 주법·페이스 향상에 초점을 맞춰요.`,
      });
    }
    // EBW(ebw)는 현재 정기 자동 생성에서 제외 — 운영 확정 시 위 패턴에 추가.
    void ebwGroupId;

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
