---
title: Environment Variables
description: Two-layer env validation, the VITE_ rule, and production checks
locale: en
order: 4
group: config
updated: 2026-10-15
---

Environment variables come in two layers, validated by two Zod schemas:

| File | Contents |
|---|---|
| `src/env/public.ts` | `VITE_` prefix, bundled into the client at build time |
| `src/env/server.ts` | Server secrets, read only in the Workers runtime |

```ts
// src/env/public.ts
export const publicEnv: PublicEnv = parsePublicEnv(import.meta.env ?? {})

// src/env/server.ts
export function parseServerEnv(raw: unknown): ServerEnv
```

> **Note**: Business code must **not** read `process.env` / `import.meta.env` directly — always go through these two modules' exports.

`publicEnv` validates at module load, so an invalid `VITE_BASE_URL` throws in the importer rather than running with broken config. `parseServerEnv` runs **per request** — `src/server.ts` parses at the request entry, stores the result in AsyncLocalStorage, and exposes it as `getServerContext().env`.

## The `VITE_` rule

`VITE_` variables are inlined into the client bundle at build time, **visible to anyone who opens the page**.

| Prefix | Meaning |
|---|---|
| `VITE_` | Public value (site URL, Stripe Price IDs, analytics IDs) |
| none | Server secret, read only through Workers bindings |

> **Note**: Never give a secret the `VITE_` prefix. `pnpm check:client-bundle` scans the build output to confirm nothing leaked.

## Public variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `VITE_BASE_URL` | URL | `http://localhost:3000` | Site base for canonical, OG, sitemap, robots |
| `VITE_PAYMENT_PROVIDER` | `'stripe'` | — | Payment provider |
| `VITE_STRIPE_PRICE_PRO_MONTHLY` | `string` | — | Monthly subscription Price ID |
| `VITE_STRIPE_PRICE_PRO_YEARLY` | `string` | — | Yearly subscription Price ID |
| `VITE_STRIPE_PRICE_LIFETIME` | `string` | — | Lifetime Price ID |
| `VITE_GA_ID` | `string` | — | Google Analytics measurement ID |
| `VITE_PLAUSIBLE_DOMAIN` | `string` | — | Plausible domain |
| `VITE_UMAMI_WEBSITE_ID` | `string` | — | Umami website ID |
| `VITE_UMAMI_ID` | `string` | — | Umami website ID (legacy) |
| `VITE_UMAMI_SCRIPT_URL` | URL | — | Umami script URL; must be a credential-free HTTPS URL |
| `VITE_CLARITY_PROJECT_ID` | `string` | — | Microsoft Clarity project ID |
| `VITE_CLARITY_ID` | `string` | — | Clarity project ID (legacy) |
| `VITE_TURNSTILE_SITE_KEY` | `string` | — | Turnstile site key (its secret lives server-side) |

## Server variables

All optional; when absent the matching provider is not registered rather than falling back to a placeholder.

| Variable | Constraint | Description |
|---|---|---|
| `BETTER_AUTH_SECRET` | ≥ 32 chars | Auth secret; **required in production** |
| `STRIPE_SECRET_KEY` | — | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | — | Stripe webhook signing secret |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Google OAuth |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | — | Cloudflare API |
| `CLOUDFLARE_EMAIL_SENDER` | — | Cloudflare Email legacy sender field |
| `RESEND_API_KEY` | — | Resend key |
| `MAIL_FROM` | Valid email | Unified sender address |
| `RESEND_AUDIENCE_ID` | — | Resend audience ID |
| `BEEHIIV_API_KEY` / `BEEHIIV_PUBLICATION_ID` | — | Beehiiv |
| `BEEHIIV_SEND_WELCOME_EMAIL` | `'true'` / `'false'` | Default `'false'` |
| `DISCORD_WEBHOOK_URL` | Must start with `https://discord.com/api/webhooks/` | Discord notifications |
| `FEISHU_WEBHOOK_URL` | Must start with `https://open.feishu.cn/open-apis/bot/v2/hook/` | Feishu notifications |
| `TURNSTILE_SECRET_KEY` | — | Turnstile server-side check |
| `ADMIN_EMAILS` | — | `/api/email` recipient allowlist |
| `NODE_ENV` | `development` / `production` / `test` | Default `development` |

Empty strings are normalized to `undefined` (see `treatEmptyAsUndefined` in `src/env/normalize.ts`), so a blank field in `.env` is the same as unset.

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must both be set for Google sign-in to be offered — with only one, Better Auth does not register the provider and the sign-in page hides the button. Authentication's mail flows reuse `MAIL_FROM` / `RESEND_API_KEY` (or the Cloudflare equivalents); there is no separate auth sender. See [Authentication](./auth).

## Workers bindings

Resource bindings do not go through the env schema; declare them in `wrangler.jsonc` and they arrive as request arguments:

| Binding | Type | Purpose |
|---|---|---|
| `DB` | D1 | Drizzle database |
| `CACHE` | KV | Cache and rate limiting |
| `BUCKET` | R2 | Object storage |
| `EMAIL` | SendEmail | Cloudflare Email sending |

`src/types/cloudflare.d.ts` derives the string-binding types from `ServerEnv`, so a schema change propagates automatically.

## Check commands

| Command | Behavior |
|---|---|
| `pnpm check:env` | Validates the local `.env`; illegal fields fail, enabled-but-incomplete services print a value-free diagnostic |
| `pnpm check:env:prod` | Production check: `VITE_BASE_URL` required and must be a real HTTPS domain; missing fields for enabled services fail outright |
| `pnpm check:client-bundle` | Requires `pnpm build` first; confirms no server secret is in the client bundle |

The production URL check rejects: `localhost`, `*.localhost`, `::1`, `127.*`, `0.0.0.0`, URLs with embedded credentials, and `example.com` / `example.net` / `example.org` plus their subdomains, `*.example`, and `*.test`.

```bash
# CI: validate with process env when there is no .env
BETTER_AUTH_SECRET=... VITE_BASE_URL=https://acme.dev pnpm check:env:prod
```

> **Note**: With no `.env` the check falls back to process env (CI), and process env takes precedence over the `.env` file. Diagnostics contain field names and reasons only — **never** a credential value.

## Local setup

```bash
cp .env.example .env
pnpm check:env
```

`pnpm run setup` interactively creates D1 / R2 / KV resources, generates an auth secret, and writes `.env` and `wrangler.jsonc`.

> **Note**: A local `.env` does **not** become production secrets — configure them separately with `wrangler secret put` before deploying.

## References

- [Better Auth options](https://www.better-auth.com/docs/reference/options) — `BETTER_AUTH_SECRET` and other settings
- [Stripe API keys](https://docs.stripe.com/keys) — key types and webhook signing secrets
- [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server) — `GOOGLE_CLIENT_ID` / `SECRET`
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — production secrets and local `.dev.vars`
- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) — binding declarations
- [Cloudflare D1](https://developers.cloudflare.com/d1/) — the resource behind the `DB` binding
- [Cloudflare Workers KV get started](https://developers.cloudflare.com/kv/get-started/) — the resource behind the `CACHE` binding
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/get-started/workers-api/) — the resource behind the `BUCKET` binding
- [Drizzle <> Cloudflare D1](https://orm.drizzle.team/docs/connect-cloudflare-d1) — connecting the ORM
- [Resend API](https://resend.com/docs/api-reference/introduction) — `RESEND_API_KEY` usage
- [beehiiv Create an API Key](https://developers.beehiiv.com/welcome/create-an-api-key) — getting a `BEEHIIV_API_KEY`
- [Discord Webhooks](https://docs.discord.com/developers/resources/webhook) — creating a `DISCORD_WEBHOOK_URL`
- [Feishu custom bot](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) — creating a `FEISHU_WEBHOOK_URL`
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) — `VITE_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`

## Next steps

- [Website Config](./configuration) — how module switches map to required config
- [Integrations](./integrations) — the env fields each module needs
- Deployment steps live in `content/docs/cloudflare.md` in the repo
