---
title: Getting Started
description: From clone to live — run it, customize it, deploy it
locale: en
order: 1
group: start
updated: 2026-10-21
---

This page takes you from cloning the repo to a live site. Four stages, every step with a
copyable command.

When you finish you have a site on Cloudflare Workers with your own name, logo, and
navigation.

## Prerequisites

| Need | Notes |
|---|---|
| Node.js 22 / 24 | Even LTS only. Odd versions (23 / 25) are unsupported by `vitest@5` |
| pnpm | Version pinned by `packageManager` in `package.json`; do not use pnpm 9 |
| Cloudflare account | The free plan is enough. You can run locally without one |

```bash
node --version   # v22.x or v24.x
pnpm --version
```

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Provision local resources

```bash
pnpm run setup
```

The script asks for a project name, then creates (or reuses) a D1 database, R2 bucket, and
KV namespace, generates the auth secret, and writes the results to `.env` and
`wrangler.jsonc`.

If you are not logged in to Cloudflare it warns you but continues — local development uses
a SQLite-backed D1 and needs no real resources. To log in:

```bash
pnpm exec wrangler login
```

### 3. Start the dev server

```bash
pnpm dev
```

Open `http://localhost:3000`. If the database was not initialized, run it manually:

```bash
pnpm exec wrangler d1 migrations apply DB --local
```

### 4. Customize the site

All site identity lives in `src/config/website.ts`:

```ts
// src/config/website.ts
export function createWebsiteConfig(env: PublicEnv): WebsiteConfig {
  return {
    baseUrl: env.VITE_BASE_URL,
    metadata: {
      name: 'Jerbix',                        // ← your site name
      images: { ogImage: '/logo.png', /* … */ },
    },
    docs: { enabled: true },                 // ← set false to drop the docs site
    // …
  }
}
```

See [Website Config](./configuration) for every field.

### 5. Deploy

```bash
pnpm deploy
```

This runs production env validation → build → client bundle leak check → `wrangler deploy`.

> Local `.env` values do **not** become production secrets. Configure them separately with
> `wrangler secret put`, and **never** put a secret behind a `VITE_` prefix — those are
> inlined into the browser bundle.

To deploy automatically on push to `main`, see
[Cloudflare · CI deployment](./cloudflare#ci-deployment).

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` | Production build |
| `pnpm deploy` | Validate → build → check → deploy |
| `pnpm check` | Biome + TypeScript + env + locale (run before committing) |
| `pnpm test` | Unit and component tests |

## References

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)

## Next steps

- [Website Config](./configuration) — name, logo, module switches
- [Cloudflare](./cloudflare) — account setup and CI deployment
- [Project Structure](./project-structure) — where to change things
