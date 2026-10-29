---
title: Cloudflare
description: Account, API token, resources, first deploy, and CI deployment
locale: en
order: 5
group: deploy
updated: 2026-10-29
---

The site runs on **Cloudflare Workers**. This page sets up your account and API token,
walks through the first deploy, and wires up production deployment after publishing a stable
GitHub Release. Pushing or merging to `main` runs CI only.

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
pnpm exec wrangler secret put RESEND_API_KEY
pnpm exec wrangler secret put MAIL_FROM
pnpm exec wrangler secret put BETTER_AUTH_URL
```

Currently `mail.enabled: true` selects `resend` and `auth.requireEmailVerification: true`.
Verify your sending domain in Resend, then configure `RESEND_API_KEY` and a plain
`MAIL_FROM` address on that domain, without a display name or angle brackets. Local development
uses `.env`. For manual production deployment, supply the same environment's values in
`.env.production` for validation and keep Worker runtime bindings consistent.
`BETTER_AUTH_URL` is `http://localhost:3000` locally and the actual HTTPS origin in
production, matching `VITE_BASE_URL`. Missing mail configuration makes `auth` report
`incomplete`, `/api/auth/*` return 503, and production validation fail. Email verification
is never implicitly disabled. See [Email](./email).

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

**The zone must be in the same Cloudflare account as the Worker.** Cloudflare creates the DNS
records and certificate inside the owning account, and it cannot create a custom domain on a
zone you do not own; pointing a CNAME at `workers.dev` across accounts is blocked (CNAME
Cross-User Banned, error 1014). When the domain lives in another account, either move the zone
into the Worker's account, or deploy the Worker in that account and handle custom hostnames
through Workers for Platforms. To find which account owns a zone:

```bash
curl -s "https://api.cloudflare.com/client/v4/zones?name=your-domain.com" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

An empty `result` array means the current token cannot see the zone — usually because it
belongs to another account or the token lacks Zone read permission.

### 6. Receiving and sending on the same domain

One domain can receive mail through Cloudflare Email Routing and send through Resend at the
same time; their records have different names and coexist:

| Purpose | Records | Added by |
|---|---|---|
| Receiving (forward to Gmail and similar) | Root `MX` → `route1/2/3.mx.cloudflare.net`, root `TXT` → `v=spf1 include:_spf.mx.cloudflare.net ~all`, DKIM at `cf2024-1._domainkey` | Added automatically when Email Routing is enabled |
| Sending (verification emails and similar) | DKIM at `resend._domainkey`, Return-Path on the `send` subdomain (`MX` + `TXT`, or two `CNAME` records for domains created after August 2026) | The Records tab in the Resend dashboard |

Key points:

- **Only one SPF record may exist at the root.** Email Routing already claims it; if another
  service must send as this domain, merge its `include:` into that record — a second
  `v=spf1` record breaks SPF outright.
- Resend's SPF lives on the `send` subdomain for bounce handling and does not affect the root.
- Resend `CNAME` records **must not be proxied** (orange cloud), and no other record may share
  the same name; otherwise verification never completes.
- Email Routing receives only, never sends: forwarded mail cannot be replied to from the
  original address, so reply from the Gmail account.

## CI deployment

Merging to `main` runs CI only. Publishing a **stable GitHub Release** triggers production deployment through `release.published`. Drafts, prereleases, and tag pushes alone do not deploy.

Use this sequence: PR → merge `main` → wait for that commit's CI → publish a tag matching `package.json` (for example `v0.2.0`) → Deploy → smoke tests. The workflow verifies that the tag commit belongs to `main` and its push CI succeeded, then deploys the verified immutable SHA. If CI is still running at publication, rerun Deploy after it succeeds.

### GitHub configuration

Create the `production` Environment in **Settings → Environments**. If deployment branch rules are enabled, allow version tags such as `v*`. Set these environment values; repository-level values also work:

| Type | Name | Value / purpose |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | Deployment token with Workers Scripts Edit, D1 Edit, and account read access; add KV / Workers Routes permissions as needed |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Account that owns the resources in `wrangler.jsonc` |
| Variable | `VITE_BASE_URL` | Production HTTPS origin without a path |
| Variable | `BETTER_AUTH_URL` | Optional; defaults to `VITE_BASE_URL` for auth callbacks |
| Secret | `BETTER_AUTH_SECRET` | At least 32 characters; preserve the existing value for an established site |
| Secret | `RESEND_API_KEY` | Required for current Resend mail and email verification; use an API key with sending permission |
| Variable | `MAIL_FROM` | Plain email address on the Resend-verified domain, without display name or angle brackets; a same-name Secret also works, with the Variable taking precedence |
| Secret | `STRIPE_SECRET_KEY` | Production Stripe API secret key; use a test key only for an intentionally test-mode demo |
| Secret | `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_…`) for the same-mode endpoint at `<VITE_BASE_URL>/api/webhooks/stripe` |
| Secret | `DISCORD_WEBHOOK_URL` | Channel webhook URL; required when notifications are enabled (currently disabled) |
| Variable | `VITE_GA_ID` | GA4 Measurement ID (`G-…`); required when analytics is enabled (currently disabled) |

Existing repository Secrets for `CLOUDFLARE_ACCOUNT_ID` and `VITE_BASE_URL` remain supported. Use Variables for new public configuration. In the same Stripe environment, configure an active USD 99 one-time price with lookup key `jerbix_template`; see [Payment](./payment) for webhook events. Disable unused notification or analytics modules in `src/config/website.ts` instead of leaving required configuration empty.

Neither `RESEND_API_KEY` nor `MAIL_FROM` uses a `VITE_` prefix. `MAIL_FROM` is the sender;
the support inbox is configured separately in `websiteConfig.mail.supportEmail`. Setting one
does not populate the other. Support is `service@jerbix.site` and the intended production domain
is `https://www.jerbix.site`. Set production `VITE_BASE_URL` and `BETTER_AUTH_URL` to that origin
and configure a separate Resend sender. Domain bindings and environment changes take effect during deployment.

Optional mappings are included for Google OAuth (Variable `GOOGLE_CLIENT_ID`, Secret `GOOGLE_CLIENT_SECRET`), Turnstile (Variable `VITE_TURNSTILE_SITE_KEY`, Secret `TURNSTILE_SECRET_KEY`), and administrator emails (Variable `ADMIN_EMAILS`). These and both Resend fields are already mapped. When enabling additional providers, extend both workflow env mappings and the runtime upload allowlist.

CLI prompts keep values out of shell history:

```bash
gh secret set RESEND_API_KEY --env production
gh variable set MAIL_FROM --env production
gh secret set STRIPE_SECRET_KEY --env production
gh secret set STRIPE_WEBHOOK_SECRET --env production
gh secret set DISCORD_WEBHOOK_URL --env production
gh variable set VITE_GA_ID --env production
```

### Deployment and migration boundaries

The workflow validates production configuration, builds, scans the client bundle, and uses `wrangler deploy --secrets-file` to upload allowlisted runtime bindings with the Worker version. `RESEND_API_KEY` and `MAIL_FROM` are already allowlisted; `MAIL_FROM` is uploaded as a server binding even when sourced from a GitHub Variable. GitHub is the configuration source for automatic deployments; no separate manual synchronization to Worker secrets is needed. The temporary JSON file has restricted permissions and is deleted on exit. Secret values are never printed, and Cloudflare deployment credentials are excluded from Worker bindings.

**Production D1 migrations are not automated.** Back up and review them separately before release. Migration `0008_payment_simplification.sql` requires empty payment tables and must not be applied directly to historical production payment data. D1 / KV bindings remain configured in `wrangler.jsonc`.

Secret upload is additive: omitted Worker secrets persist. Removing a GitHub Secret does not delete its remote counterpart. Remove retired values in Cloudflare explicitly. A Cloudflare-only edit will be overwritten by the GitHub value on the next automatic deployment.

## Build-time vs runtime values

| Type | How to set | When it takes effect | Example |
|---|---|---|---|
| **Build-time** (`VITE_*`) | Local `.env.production` / GitHub Variables | Inlined into the bundle at `vite build` | `VITE_BASE_URL` |
| **Runtime** | Local `wrangler secret put` / automatic Release upload | Read from `env` at Worker runtime | `BETTER_AUTH_SECRET` |

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
