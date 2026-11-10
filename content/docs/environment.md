---
title: Environment Variables
description: Public and server env vars
locale: en
order: 4
group: config
updated: 2026-11-10
---

Environment variables come in two layers, each validated by its own Zod schema. Business code
must **not** read `process.env` or `import.meta.env` directly — always go through these two
modules.

| File | Contents |
|---|---|
| `src/env/public.ts` | `VITE_` prefix, inlined into the client bundle at build time |
| `src/env/server.ts` | Server secrets, read only at Workers runtime |

**A `VITE_` variable ends up in the browser.** It is baked into the client JS at build time and
anyone who opens the page can read it. A secret must never carry the `VITE_` prefix:
`pnpm check:client-bundle` scans the text assets in `dist/client` and fails on a server field
(it requires `pnpm build` first).

## Public variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_BASE_URL` | `http://localhost:3000` | Site root URL for canonical tags, OG, and the sitemap |
| `VITE_PAYMENT_PROVIDER` | — | Payment channel: `stripe` or `creem`; empty keeps the configured default |
| `VITE_CHECKOUT_MODE` | — | Checkout mode: `provider` (hosted) or `collection` (QR-code verification); the two are mutually exclusive |
| `VITE_COLLECTION_ACCOUNTS` | — | JSON array of collection accounts, overriding the source fallback in `src/config/website.ts`; an invalid value is ignored entirely |
| `VITE_MODULES` | — | Comma-separated module allowlist, overriding the module switches in config |
| `VITE_FEATURES` | — | Comma-separated feature allowlist, overriding `features` in config |
| `VITE_DOCS_AS_HOME` | — | `true` makes the root path open the docs home directly |
| `VITE_GA_ID` | — | Google Analytics `G-…` ID |
| `VITE_PLAUSIBLE_DOMAIN` | — | Plausible site domain |
| `VITE_UMAMI_WEBSITE_ID` / `VITE_UMAMI_ID` | — | Umami site ID; set either one |
| `VITE_UMAMI_SCRIPT_URL` | — | Umami script URL; must be a credential-free HTTPS URL |
| `VITE_CLARITY_PROJECT_ID` / `VITE_CLARITY_ID` | — | Microsoft Clarity project ID; set either one |
| `VITE_TURNSTILE_SITE_KEY` | — | Turnstile site key (the public half) |

`VITE_MODULES` / `VITE_FEATURES` are allowlists: once you set one, only the listed modules or
features stay on and everything else is off; leave both unset and the defaults in
`src/config/website.ts` apply.

## Server variables

All optional. A missing variable means the provider is not registered rather than falling back
to a placeholder — **an unconfigured feature stays off instead of pretending to work**.

| Variable | Constraint | Used by |
|---|---|---|
| `BETTER_AUTH_SECRET` | ≥ 32 chars | Auth, **required in production** |
| `BETTER_AUTH_URL` | URL | Absolute callback URL; inferred from the request origin when empty |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Must be paired | Google sign-in |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | — | Payment (Stripe) |
| `CREEM_API_KEY` / `CREEM_WEBHOOK_SECRET` | — | Payment (Creem) |
| `CREEM_PRODUCTS` | Comma-separated `reference=prod_xxx` | Creem product ID mapping |
| `CREEM_DEBUG` | `true` / `false` | `true` targets the Creem sandbox API |
| `RESEND_API_KEY` | — | Email (Resend) |
| `MAIL_FROM` | Valid address, no display name | Sender address |
| `RESEND_AUDIENCE_ID` | — | Newsletter (Resend) |
| `BEEHIIV_API_KEY` / `BEEHIIV_PUBLICATION_ID` | — | Newsletter (Beehiiv) |
| `BEEHIIV_SEND_WELCOME_EMAIL` | `true` / `false` | Whether new subscribers get a welcome email |
| `DISCORD_WEBHOOK_URL` | Must start with `https://discord.com/api/webhooks/` | Notifications (Discord) |
| `FEISHU_WEBHOOK_URL` | Must start with `https://open.feishu.cn/open-apis/bot/v2/hook/` | Notifications (Feishu) |
| `TURNSTILE_SECRET_KEY` | — | Turnstile server-side verification |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | — | Deploy and resource API |
| `ADMIN_EMAILS` | Comma-separated | Recipient allowlist for `/api/email` |
| `NODE_ENV` | `development` / `production` / `test` | Defaults to `development` |

Empty strings normalize to unset, so a blank line in `.env` is the same as omitting it.

Workers resource bindings (`DB` / `CACHE` / `BUCKET` / `EMAIL`) do not go through the env
schema; they are declared in `wrangler.jsonc`.

## Local file and production file

Local development values go in `.env` (copied from `.env.example`), production values go in
`.env.production`:

```bash
cp .env.example .env.production
```

When `.env.production` **exists**, `pnpm check:env:prod` uses it and does not fall back to `.env`
— otherwise a wrong production value would be masked by a valid local one. `vite build` loads
both files and prefers `.env.production` for the same key. Both files are git-ignored and must
not be committed. Priority (high → low): process env → `.env.production` → `.env`, so CI needs
no such file — put the values in the workflow `env:` block instead.

## Configuring production

Two routes, neither of which goes through a file in the repo:

- **GitHub Environment.** Put Secrets and Variables in the repository's Settings → Environments →
  `production`. `deploy.yml` reads them on a published Release or a manual trigger, and uploads
  only the whitelisted runtime fields to the Worker. When you enable a new service, add its
  fields to the workflow's `env:` block and to the upload allowlist — otherwise configuring them
  has no effect.
- **Manual deploys.** Set the runtime secrets on the Worker first:

  ```bash
  printf '%s' "<your-secret>" | pnpm exec wrangler secret put BETTER_AUTH_SECRET
  ```

  A build-time variable (`VITE_*`) only takes effect after a **rebuild and redeploy**; a runtime
  secret takes effect immediately.

Once it is configured, continue with [Deploy to Cloudflare](./cloudflare).
