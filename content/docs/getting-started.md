---
title: Getting Started
description: Run Jerbix from scratch — environment, resources, and deploy checks
locale: en
order: 1
group: start
updated: 2026-10-14
---

## Prepare your environment

You need Node.js 22.12+ on an even-numbered LTS (22 or 24), pnpm, and a Cloudflare account.

```bash
pnpm install
pnpm exec wrangler login
pnpm exec wrangler whoami
```

`wrangler login` opens a browser to authorize. Use `whoami` to confirm the account before continuing.

## Provision resources

```bash
pnpm run setup
```

The script creates or looks up a D1 database, R2 bucket, and KV namespace, generates an auth secret, and writes local `.env` and `wrangler.jsonc`.

> **Note**: The resources it creates belong to your Cloudflare account. Check existing configuration before running so you do not overwrite values you need to keep.

Stripe, email, and notification can be configured in the script or later. You must still fill in credentials for whichever modules you use before deploying.

## Start local development

```bash
pnpm dev
```

Open `http://localhost:3000`. The database uses D1 (SQLite) with Drizzle. The script attempts local migrations; if that fails, retry manually:

```bash
pnpm exec wrangler d1 migrations apply DB --local
```

## Customize the site

| What to change | Where |
|---|---|
| Site name, logo, module switches | `src/config/website.ts` |
| UI copy | `messages/zh.json`, `messages/en.json` |
| Page routes | `src/routes/` |
| Marketing blocks | `src/components/blocks/marketing/` |
| Docs / blog content | `content/` |

See [Website Config](./configuration) for every configuration field.

## Check and deploy

```bash
pnpm check
pnpm test
pnpm exec vitest run --config vitest.components.config.ts
pnpm build
pnpm check:client-bundle
```

```bash
pnpm deploy
```

`pnpm deploy` runs the production env check, builds, verifies the client bundle, then runs `wrangler deploy`.

> **Note**: A local `.env` does **not** become production secrets. Configure them separately with `wrangler secret put`, and never put secrets in `VITE_` variables — those are shipped to the browser bundle.

## Next steps

- [Website Config](./configuration) — every `websiteConfig` field and switch
- [Navigation & Menus](./navigation) — navbar, footer, and docs sidebar
- [Integrations](./integrations) — email, payment, newsletter, notifications, analytics
- [Environment Variables](./environment) — the two-layer check and the `VITE_` rule
