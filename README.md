# saas-template

A SaaS application template built on **TanStack Start**. Clone it, set five environment variables, and you have a running product: authentication, RBAC, orders, payments, credits, subscriptions, storage, email and AI are already wired, and the admin console lets you configure providers without touching code.

The shipped UI is demo material. The point of the template is the chassis underneath it: a database schema, a payment model that settles atomically, an admin panel, and a documentation site you can switch on.

- **English only** — no locale prefixes in URLs, no language switcher.
- **SQLite + Node by default** — no external services to run locally; Cloudflare Workers is a parallel option, not the default.
- **Prices live in code** (`src/config/pricing.ts`), not in a database row you can edit from the admin panel.

## Quick Start

```bash
pnpm install
cp .env.example .env.development   # then fill in the values below
pnpm db:push
pnpm rbac:init --admin-email=admin@example.com --admin-password=your-password
pnpm dev
```

Open `http://localhost:3000`, sign in with the admin account you just created, and configure payments, login providers, email, storage and AI at `/admin/settings`.

### The five variables that boot the app

```env
VITE_APP_URL=http://localhost:3000
VITE_APP_NAME=My App
DATABASE_PROVIDER=sqlite        # sqlite | postgres | mysql | turso | d1
DATABASE_URL=file:data/local.db
AUTH_SECRET=                    # openssl rand -base64 32
```

Nothing else is required. Provider credentials (payment keys, OAuth clients, mail and storage tokens, AI keys) live in the admin panel and are stored in the database — see [Configuration](#configuration-and-encryption).

Local env lives in `.env.development` (gitignored). It is loaded by both Vite and the `db:*` scripts. See `.env.example` for the full list of optional variables.

## Features

- **Auth** — Email/password, Google/GitHub OAuth and Google One Tap via better-auth
- **Payments** — Stripe, Creem, PayPal, Alipay, WeChat Pay: checkout, subscriptions, webhooks, refunds, coupons. Every grant is atomic and idempotent
- **Manual payments** — offline transfer (QR code + receipt upload) for one-time products, off by default
- **Credits** — FIFO consumption, expiration, auto-grant on signup, refunds
- **Guest posts** — paid articles: authors pay to submit, admins approve, request changes or reject with a refund; published with sponsored links
- **Support tickets** — user tickets with a floating support button and an admin inbox
- **AI** — Replicate, Gemini, Fal, Kie providers with task tracking and credit deduction
- **RBAC** — roles, permissions, wildcard matching, admin management
- **Agent API** — scoped admin tokens, an MCP server and an audit log, so agents can run the back office (see [docs/admin-agent.md](./docs/admin-agent.md))
- **API keys & invite codes** — key CRUD + validation; trial invite codes with batch generation
- **CMS & blog** — categories and posts, Markdown blog, MDX static pages
- **Documentation site** — an optional `/docs` module with markdown content, sidebar, TOC and search
- **Bot notifications** — Telegram / Feishu / WeCom / webhook messages for payments, tickets and guest posts
- **i18n** — English-only UI and content via Paraglide JS
- **Appearance** — optional admin-controlled color themes, font, size, sidebar layout and light/dark
- **Database** — SQLite, PostgreSQL, MySQL, Turso and Cloudflare D1 via Drizzle ORM
- **Deploy anywhere** — Node server (default), or Cloudflare Workers with D1 or Postgres via Hyperdrive

## Tech Stack

- TanStack Start (Vite 8 + nitro, React 19, TypeScript strict)
- TanStack Query, Form and Table for data, forms and tables
- shadcn/ui v4 (Base Nova style, Tailwind CSS 4)
- better-auth + Drizzle ORM
- Paraglide JS for i18n
- Node's built-in test runner (`node:test`) for the test suite

## Project Structure

```
src/
├── core/           # Infrastructure (db, auth, payment, email, storage, ai, notify, i18n)
├── modules/        # Business logic (payment, credits, subscriptions, manual-payments, docs, ...)
├── config/         # Env, DB schema templates, pricing catalog, feature defaults
├── routes/         # File-based routes (English-only, locale-free paths)
│   ├── settings/   # User center
│   ├── admin/      # Admin panel
│   ├── docs/       # Documentation site
│   └── api/        # Server routes (REST endpoints)
├── server/         # Server-only helpers shared by routes (admin ops, payment, ...)
├── blocks/         # Page sections that read i18n (disposable demo content)
├── components/     # Reusable UI, content via props (durable)
├── content/        # MDX static pages, blog posts, documentation markdown
├── hooks/          # Shared react-query hooks
└── lib/            # Utilities (api-client, query-client, hash, resp, rate-limit, crypto, ...)

messages/en.json    # Translation source (flat dot-keyed)
project.inlang/          # Inlang project config
src/paraglide/           # Compiled messages + runtime (gitignored, generated)
content/docs/            # Documentation content (ships empty)
```

## User Center & Admin Panel

The user center (`/settings`) has profile, credits, billing, payments, API keys, support tickets and guest posts. Optional pages can be switched off at Settings → Users.

The admin panel (`/admin`):

| Section    | Pages                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| Overview   | Stats and conversion funnel                                                                 |
| Operations | First-party traffic, revenue and experiments (needs `admin.operations.read`)                |
| RBAC       | Users (with activity timeline), Invite Codes, Roles, Permissions                            |
| Billing    | Payments, Manual Payments, Subscriptions, Credits                                           |
| Content    | Categories, Posts, Guest Posts, Tickets                                                     |
| Agent      | Agent accounts, tokens and audit log                                                        |
| Settings   | General, Users, Auth, Payment, Email, Storage, AI, Analytics, Ads, Customer Service, Notify |

## Deployment

### Node (default)

```bash
pnpm build     # vite build → .output/
pnpm start     # node .output/server/index.mjs
```

A multi-stage `Dockerfile` is included. `DATABASE_PROVIDER` is a build argument — it decides which schema template (`sqlite` / `postgres` / `mysql`) is stamped into `src/config/db/schema.ts` during install and build:

```bash
docker build --build-arg DATABASE_PROVIDER=sqlite -t saas-template .
docker run -p 3000:3000 --env-file .env.production saas-template
```

Before a production deploy, run the deploy gate. It refuses to continue with a missing or placeholder `AUTH_SECRET`, or without `CONFIG_ENCRYPTION_KEY`:

```bash
pnpm check:deploy-env
```

### Cloudflare Workers (parallel option)

Same codebase, different target: D1 (default) or Postgres via Hyperdrive.

```bash
cp wrangler.example.jsonc wrangler.jsonc   # wrangler.jsonc is gitignored
# fill in the real D1 database_id and vars in wrangler.jsonc
npx wrangler d1 create saas-template-db
pnpm cf:build
pnpm cf:deploy        # runs check:deploy-env first
```

The `/deploy-cloudflare` skill walks through the whole sequence (schema push, RBAC seed, secrets, deploy). `wrangler.jsonc` is never committed — only the template is.

## Manual payments (optional module)

Offline transfer: the buyer sends the money to a collection account, uploads a receipt, and an operator verifies it. It is **off by default**, it applies to **one-time products only**, and it never sells subscriptions.

To turn it on:

1. **Give the product a CNY price.** In `src/config/pricing.ts`, the product must have `type: PaymentType.ONE_TIME` and a `cnyPriceInCents` value. Subscription products are rejected by the checkout API (`INVALID_OFFER`).
2. **Enable the switch.** Admin → Settings → Payment → Manual payments → _Enable manual payments_. (You can also set `MANUAL_PAYMENTS_ENABLED=true` in the environment; the admin setting wins.) _Verification SLA (hours)_ sets the expected review time, 24 by default.
3. **Add a collection account.** Admin → _Manual Payments_ → add an account: display name, channel, currency and the QR code image. Accounts live only in the database — there is no source-code fallback list.
4. **Sell.** When `manual_payments_enabled` is on, the pricing page's payment-method dialog offers "Manual transfer". Checkout creates the order and sends the buyer to `/settings/payments/<orderNo>`, where they see the QR code, the exact amount and the remaining 15 minutes, and can upload their receipt.
5. **Verify.** Admin → _Manual Payments_ → review the submitted receipt, enter the amount you received — it has to match the payable amount, otherwise the review is rejected with `AMOUNT_MISMATCH` — optionally add the bank's reference number and a note, then approve or reject. Approval settles the order through the normal payment path, so credits, idempotency and the audit trail behave exactly like a provider checkout. A refund rolls the credits back. Money that arrived after the 15-minute window expired can still be settled with the _approve exception_ action.

The order amount is the catalog's CNY price plus a 1–99 fen fingerprint, so two live orders on the same account are distinguishable by amount alone; a partial unique index keeps concurrent allocations from colliding.

## Documentation site (optional module)

The `/docs` site is **off by default** and the content directory **ships empty**, so a fresh clone has no stale documentation.

To turn it on:

1. **Enable the switch.** Admin → Settings → General → Documentation → _Show the documentation site_. While it is off, `/docs` returns 404 and the header/footer show no Docs entry.
2. **Add content.** Markdown files under `content/docs/`, optionally in subdirectories. Frontmatter fields: `title` (required), `description`, `order`, `group`, `updated`.

```markdown
---
title: Getting started
description: How to set the template up.
order: 1
group: Guide
---

Body text.
```

File naming keeps a locale dimension even though only English ships: `guide.md` is the base-locale document, `guide.zh.md` would be a translation of the same page, and a missing translation falls back to the base locale. Adding a language later means adding the locale to `project.inlang/settings.json`, a `messages/<locale>.json` catalog and translated files — no loader change needed.

Content is bundled at build time (`import.meta.glob`), so the docs need no database and no extra build step.

## Configuration and encryption

Configuration has three layers, and only three:

1. **Environment** — the boot variables and server runtime parameters.
2. **Admin settings** — declared in `src/modules/config/settings.ts`, stored in the `config` table. Database values win over same-named env variables.
3. **Code catalogs** — `src/config/pricing.ts` (price, credits, plan), `src/config/user-features.ts`, `src/config/appearance.ts`.

### The config security baseline

- **Public allowlist.** `GET /api/config/public` only returns keys on a hand-written allowlist (`PUBLIC_CONFIG_KEYS`), and every key is re-checked against the protected-key and secret-key sets before it is sent. Anything else — including custom configuration — never reaches the browser.
- **Masked admin values.** `GET /api/admin/config` removes infrastructure keys (`auth_secret`, `database_*`) and masks the rest (`••••••••`, last 4 characters kept for long values). A masked value sent back is treated as "unchanged".
- **Encryption at rest.** Secrets saved in admin Settings are encrypted with **AES-256-GCM** before they are stored, using `CONFIG_ENCRYPTION_KEY` (the SHA-256 of the key is the AES key). The stored format is `enc:v1:<base64(iv | authTag | ciphertext)>`; existing plaintext rows keep working and are re-encrypted on their next save.
- **Endpoint changes require re-entering the secret.** Changing an endpoint that a stored key is sent to (OpenAI, Anthropic, R2, Telegram, notify webhook) requires the matching secret to be typed again, so a saved key can't be re-pointed at someone else's server.

```env
# Encrypts secrets saved via admin Settings (AES-256-GCM) in the config table.
# Unset = plaintext storage. Once set, keep it stable — rotating or removing it
# orphans already-encrypted values (they fall back to env values).
# Generate with: openssl rand -base64 32
CONFIG_ENCRYPTION_KEY=
```

### What the encryption does and does not protect

**It protects the "database only" scenario**: a leaked backup, a SQL-injection dump, a copied D1 database. Anyone who reads those rows gets ciphertext.

**It does not protect against a compromised application server.** The key lives in the environment of the same machine that serves the application, so an attacker who has the app server also has the key. The encryption reduces the blast radius of a database leak; it is not a substitute for securing the host.

`CONFIG_ENCRYPTION_KEY` unset means secrets are stored as plaintext — fine for local development, not for production. `pnpm check:deploy-env` refuses to deploy without it, and it runs automatically before `pnpm cf:deploy`.

## Commands

| Command                 | Description                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`              | Start the Vite dev server (port 3000)                                     |
| `pnpm build`            | Production build                                                          |
| `pnpm start`            | Run the production server (`node .output/server/index.mjs`)               |
| `pnpm test`             | Run the whole test suite (`node:test` via `tsx`)                          |
| `pnpm typecheck`        | `tsc --noEmit`                                                            |
| `pnpm db:setup`         | Copy the schema template for the chosen database                          |
| `pnpm db:push`          | Push schema to database (dev)                                             |
| `pnpm db:generate`      | Generate migration SQL (production)                                       |
| `pnpm db:migrate`       | Run migrations (production)                                               |
| `pnpm db:studio`        | Drizzle Studio GUI                                                        |
| `pnpm rbac:init`        | Create roles + permissions + optional admin user                          |
| `pnpm rbac:assign`      | Assign role to user                                                       |
| `pnpm admin:token`      | Manage agent accounts and admin API keys                                  |
| `pnpm admin:mcp`        | Local stdio MCP bridge for the admin API                                  |
| `pnpm cf:build`         | Cloudflare Workers build                                                  |
| `pnpm cf:deploy`        | Cloudflare Workers deploy (runs `check:deploy-env` first)                 |
| `pnpm check:deploy-env` | Refuse to deploy without a real `AUTH_SECRET` and `CONFIG_ENCRYPTION_KEY` |

## Tests and CI

The suite uses the Node built-in test runner (`node --import tsx --test tests/*.test.ts`). `pnpm test` compiles the Paraglide messages first, so it works on a clean clone.

CI (`.github/workflows/ci.yaml`, on every push and PR to `main`) runs on Node 22 with the pnpm version pinned in `package.json`:

```
pnpm install --frozen-lockfile → pnpm paraglide:compile → pnpm typecheck → pnpm test → pnpm build
```

`.github/workflows/docker-build.yaml` builds the Docker image.

## Agent Skills

| Skill                | What it does                                                   |
| -------------------- | -------------------------------------------------------------- |
| `/quick-start`       | Build a complete SaaS from a brief or reference URL            |
| `/clone-website`     | Rebuild an existing website on this template                   |
| `/new-module`        | Create a backend module (service + API)                        |
| `/new-page`          | Create a dashboard page with API wiring + nav entry            |
| `/new-static-page`   | Create an MDX content page (legal, about, FAQ)                 |
| `/design-theme`      | Restyle the palette and fonts                                  |
| `/generate-image`    | AI-generate a decorative image for a page                      |
| `/security-scan`     | Check the diff for secrets and vulnerabilities before a commit |
| `/deploy-cloudflare` | Deploy to Cloudflare Workers (D1 or Postgres + Hyperdrive)     |

Agent guidance lives in [AGENTS.md](./AGENTS.md) — it is the single source of truth for how this codebase works.

## License

This is proprietary software. See [LICENSE](./LICENSE) for the full license agreement.
