---
title: Quick Start
description: Seven steps from clone to live
locale: en
order: 1
group: start
updated: 2026-11-18
---

Seven steps take you from a fresh clone to a live site. Every step comes with a command, and every step leaves you with something you can look at.

## Prerequisites

| Need | Notes |
|---|---|
| Node.js 22 / 24 | `package.json` `engines` allows `^22.12.0`, `^24.0.0`, and newer |
| pnpm | Version pinned by `packageManager` in `package.json` (currently `pnpm@12.4.2`) — do not use another |
| Cloudflare account | Optional. You can run locally without one; it is needed for deploys and for creating resources |
| PostgreSQL | Optional. Only needed if you want PostgreSQL in production — see [Database](./database) |

## Steps

1. **Install dependencies.**

   ```bash
   pnpm install
   ```

2. **Pick a database shape and generate the schema.**

   The shape is decided by `DATABASE_PROVIDER` in `.env`. It defaults to `sqlite` (a local SQLite
   file):

   ```bash
   # .env
   DATABASE_PROVIDER=sqlite   # sqlite | d1 | postgres
   ```

   ```bash
   pnpm db:setup
   ```

   It generates two things: `src/core/db/schema.ts` (the schema entry for the current dialect) and
   the first baseline migration for that dialect. Both are **generated artifacts, not committed** —
   run it again after switching dialects. See [Database](./database).

3. **Create the Cloudflare resources and write your local env.**

   ```bash
   pnpm run setup
   ```

   It creates (or reuses) a D1 database and a KV namespace in your account, writes their IDs back into
   `wrangler.jsonc`, writes `CLOUDFLARE_DATABASE_ID` and `BETTER_AUTH_SECRET` into `.env`, and
   applies a local migration while it is at it. It also asks whether you want Stripe or Creem, which
   email provider, and whether to send Discord notifications — whatever you answer lands in `.env`.

   Values already present in `.env` are kept: re-running `setup` will not replace your
   `BETTER_AUTH_SECRET` or sign everyone out.

   R2 is **not** created for you — the bucket must be activated once in the Cloudflare dashboard (it
   requires a payment method, so the API cannot do it); see [File Storage](./storage) for the manual
   steps. If you are not logged in to Cloudflare the script warns and continues — local development
   uses a SQLite-backed D1 and needs no real resources:

   ```bash
   pnpm exec wrangler login
   ```

4. **Write the seed configuration.**

   ```bash
   pnpm db:seed -- --brand "Acme" --email <your-support-email>
   ```

   The seed writes per-field defaults from the settings registry (brand, SEO, social, payment,
   mail, module switches, plus the credentials in `.env`). `--brand` and `--email` replace the
   factory values with yours; leave them out to keep the template defaults — you can also change
   them later in the admin settings page.

   The seed **only fills in what is missing** and never overwrites what you changed in the admin
   panel; add `--force` to overwrite.

5. **Start the dev server.**

   ```bash
   pnpm dev
   ```

   Open `http://localhost:3000`. If the database was not initialized, run it by hand:

   ```bash
   pnpm run db:migrate:local
   ```

6. **Make it your own.** Configuration lives in two places: the factory values in code and the live
   configuration in the database.

   - What the database owns (site name, SEO, social links, payment provider, mail, module switches):
     sign in, open **Settings → Admin → System settings**, save — it takes effect immediately.
   - What stays in code: the package name in `package.json`, the PWA app name in
     `public/manifest.json`, the brand strings in `messages/zh.json` and `messages/en.json`, your
     products in `src/config/products.ts`, and the logo / theme asset paths in
     `src/config/website.ts`. Field by field in [Site Configuration](./configuration).

7. **Deploy.**

   ```bash
   pnpm deploy
   ```

   This runs production env validation → build → client bundle leak check → `wrangler deploy`.

## Verification

- Local: open `http://localhost:3000` in a browser; a rendered homepage passes.
- Live: the output of `pnpm deploy` includes the live URL (`<worker name>.<account subdomain>.workers.dev`) — if it opens, the deploy passed.

## Notes

- A secret must never carry the `VITE_` prefix: `VITE_` variables are inlined into the browser
  bundle at build time and anyone who opens the page can read them. `pnpm check:client-bundle`
  scans the build output and fails on a leak.
- Values in your local `.env` do **not** become production secrets on their own. Configure production
  values separately (GitHub production Environment or `wrangler secret put`) — see
  [Environment Variables](./environment).
- Before deploying, set `VITE_BASE_URL` in `.env.production` to a real HTTPS domain:
  `pnpm check:env:prod` rejects `localhost` and placeholder domains.
- **Migrations are not committed**: after changing the schema, run `pnpm db:generate` locally and
  apply the result to the target database by hand. Production never follows the code on its own.

Once it is configured, continue with [Site Configuration](./configuration) and
[Deploy to Cloudflare](./cloudflare).
