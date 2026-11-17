---
title: Database
description: Creating, migrating, and changing the schema on Cloudflare D1
locale: en
order: 6
group: deploy
updated: 2026-11-03
---

Data lives in **Cloudflare D1** (SQLite), accessed through **Drizzle ORM**. The schema is in `src/core/db/schema.ts`, the migrations in `src/core/db/migrations/`.

## Steps

1. **Create the D1 database.** The easiest route is `pnpm run setup`: it creates the D1 database and the KV namespace in your account, writes the resource IDs back into `wrangler.jsonc`, and fills in `.env`. To do it by hand:

   ```bash
   pnpm exec wrangler d1 create <your-db-name>
   ```

   Copy the `database_id` from the output into `wrangler.jsonc`:

   ```jsonc title="wrangler.jsonc"
   {
     "d1_databases": [
       {
         "binding": "DB",
         "database_name": "<your-db-name>",
         "database_id": "<your-database-id>",
         "migrations_dir": "./src/core/db/migrations"
       }
     ]
   }
   ```

   When the command offers to write the config for you, **decline and edit by hand** — it writes through JSON serialization and wipes every comment in `wrangler.jsonc`. The `binding` is the name code reads (`env.DB`) and must match `src/types/cloudflare.d.ts`.

2. **Apply migrations.** Local and remote are separate:

   ```bash
   pnpm run db:migrate:local    # local development database
   pnpm run db:migrate:remote   # remote production database
   ```

3. **Change the schema.** After editing `src/core/db/schema.ts`, generate a migration and apply it:

   ```bash
   pnpm run db:generate
   pnpm run db:migrate:local
   ```

## Usage

The Drizzle instance comes from `createDb(env.DB)` per D1 binding, not from a global singleton:

```ts
// src/core/db/index.ts
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}
```

`src/core/auth/auth.ts` calls `createDb(env.DB)` inside `createAuth(env)` and reuses the instance per binding, so concurrent requests on Workers never share state.

## Verify

```bash
pnpm exec wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

You should see `users`, `sessions`, `accounts`, `verifications`, `subscriptions`, `payments`, `checkout_reservations`, `files`, `apikey`, `newsletter_subscriptions`, `webhook_events`.

## Common commands

| Command | What it does |
|---|---|
| `pnpm run db:generate` | Generate a migration file from schema changes |
| `pnpm run db:migrate:local` | Apply migrations to the local database |
| `pnpm run db:migrate:remote` | Apply migrations to the remote database |
| `pnpm run db:studio:local` | Local Drizzle Studio |
| `pnpm run db:studio:remote` | Remote Drizzle Studio |
| `pnpm exec wrangler d1 execute DB --remote --command "..."` | Run arbitrary SQL remotely |

## Notes

- **Read the generated SQL before you commit it.** `db:generate` reads a renamed column as "drop the old column, add a new one" and loses data; adding a column is safer than renaming one.
- Remote Studio reads `process.env` directly, so the environment needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN`.
- Automatic deployment applies the remote migrations before deploying — review the migration yourself before releasing.
- `pnpm dev` uses the local SQLite file under `.wrangler/state`, completely separate from the remote database.
