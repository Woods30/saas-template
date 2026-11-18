---
title: Deploy to Cloudflare
description: From account and token to first deploy and CI deploys
locale: en
order: 5
group: deploy
updated: 2026-11-03
---

The site runs on **Cloudflare Workers**. This page sets up your account and API token, walks through the first deploy, and wires up automatic deployment after a Release is published. Database, cache, and storage each have their own page.

## Steps

1. **Create an API token.** In [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens), click **Create Token** → **Create Custom Token** and select the permissions you need:

   | Permission | When needed |
   |---|---|
   | Account → Workers Scripts → Edit | **Required** to deploy the Worker |
   | Account → D1 → Edit | Using D1 |
   | Account → Workers KV Storage → Edit | Using the KV cache |
   | Account → Workers R2 Storage → Edit | Using R2 storage |
   | Account → Workers Routes → Edit | Binding a custom domain |
   | Account → Email Routing Addresses → Edit | Sending mail via Cloudflare Email |

   Put `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in `.env`, then verify with `pnpm exec wrangler whoami`.

2. **Configure the workers.dev subdomain.** It decides the live URL `<worker name>.<account subdomain>.workers.dev`. `wrangler whoami` does not show it, so query the API:

   ```bash
   curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
   ```

   `code 10007` means it does not exist yet — create it with `PUT` on the same path. **The subdomain cannot be renamed through the API** afterwards; only the Dashboard can do that, so pick a name you like the first time.

3. **Configure the project name.** The `name` field in `wrangler.jsonc` decides the Worker name and therefore the live URL. It is unrelated to the `name` field in `package.json`:

   ```jsonc title="wrangler.jsonc"
   { "name": "<your-worker-name>" }
   ```

4. **First deploy.** `pnpm deploy` runs the production env check → build → client bundle leak scan → `wrangler deploy`. Prepare three things first: `VITE_BASE_URL` in `.env.production` must be a real HTTPS domain; the D1 and KV binding IDs in `wrangler.jsonc` must be filled in; and runtime secrets must be set (`pnpm exec wrangler secret put BETTER_AUTH_SECRET`, piping the value in so it stays out of your shell history). The output carries the live URL when it succeeds.

5. **Bind a custom domain (optional).** The domain must be hosted in the **same Cloudflare account**, then add the route:

   ```jsonc title="wrangler.jsonc"
   "routes": [{ "pattern": "<your-domain.com>", "custom_domain": true }]
   ```

   Afterwards update `VITE_BASE_URL` and `BETTER_AUTH_URL` in `.env.production` and **deploy again**. Pointing a CNAME at `workers.dev` from another account is rejected by Cloudflare (error 1014).

6. **Wire up automatic deployment.** Create a `production` environment under repository **Settings → Environments** and fill in the table below.

## Automatic deployment

| Trigger | Behavior |
|---|---|
| Push or merge to `main` | CI only, no deployment |
| Publish a GitHub Release (tag matches the `package.json` version) | Deploy to production |
| Run `gh workflow run deploy.yml` by hand (ref must be `main`) | Deploy to production |

Both entry points require that commit's CI on `main` to have passed. The workflow finds or creates the D1 database and the KV namespace in the target account by name, writes their IDs back into `wrangler.jsonc`, then **applies the remote D1 migrations before deploying**, and finally smoke-tests `/` and `/pricing`.

What to put in the `production` environment:

| Type | Name | Purpose |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | Deployment token, with the permissions from the table above |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| Variable | `VITE_BASE_URL` | Full production origin, no path |
| Secret | `BETTER_AUTH_SECRET` | At least 32 characters; keep the current value on an existing site so sessions survive |
| Secret | `CONFIG_ENCRYPTION_KEY` | Passphrase for encrypted settings (≥ 16 chars); without it the admin cannot save secrets |
| Variable | `BETTER_AUTH_URL` | Optional, falls back to `VITE_BASE_URL` |
| Variable | `ADMIN_EMAILS` | Admin email list |
| Variable | `DEPLOY_SKIP_CUSTOM_DOMAIN` | Set to `true` to publish to `workers.dev` only |

The workflow uploads only the runtime fields on its allowlist. **Business credentials (Resend /
Stripe / Creem / GA / Discord, …) are not here**: after deployment, enter them in the admin
Settings page (encrypted at rest) or write them to the remote database with `pnpm db:seed` and
the right env. A fresh deploy only has defaults — configure payment and mail in the admin before
the site is fully usable.

## Build-time variables vs runtime secrets

| Type | How to set | When it takes effect | Example |
|---|---|---|---|
| Build time (`VITE_*`) | Local `.env.production` / GitHub Variables | **Inlined into the bundle** by `vite build` | `VITE_BASE_URL` |
| Runtime | `wrangler secret put` / uploaded at deploy time | Read through `env` while the Worker runs | `BETTER_AUTH_SECRET` |

**Changing a build-time variable requires a rebuild and a redeploy** — it is already a literal inside the client JavaScript. `BETTER_AUTH_SECRET` appears in both places for different reasons: the copy in `.env.production` only exists to pass the production check, while the runtime reads the Worker secret. **Both must be the same value.**

Business credentials are a third kind: written to the database after deployment, they take
effect as soon as you save — no rebuild, no secret change.

## Verify

`pnpm run check:env:prod` is the production environment check that `deploy` runs first, and `pnpm run check:client-bundle` scans the built client bundle for leaked server fields. Online, confirm that `/` and `/pricing` return 200, and that `/api/auth/get-session` responds (auth is enabled by default).

## Notes

- An account-scoped token returns `code 1000 Invalid API Token` from `GET /user/tokens/verify`. That is expected — verify with `wrangler whoami` instead.
- `wrangler deploy` never removes existing secrets, and deleting a GitHub Secret does not delete the remote value either; remove it in Cloudflare to revoke it.
- A value changed only in Cloudflare is overwritten by the GitHub configuration on the next automatic deploy.
