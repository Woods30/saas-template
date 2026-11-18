---
title: Environment variables
description: Startup requirements, seed values and production configuration
locale: en
order: 4
group: config
updated: 2026-11-19
---

Environment variables now cover **startup requirements only**. Credentials for payment, mail,
notifications and analytics live in the database configuration; env is read once by
`pnpm db:seed` as initial values and ignored at runtime — see
[Site configuration](./configuration) and `docs/adr/0010-settings-in-database.md`.

Application code must **not** read `process.env` / `import.meta.env` directly; go through
`src/core/env/public.ts` and `src/core/env/server.ts`.

| File | Content |
|---|---|
| `src/core/env/public.ts` | Public values inlined into the client bundle; now only `VITE_BASE_URL` |
| `src/core/env/server.ts` | `ServerEnv` (startup requirements) + `ManagedEnv` (credential shape derived from DB config) |

**`VITE_` values are visible in the browser.** They are inlined into client JS at build time,
so any visitor can read them. Secrets must never carry the `VITE_` prefix:
`pnpm check:client-bundle` scans `dist/client` text output and fails when it finds server-only
fields (run `pnpm build` first).

## Startup requirements

| Variable | Constraint | Purpose |
|---|---|---|
| `VITE_BASE_URL` | URL | Site root for canonical, OG and sitemap; must be HTTPS in production |
| `BETTER_AUTH_SECRET` | ≥ 32 chars | Auth; **required in production** |
| `BETTER_AUTH_URL` | URL | Absolute base for auth callbacks; inferred from the request origin when unset |
| `CONFIG_ENCRYPTION_KEY` | ≥ 16 chars | Passphrase for encrypted settings; without it the admin refuses to save groups containing secrets |
| `DATABASE_PROVIDER` | `sqlite` / `d1` / `postgres` | Runtime connection and which schema is generated at build time |
| `DATABASE_URL` | connection string | Required for `postgres` |
| `SQLITE_DATABASE_URL` | file path | Local SQLite file |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | — | Deploy and resource API |
| `ADMIN_EMAILS` | comma-separated | Recipient allowlist for `/api/email` |
| `NODE_ENV` | `development` / `production` / `test` | Defaults to `development` |

Empty strings are normalised to "unset"; leaving a value blank in `.env` is the same as not
setting it.

Keep `CONFIG_ENCRYPTION_KEY` separate from the database. If it is lost, every ciphertext in
`settings` becomes undecryptable and the fields must be re-entered. When moving databases,
don't rotate the passphrase at the same time.

Workers resource bindings (`DB` / `CACHE` / `BUCKET` / `EMAIL`) are not part of the env schema;
they are declared in `wrangler.jsonc`.

## Seed values

`.env.example` also lists fields with an `envKey` (`RESEND_API_KEY`, `STRIPE_SECRET_KEY`,
`VITE_GA_ID`, …). They are **read once by `pnpm db:seed`** and copied into `settings`; after
that the database is authoritative:

```bash
cp .env.example .env   # fill in credentials
pnpm db:setup
pnpm db:seed           # write to the database; later edits go through the admin
```

Blank values keep the registry defaults. To overwrite existing values again, run
`pnpm db:seed --force`.

## Local and production files

Local development values go in `.env` (copied from `.env.example`); production values go in
`.env.production`:

```bash
cp .env.example .env.production
```

When `.env.production` **exists**, `pnpm check:env:prod` reads it and does not fall back to
`.env` — otherwise a broken production config would be masked by valid local values. It only
checks startup requirements; service credentials live in the database and cannot be verified
statically. `vite build` loads both files with `.env.production` taking precedence. Both files
are git-ignored and must never be committed. Precedence (high → low): process env →
`.env.production` → `.env`, so CI does not need the file and can use workflow `env:` blocks.

## Production

Two entry points, neither of which uses repository files:

- **GitHub Environment.** Put Secrets and Variables under Settings → Environments →
  `production`. `deploy.yml` reads them on release or manual dispatch and uploads only the
  allowlisted runtime fields to the Worker. When you add a new startup requirement, add it to
  the workflow `env:` block and the upload allowlist as well.
- **Manual deploy.** Set runtime secrets on the Worker:

  ```bash
  printf '%s' "<your-secret>" | pnpm exec wrangler secret put BETTER_AUTH_SECRET
  ```

  Build-time values (`VITE_*`) require a rebuild and redeploy; runtime secrets take effect
  immediately.

Business credentials (Stripe / Resend / GA, …) are entered in the admin **Settings** page
after deployment, or written to the remote database by running `pnpm db:seed` locally with the
right env.

Next: [Deploy to Cloudflare](./cloudflare).