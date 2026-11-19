---
title: Database
description: Choosing a database shape, generating the schema, migrating, and changing the schema
locale: en
order: 6
group: deploy
updated: 2026-11-18
---

Data is accessed through **Drizzle ORM** in three shapes: **local SQLite**, **Cloudflare D1**, and
**PostgreSQL**. The shape is decided by the `DATABASE_PROVIDER` environment variable, which also
decides what the runtime connects to and which schema the build generates.

## Pick a shape

| provider | Connects to | Migration directory | Use for |
|---|---|---|---|
| `sqlite` (default) | Local SQLite file | `src/core/db/migrations/sqlite` | Local development, self-hosting |
| `d1` | Cloudflare D1 | `src/core/db/migrations/sqlite` | Deploying on Cloudflare |
| `postgres` | PostgreSQL | `src/core/db/migrations/postgres` | Production (recommended) |

```bash
# .env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgres://user:pass@host:5432/dbname
```

An unknown `DATABASE_PROVIDER` throws instead of silently falling back to sqlite.

## The schema is a generated artifact

Drizzle's `sqlite-core` and `pg-core` define tables differently, so the two dialects cannot share
one source file. This repo therefore **hand-writes two** schemas:

| File | Dialect |
|---|---|
| `src/core/db/schema.sqlite.ts` | SQLite / D1 |
| `src/core/db/schema.postgres.ts` | PostgreSQL |

`src/core/db/schema.ts` is a **generated artifact** — a one-line re-export
(`export * from './schema.sqlite'`) produced by `pnpm db:setup`:

```bash
pnpm db:setup
```

It does two things: writes the schema entry, and generates the first baseline migration for that
dialect when none exists. Neither is **committed** (both are in `.gitignore`); run it again after
switching dialects.

The runtime checks the dialect: when `DATABASE_PROVIDER` and the generated schema disagree, it
throws and tells you to re-run `pnpm db:setup`. A mismatch makes SQL run silently in the wrong
dialect, and the error usually surfaces far away in the stack.

## Migrations

Migrations are not committed either — **the hand-written schema is the source of truth for the
database structure**, and migrations are locally generated artifacts:

```bash
pnpm run db:generate          # generate a migration from schema changes
pnpm run db:migrate:local     # apply to the local D1
pnpm run db:migrate:remote    # apply to the remote D1
pnpm run db:migrate:pg        # apply to PostgreSQL
```

> **One hard rule in the release checklist**: a production schema change must be generated locally
> and applied by hand. Migrations are not committed, so production never follows the code on its
> own — forget to apply and the live database silently falls behind.

## Seed data

```bash
pnpm db:seed -- --brand "Acme" --email <your-support-email>
pnpm db:seed:remote
pnpm db:seed:pg
```

The seed writes the per-field defaults from the settings registry (plus the credentials you put
in `.env`). It only fills in what is missing (`DO NOTHING`) and never overwrites what you
changed in the admin panel; `--force` overwrites.
RBAC permission points and taxonomies join the seed in later milestones.

## Usage

The Drizzle instance is built per provider:

```ts
// src/core/db/index.ts
export function createDbFromEnv(env: DbEnv): DB
```

- **sqlite / d1**: goes through the D1 binding (locally emulated by wrangler's SQLite), reused
  per binding.
- **postgres**: connections are built **per request scope**. A Workers isolate can be frozen
  between requests, and a TCP connection reused across requests goes stale — so the client must
  not be cached across them.

**D1 has no interactive transactions**: drizzle's `db.transaction()` issues `BEGIN` / `COMMIT`,
which D1 rejects. `atomic()` therefore opens a real transaction only on PostgreSQL and relies on a
single conditional update on D1 (`UPDATE ... WHERE balance >= amount`). This constraint shapes how
the ledger module has to be written.

## Verify

```bash
pnpm exec wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

You should see `users`, `sessions`, `accounts`, `verifications`, `subscriptions`, `payments`,
`checkout_reservations`, `files`, `apikey`, `newsletter_subscriptions`, `webhook_events`,
`settings`.

## Common commands

| Command | What it does |
|---|---|
| `pnpm run db:setup` | Generate the schema entry and the first baseline migration |
| `pnpm run db:generate` | Generate a migration file from schema changes |
| `pnpm run db:migrate:local` | Apply migrations to the local database |
| `pnpm run db:migrate:remote` | Apply migrations to the remote database |
| `pnpm run db:migrate:pg` | Apply migrations to PostgreSQL |
| `pnpm run db:seed` | Write the seed configuration |
| `pnpm run db:studio:local` | Local Drizzle Studio |
| `pnpm run db:studio:remote` | Remote Drizzle Studio |
| `pnpm exec wrangler d1 execute DB --remote --command "..."` | Run arbitrary SQL remotely |

## Notes

- **Existing databases need the new baseline.** After pulling a version that adds or changes the
  schema, run `pnpm db:setup` (and `pnpm db:migrate:local` where needed) on existing local or
  deployed databases; otherwise the first write fails at runtime instead of at startup.
- **Both schemas have to change together.** A new table means editing `schema.sqlite.ts` *and*
  `schema.postgres.ts`; `tests/unit/schema-parity.test.ts` compares every table and column, but
  indexes and constraints rely on code review.
- **Read the generated SQL before you commit it.** `db:generate` reads a renamed column as "drop the old column, add a new one" and loses data; adding a column is safer than renaming one.
- Remote Studio reads `process.env` directly, so the environment needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN`.
- Automatic deployment applies the remote migrations before deploying — review the migration yourself before releasing.
- `pnpm dev` uses the local SQLite file under `.wrangler/state`, completely separate from the remote database.
