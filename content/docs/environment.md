---
title: Environment Variables
description: The two-layer env model, the VITE_ rule, and production config
locale: en
order: 4
group: config
updated: 2026-10-22
---

Environment variables come in two layers, validated by two Zod schemas. Business code must
**not** read `process.env` or `import.meta.env` directly — always go through these modules.

| File | Contents |
|---|---|
| `src/env/public.ts` | `VITE_` prefix, inlined into the client bundle at build time |
| `src/env/server.ts` | Server secrets, read only at Workers runtime |

## Prerequisites

None. This page stands alone, though [Cloudflare](./cloudflare) is worth reading before
configuring a deploy.

## Setup

### The `VITE_` rule

`VITE_` variables are inlined into the client bundle at build time — **anyone who opens the
page can read them**.

| Prefix | Meaning | Examples |
|---|---|---|
| `VITE_` | Public | `VITE_BASE_URL`, `VITE_STRIPE_LOOKUP_PRO_MONTHLY` |
| No prefix | Server secret | `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY` |

> **Never put a secret behind `VITE_`.** `pnpm check:client-bundle` scans the build output
> and fails on a leak. It requires `pnpm build` first.

### Public variables

| Variable | Default | Notes |
|---|---|---|
| `VITE_BASE_URL` | `http://localhost:3000` | Site base URL for canonical, OG, sitemap |
| `VITE_PAYMENT_PROVIDER` | — | Payment provider (only `stripe`) |
| `VITE_STRIPE_LOOKUP_PRO_MONTHLY` | — | `lookup_key` of the monthly Price |
| `VITE_STRIPE_LOOKUP_PRO_YEARLY` | — | `lookup_key` of the yearly Price |
| `VITE_STRIPE_LOOKUP_LIFETIME` | — | `lookup_key` of the one-time Price |
| `VITE_GA_ID` | — | Google Analytics |
| `VITE_PLAUSIBLE_DOMAIN` | — | Plausible |
| `VITE_UMAMI_WEBSITE_ID` | — | Umami |
| `VITE_UMAMI_SCRIPT_URL` | — | Umami script URL (credential-free HTTPS) |
| `VITE_CLARITY_PROJECT_ID` | — | Microsoft Clarity |
| `VITE_TURNSTILE_SITE_KEY` | — | Turnstile site key |

### Server variables

All optional. A missing variable means the provider is not registered rather than falling
back to a placeholder — **an unconfigured feature stays off instead of pretending to work**.

| Variable | Constraint | Used by |
|---|---|---|
| `BETTER_AUTH_SECRET` | ≥ 32 chars | Auth, **required in production** |
| `BETTER_AUTH_URL` | URL | Absolute callback URL; inferred from request origin when empty |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | — | Payment |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Must be paired | Google sign-in |
| `RESEND_API_KEY` / `MAIL_FROM` | `MAIL_FROM` must be a valid address | Email |
| `RESEND_AUDIENCE_ID` | — | Newsletter (Resend) |
| `BEEHIIV_API_KEY` / `BEEHIIV_PUBLICATION_ID` | — | Newsletter (Beehiiv) |
| `DISCORD_WEBHOOK_URL` | Must start with `https://discord.com/api/webhooks/` | Notifications |
| `FEISHU_WEBHOOK_URL` | Must start with `https://open.feishu.cn/open-apis/bot/v2/hook/` | Notifications |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | — | Deploy and API |
| `ADMIN_EMAILS` | — | `/api/email` recipient allowlist |
| `NODE_ENV` | `development` / `production` / `test` | Defaults to `development` |

Empty strings normalize to unset, so a blank line in `.env` is the same as omitting it.

### Workers bindings

Resource bindings do not go through the env schema; they are declared in `wrangler.jsonc`:

| Binding | Type | Purpose |
|---|---|---|
| `DB` | D1 | Drizzle database |
| `CACHE` | KV | Cache and rate limiting |
| `BUCKET` | R2 | Object storage |
| `EMAIL` | SendEmail | Cloudflare Email |

### Production config

Local `.env` holds development values; production lives in `.env.production`:

```bash
cp .env.example .env.production
```

Change at least two things: set `VITE_BASE_URL` to a real HTTPS domain and
`BETTER_AUTH_SECRET` to a production secret. The file is git-ignored and **must not be
committed**.

Priority (high → low): **process env → `.env.production` → `.env`**. CI therefore needs no
such file — put the values in the workflow `env:` block instead.

> When `.env.production` **exists**, `check-env-prod.ts` uses it and does not fall back to
> `.env` — otherwise a wrong production value would be masked by a valid local one.
> Fallback only happens when the file is absent.

## Commands

| Command | Behavior |
|---|---|
| `pnpm check:env` | Validate local `.env`; invalid fields fail |
| `pnpm check:env:prod` | Production check: `VITE_BASE_URL` must be a real HTTPS domain |
| `pnpm check:client-bundle` | Requires `pnpm build`; confirms no secrets in the bundle |

The production URL check rejects `localhost`, `127.*`, `0.0.0.0`, URLs with embedded
credentials, and placeholder domains like `example.com` or `*.test`.

## References

- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Better Auth options](https://www.better-auth.com/docs/reference/options)

## Next steps

- [Cloudflare](./cloudflare) — configure variables in production
- [Integrations](./integrations) — which variables each module needs
- [Website Config](./configuration) — module switches
