---
title: Database
description: Creating, migrating, and wiring Cloudflare D1 with Drizzle
locale: en
order: 6
group: deploy
updated: 2026-10-21
---

Data lives in **Cloudflare D1** (SQLite), accessed through **Drizzle ORM**. The schema is
in `src/db/schema.ts`; migrations are in `src/db/migrations/`.

## Prerequisites

The token needs **Account → D1 → Edit**, see [Cloudflare](./cloudflare).

## Setup

### 1. Create the database

```bash
pnpm exec wrangler d1 create saas-template-db
```

Copy the `database_id` into `wrangler.jsonc`:

```jsonc title="wrangler.jsonc"
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "saas-template-db",
      "database_id": "f0aed9d8-0cca-4cb7-9ec6-be6b67ce7e69",
      "migrations_dir": "./src/db/migrations"
    }
  ]
}
```

> `wrangler d1 create` offers to write the config for you. **Decline and edit by hand** —
> it serializes through JSON and strips every comment from `wrangler.jsonc`.

`binding` is the name code reads (`env.DB`) and must match `src/types/cloudflare.d.ts`.
`database_name` is only a label.

### 2. Apply migrations

Local and remote are separate:

```bash
pnpm run db:migrate:local    # local dev database
pnpm run db:migrate:remote   # production database
```

Remote migrations ask for confirmation; non-interactive environments skip it.

> **Check for data before running a migration with `DROP TABLE`.** `0002` replaces the old
> `api_keys` table with `apikey` and drops the former. Verify it is empty first:
>
> ```bash
> pnpm exec wrangler d1 execute DB --remote --command "SELECT COUNT(*) FROM api_keys;"
> ```
>
> If it is non-zero, back up first
> (`wrangler d1 export DB --remote --output backup.sql`) before deciding.

Verify the schema:

```bash
pnpm exec wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

You should see ten tables: `users`, `sessions`, `accounts`, `verifications`, `apikey`,
`files`, `payments`, `subscriptions`, `newsletter_subscriptions`, `webhook_events`.

### 3. Change the schema

Edit `src/db/schema.ts`, then generate a migration:

```bash
pnpm run db:generate
```

> **Review the generated SQL before committing.** `generate` reads a renamed column as
> "drop old + add new", which loses data. Adding a column is safer than renaming one.

## Usage

The Drizzle instance is created per request, never as a global singleton:

```ts
// src/db/index.ts
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}
```

`src/auth/auth.ts` calls `createDb(env.DB)` on each request so concurrent Workers requests
never share state.

`pnpm dev` uses a local SQLite file under `.wrangler/state`, fully isolated from remote.

## Commands

| Command | Purpose |
|---|---|
| `pnpm run db:generate` | Generate a migration from schema changes |
| `pnpm run db:migrate:local` | Apply migrations locally |
| `pnpm run db:migrate:remote` | Apply migrations remotely |
| `pnpm run db:studio:local` | Local Drizzle Studio |
| `pnpm run db:studio:remote` | Remote Drizzle Studio |
| `pnpm exec wrangler d1 execute DB --remote --command "..."` | Run arbitrary SQL remotely |

> Remote Studio requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, and
> `CLOUDFLARE_API_TOKEN` in `.env`.

## References

- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Drizzle <> Cloudflare D1](https://orm.drizzle.team/docs/connect-cloudflare-d1)

## Next steps

- [Storage](./storage) — R2 object storage
- [Cache](./cache) — KV cache
- [Authentication](./auth) — consumers of the user and session tables
