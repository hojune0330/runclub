# Deployment Guide — RunClub Manager

Production hosting target: **Render.com** (Single Web Service + Render PostgreSQL).

| Component        | Plan          | Cost    | Notes                                |
|------------------|---------------|---------|--------------------------------------|
| Web service      | Starter       | $7 / mo | Always-on Node, no cold sleep        |
| PostgreSQL       | Basic 256MB   | $7 / mo | Daily backups (Render-managed)       |
| **Total**        |               | **$14/mo** |                                   |

## 1. Prerequisites

- GitHub repo pushed to `main`.
- Render account.
- (Optional) Custom domain (`runclub.kr`).

## 2. First-time deploy with the Blueprint

The repo ships a [`render.yaml`](./render.yaml) Blueprint.

1. Render Dashboard → **New +** → **Blueprint**.
2. Connect the GitHub repo `hojune0330/runclub`.
3. Render creates:
   - `runclub-db`  (PostgreSQL 16, Singapore)
   - `runclub-manager` (Node web service)
4. `DATABASE_URL` is wired to the DB automatically.
5. `JWT_SECRET` is auto-generated (Render uses a 64-char random value).
6. Wait for the first build to finish (~3–5 min).

## 3. Seed the database (one-time)

The seed endpoint is **disabled by default** in production. The Blueprint
also defaults to `SEED_MODE=production`, which means seeding will create
ONLY the admin you specify in env vars — no demo members, no demo passes.

1. In the web service → **Environment** → set:
   - `ALLOW_SEED=true`
   - `SEED_TOKEN=<paste a random 32+ char value>`
   - `SEED_ADMIN_PHONE=010-1234-5678`         (your phone)
   - `SEED_ADMIN_PASSWORD=<≥ 8 chars, must contain letters AND digits>`
   - `SEED_ADMIN_NAME=장호준 코치`              (your name)
   - `SEED_ADMIN_EMAIL=…`                      (optional)

   **Pre-check (recommended)** — before saving, dry-run the validator
   locally with the same values to catch typos / weak passwords:
   ```bash
   SEED_MODE=production \
   ALLOW_SEED=true \
   SEED_TOKEN='…' \
   SEED_ADMIN_PHONE='010-…' \
   SEED_ADMIN_PASSWORD='…' \
   SEED_ADMIN_NAME='…' \
   JWT_SECRET='<your prod secret>' \
   DATABASE_URL='<your prod url>' \
   npm run verify:prod-seed
   ```
   It exits 0 only when every required variable looks production-safe.

2. Save → Render redeploys (~30 s).
3. Run:
   ```bash
   curl -X POST "https://<your-app>.onrender.com/api/seed?token=<SEED_TOKEN>"
   ```
   Expected response:
   ```json
   { "message": "Database seeded successfully", "mode": "production",
     "counts": { "admin": 1, "members": 0, "passProducts": 6,
                 "activePasses": 0, "sessions": 25 } }
   ```
4. **Immediately tighten back down**:
   - Set `ALLOW_SEED=false`
   - Delete `SEED_TOKEN`, `SEED_ADMIN_PASSWORD` (the values are no longer needed)
   - Save → Render redeploys.

The seed function is idempotent — calling it twice is a no-op once members exist.

**Demo mode**: if you want to seed a sandbox/staging environment with the
4 demo members + sample passes, set `SEED_MODE=demo` instead. The seeded
admin will be `010-0000-0000 / admin` with the must-change-password flag
set, so first login will force a password change.

## 4. Verify

- Open `https://<your-app>.onrender.com/`  → landing page renders.
- `https://<your-app>.onrender.com/api/health` → `{ "ok": true, … }`.
- `https://<your-app>.onrender.com/api/public/stats` → returns JSON counts
  (`activeMembers: 1` immediately after first seed in production mode).
- Login with the admin you set up: phone = `SEED_ADMIN_PHONE`,
  password = `SEED_ADMIN_PASSWORD`.
  *(In production mode `must_change_password` is FALSE for the seeded admin
  — you log straight in. Change the password from the profile menu anyway.)*

## 5. Promote / demote admins

Render's web shell isn't always available; instead, run the CLI from any
machine with `DATABASE_URL` set to the production DB (you can copy the value
from Render → DB → "Connections"):

```bash
DATABASE_URL='postgres://...render.com/...' npm run admin:list
DATABASE_URL='postgres://...render.com/...' npm run admin:promote -- 010-1234-5678
DATABASE_URL='postgres://...render.com/...' npm run admin:promote -- 010-1234-5678 --demote
```

The CLI accepts both `010-1234-5678` and `01012345678` formats.

## 6. Custom domain (optional)

1. Render → web service → **Settings** → **Custom Domains**.
2. Add `runclub.kr` and `www.runclub.kr`.
3. Add the suggested CNAME records at your DNS provider.
4. HTTPS certificates are issued automatically (Let's Encrypt).

## 7. Environment variables (reference)

Required in **production**:

| Var            | Value                                       | Notes                              |
|----------------|---------------------------------------------|------------------------------------|
| `NODE_ENV`     | `production`                                | set by Blueprint                   |
| `DATABASE_URL` | postgres://… (auto)                         | wired from Render PostgreSQL       |
| `JWT_SECRET`   | random ≥ 32 chars                           | Render auto-generates              |

Optional / per-action:

| Var           | Default | Purpose                                      |
|---------------|---------|----------------------------------------------|
| `SEED_TOKEN`  | unset   | Required to call `/api/seed` in production   |
| `ALLOW_SEED`  | `false` | Must be `true` to enable `/api/seed`         |

See [`.env.example`](./.env.example) for local-dev defaults.

## 8. Backups

Render PostgreSQL on the Basic plan includes **daily automatic backups, 7-day
retention**. To create on-demand backups:

```bash
# Replace with values from Render → DB → Connections
PGPASSWORD='...' pg_dump \
  -h <host> -U <user> -d <db> \
  --no-owner --no-acl --clean \
  > runclub-$(date +%F).sql
```

For more frequent off-site backups, schedule the same command in a daily
GitHub Actions cron, uploading the dump to S3/R2 or AI Drive.

## 9. Rollback

Render keeps the last successful build per branch. Dashboard → web service →
**Deploys** → pick a previous deploy → **Rollback**.

For schema rollbacks, run `pg_restore` against an earlier dump.

## 10. Monitoring (recommended next)

- **Sentry** (free tier): add `@sentry/nextjs`, set `SENTRY_DSN` env var.
- **Render's built-in metrics** for CPU/RAM/HTTP latency.
- **Uptime check**: Render → Settings → Health Check Path is already set to
  `/api/public/stats` (returns 200 only when DB is reachable).
