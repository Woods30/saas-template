---
title: Cloudflare
description: Account, API token, resources, first deploy, and CI deployment
locale: en
order: 5
group: deploy
updated: 2026-10-21
---

The site runs on **Cloudflare Workers**. This page sets up your account and API token,
walks through the first deploy, and wires up deployment on push to `main`.

Database, storage, and cache each have their own page — configure credentials and token
permissions here first, then those pages will work.

## Prerequisites

- A Cloudflare account ([sign up](https://dash.cloudflare.com/sign-up); the free plan is enough)
- `pnpm dev` works locally, see [Getting Started](./getting-started)

## Setup

### 1. Create an API token

`wrangler` supports two auth methods: `wrangler login` (OAuth, interactive) and API token
(non-interactive, required for CI). CI uses the latter.

In [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens), click
**Create Token** → **Create Custom Token** and select:

| Scope | Permission | When needed |
|---|---|---|
| Account | Workers Scripts → Edit | **Required** to deploy |
| Account | D1 → Edit | Using D1 |
| Account | Workers KV Storage → Edit | Using KV cache |
| Account | Workers R2 Storage → Edit | Using R2 storage |
| Account | Workers Routes → Edit | Custom domain |
| Account | Email Routing Addresses → Edit | Cloudflare Email |

The core path (D1 + KV + Worker) needs no Zone or R2 permissions.

Add the **Account ID** and **Token** to `.env`:

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
```

Verify:

```bash
pnpm exec wrangler whoami
```

> `GET /user/tokens/verify` returns `code 1000 Invalid API Token` for account-scoped tokens.
> That is **expected**. Verify with `wrangler whoami` instead.

### 2. Configure a workers.dev subdomain

The account needs a workers.dev subdomain before the first deploy. It determines the URL:

```
<worker-name>.<account-subdomain>.workers.dev
```

`wrangler whoami` does **not** show it. Check:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

`code 10007` means none exists yet. Create it:

```bash
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"subdomain":"your-subdomain"}'
```

> **The subdomain cannot be changed via API after creation.** `PUT` returns `code 10036`
> and `PATCH` returns `code 10405`. Renaming is Dashboard-only: Workers & Pages →
> **Your subdomain** → **Change**. **Pick a name you like the first time.**

### 3. Set the project name

`name` in `wrangler.jsonc` determines the Worker name and therefore the URL:

```jsonc title="wrangler.jsonc"
{
  // with account subdomain saas-template-demo → https://demo.saas-template-demo.workers.dev
  "name": "demo"
}
```

This is independent of `name` in `package.json`, which is only the npm package name.

### 4. First deploy

```bash
pnpm deploy
```

This runs production env validation → build → client bundle leak check → `wrangler deploy`.

Three things must be in place first:

1. `.env.production` exists with a real HTTPS `VITE_BASE_URL` (see [Environment](./environment));
2. Binding IDs in `wrangler.jsonc` are filled in, with **no `REPLACE_ME`** (see
   [Database](./database) and [Cache](./cache));
3. Runtime secrets are set:

```bash
printf '%s' "$BETTER_AUTH_SECRET" | pnpm exec wrangler secret put BETTER_AUTH_SECRET
```

`wrangler deploy` **does not** clear existing secrets; repeated deploys are idempotent.

On success the output includes the live URL:

```
Deployed demo triggers
  https://demo.saas-template-demo.workers.dev
```

### 5. Custom domain (optional)

The domain must already be on Cloudflare (nameservers pointed at Cloudflare). Then add:

```jsonc title="wrangler.jsonc"
"routes": [
  { "pattern": "your-domain.com", "custom_domain": true }
]
```

After binding, update `VITE_BASE_URL` and `BETTER_AUTH_URL` in `.env.production` and
**redeploy** — the former is inlined at build time.

> A custom domain requires **Workers Routes → Edit**; workers.dev does not.

## CI deployment

After CI passes on `main`, the deploy workflow runs. It uses `workflow_run` rather than a
separate `push` trigger so that a green CI is a hard prerequisite.

Set four GitHub secrets:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set VITE_BASE_URL
gh secret set BETTER_AUTH_SECRET
```

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Auth for `wrangler deploy` |
| `CLOUDFLARE_ACCOUNT_ID` | Account targeting |
| `VITE_BASE_URL` | Inlined into the client bundle at build time |
| `BETTER_AUTH_SECRET` | Lets `check:env:prod` pass |

> CI does **not** create `.env.production`; it passes values through the workflow `env:`
> block. Process env has the highest priority and `check-env-prod.ts` falls back to it when
> the file is missing, so secrets never land on the CI disk.

## Build-time vs runtime values

| Type | How to set | When it takes effect | Example |
|---|---|---|---|
| **Build-time** (`VITE_*`) | `.env.production` / GitHub secret | Inlined into the bundle at `vite build` | `VITE_BASE_URL` |
| **Runtime** | `wrangler secret put` | Read from `env` at Worker runtime | `BETTER_AUTH_SECRET` |

**Build-time values require a rebuild and redeploy to change** — they are literals in the
client JS.

`BETTER_AUTH_SECRET` appears in both places for different reasons: the `.env.production`
copy only satisfies production validation; runtime reads the Worker secret. **They must be
the same value.**

## References

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

## Next steps

- [Database](./database) — create and migrate D1
- [Storage](./storage) — R2
- [Cache](./cache) — KV
- [Environment](./environment) — `.env.production` and the two-layer model
