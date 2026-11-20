# Application — Agent Instructions

This repository is a **SaaS application template**: a headless backend (auth, RBAC, orders, payments, credits, subscriptions, storage, email, AI) plus a thin UI layer, shipped with demo content you are expected to replace. Every statement below describes what is actually in this repository — if one of them stops matching the code, fix the code or fix this file, but never leave both stale.

## Product copy

Use the configured application name for branding (`VITE_APP_NAME`, overridable in Admin → Settings → General → App Info). Do not add vendor branding, promotional badges, or template demonstration articles to product copy.

## Language policy

English only. `project.inlang/settings.json` declares `locales: ["en"]` and `baseLocale: "en"`, and `tests/english-only.test.ts` asserts that exactly one locale is enabled and that messages resolve.

- **Routes have no locale prefix.** `src/router.tsx` de-localizes incoming URLs and re-localizes outgoing ones; `vite.config.ts` keeps every English URL prefix-free (API paths are never prefixed either).
- **There is no `/zh` route and no `/zh` redirect.** Do not add one. A stale locale cookie does not change the language.
- The language switcher (`src/components/locale-selector.tsx`) renders nothing while only one locale is enabled, so the header and footer show no language control.
- Product copy lives in `messages/en.json` (flat dot-keyed JSON, ~1.5k keys). Static MDX pages are named `<slug>.en.mdx` under `src/content/pages/`.
- **The documentation module keeps the locale dimension on purpose** — see "Documentation site" below. Adding a language later means adding the locale to `project.inlang/settings.json`, a `messages/<locale>.json` catalog, and translated doc files (`guide.zh.md`). No loader change is needed.

## Tech Stack

- **Framework:** TanStack Start (Vite 8 + nitro, React 19, TypeScript strict). File-based routing under `src/routes/`. No React Server Components and no `"use client"` directives — all components are regular React; loaders and server functions do the server-side work.
- **UI:** shadcn/ui v4 (Base Nova style, Tailwind CSS 4, oklch colors) — primitives in `src/components/ui/`
- **Data fetching:** TanStack Query v5 over the typed `@/lib/api-client` — no raw `fetch` in components.
- **Forms:** TanStack Form v1 + zod v4, via the `TextField` helper in `@/components/form-field`.
- **Tables:** `@/components/data-table` (TanStack Table, manual pagination).
- **i18n:** Paraglide JS (`@inlang/paraglide-js` 2.x) — compiled message functions, flat dot-keyed JSON.
- **Auth:** better-auth with the Drizzle adapter.
- **Database:** Drizzle ORM — SQLite (default), PostgreSQL, MySQL, Turso and Cloudflare D1.
- **All code is self-contained** — no external packages for business logic. Payment, email, storage, AI, auth and utils are inlined in `src/core/` and `src/lib/`.

## Commands

- `pnpm dev` — Vite dev server (port 3000)
- `pnpm build` — production build (always verify after changes)
- `pnpm start` — run the production server (`node .output/server/index.mjs`)
- `pnpm test` — the whole test suite (`node --import tsx --test tests/*.test.ts`); `pretest` compiles the Paraglide messages first
- `pnpm typecheck` — `tsc --noEmit`; `pretypecheck` compiles messages and regenerates the route tree
- `pnpm db:setup` — copy the schema template matching `DATABASE_PROVIDER` (also runs as `prebuild` and `postinstall`)
- `pnpm db:push` — push the schema to the database (development — direct sync, may lose data)
- `pnpm db:generate` — generate SQL migration files in `/drizzle/` (production — safe, reviewable)
- `pnpm db:migrate` — run pending migrations
- `pnpm db:studio` — Drizzle Studio GUI
- `pnpm rbac:init` — create roles, permissions and (optionally) the first admin user
- `pnpm rbac:assign` — assign a role to a user
- `pnpm admin:token` — manage agent accounts and admin API keys (see `docs/admin-agent.md`)
- `pnpm admin:mcp` — stdio MCP bridge for the admin API
- `pnpm cf:build` / `pnpm cf:deploy` — Cloudflare Workers build and deploy
- `pnpm check:deploy-env` — refuse to deploy without a real `AUTH_SECRET` and `CONFIG_ENCRYPTION_KEY`
- `pnpm format` / `pnpm format:check` — Biome (format + import order; `format:check` is read-only)

### First-time setup

```bash
pnpm install              # install dependencies (postinstall stamps out schema.ts)
cp .env.example .env.development   # then set AUTH_SECRET (and DATABASE_* if not sqlite)
pnpm db:setup             # copy the matching schema template (postinstall already did this)
pnpm db:push              # create tables
pnpm rbac:init --admin-email=admin@example.com --admin-password=...
pnpm dev                  # start the dev server
```

**Five variables are enough to boot.** `VITE_APP_URL`, `VITE_APP_NAME`, `DATABASE_PROVIDER`, `DATABASE_URL`, `AUTH_SECRET`. Everything else (payment providers, OAuth, email, storage, AI, analytics) is configured in Admin → Settings and stored in the database. See "Environment variables" below.

**Env files:** copy `.env.example` → `.env.development` for local dev (gitignored). `scripts/with-env.ts` (used by the `db:*` and `rbac:*` scripts) and Vite's `loadEnvFiles()` (called from `vite.config.ts`) both resolve `.env.{NODE_ENV}.local` → `.env.{NODE_ENV}` → `.env.local` → `.env`, so `.env.development` is the canonical local file and server-side `process.env` is populated from it. `.env.example` is the committed template — keep it in sync when you add a variable to `src/config/index.ts`.

### Schema change workflow

The schema has three committed dialect templates — `src/config/db/schema.sqlite.ts`, `schema.postgres.ts`, `schema.mysql.ts` — and one gitignored working copy, `src/config/db/schema.ts`, which `scripts/db-setup.mjs` copies from the template matching `DATABASE_PROVIDER` (sqlite/turso/d1 → sqlite, postgres/postgresql → postgres, mysql → mysql).

**Development** (fast iteration, ok to lose data):

1. Edit the template in `src/config/db/schema.<dialect>.ts` (and `schema.ts`, or re-run `pnpm db:setup`)
2. `pnpm db:push`

**Production** (safe, reversible):

1. Edit the template in `src/config/db/schema.<dialect>.ts`
2. `pnpm db:generate` — creates migration SQL in `/drizzle/`
3. Review the generated SQL — check for destructive operations (DROP COLUMN, etc.)
4. `pnpm db:migrate` — apply to the database

**Rule:** agents use `db:push` during development. For production deployments, always use `db:generate` + `db:migrate` and ask the user to review the migration before applying. Change the template, not only the working copy — the working copy is regenerated by `pnpm db:setup` and by every build.

## Architecture

```
src/
├── core/                        # Infrastructure — every project uses this
│   ├── db/                      # Multi-DB (SQLite, PostgreSQL, MySQL, D1) + atomic()
│   ├── auth/                    # better-auth (server + client) + RBAC matching
│   ├── i18n/                    # navigation.tsx (locale-aware Link/router) + dynamic.ts (tDynamic)
│   ├── payment/                 # Payment providers (Stripe, Creem, PayPal, Alipay, WeChat)
│   ├── email/                   # Email providers (Resend, Cloudflare)
│   ├── storage/                 # Storage providers (S3, R2, local private fallback)
│   ├── notify/                  # Bot channels (Telegram, Feishu, WeCom, webhook)
│   └── ai/                      # AI providers (Replicate, Gemini, Fal, Kie)
│
├── modules/                     # Business logic — independently removable
│   ├── payment/service.ts       # Checkout, webhook, order + subscription + credit atomicity
│   ├── subscriptions/service.ts # Subscription lifecycle (CRUD, status transitions)
│   ├── credits/service.ts       # FIFO consumption, expiration, revocation, auto-grant
│   ├── manual-payments/         # Offline transfer orders, accounts, receipts, review
│   ├── docs/service.ts          # Documentation content loader (glob-backed)
│   ├── apikeys/service.ts       # API key CRUD + validation
│   ├── rbac/service.ts          # Role/permission checks, wildcard matching
│   ├── config/service.ts        # DB key-value config, masking, encryption
│   ├── ai-tasks/service.ts      # AI task tracking with credit deduction/revocation
│   ├── notify/service.ts        # Bot notifications (paid orders) + client-safe templates.ts
│   ├── posts/, taxonomy/        # Blog posts and categories
│   ├── events/service.ts        # Product events (recordEvent) shown in the admin user timeline
│   ├── admin-access/            # Agent accounts and admin API keys
│   ├── operations/, analytics/  # First-party traffic and revenue reporting
│   ├── storage/, tickets/, invite-codes/, indexnow/
│
├── config/
│   ├── index.ts                 # All env vars (app, db, auth, stripe, resend, storage, ai, locale)
│   ├── pricing.ts               # Authoritative pricing catalog (price, credits, plan, CNY price)
│   ├── appearance.ts            # Theme, font, size, sidebar defaults + the appearance setting keys
│   ├── user-features.ts         # Which user-center pages exist by default
│   ├── events.ts                # Known product-event kinds
│   └── db/schema.<dialect>.ts   # Table definitions (templates); schema.ts is the working copy
│
├── messages/en.json        # Translation source — flat dot-keyed (e.g. "landing.hero.headline")
├── project.inlang/settings.json # Inlang project config (locales, baseLocale, plugins)
├── src/paraglide/          # Generated message fns + runtime — gitignored, rebuilt by the vite plugin
│
├── server.ts                    # Nitro entry — wraps the handler in paraglideMiddleware (locale via AsyncLocalStorage)
├── router.tsx                   # getRouter — creates the router instance + rewrite (deLocalizeUrl/localizeUrl)
├── routeTree.gen.ts             # Generated route tree (do not edit by hand)
├── routes/                      # File-based routes (pages + API) — locale-free paths
│   ├── __root.tsx               # HTML shell: QueryClientProvider, fonts, ThemeProvider, Toaster, Analytics, notFound
│   ├── index.tsx                # Homepage
│   ├── pricing.tsx              # createFileRoute('/pricing') — no locale segment
│   ├── (auth)/                  # Sign-in, sign-up, password reset, invite redeem, auth callback
│   ├── (pages)/                 # MDX static pages: <slug>.tsx routes + -static-page.tsx factory
│   ├── docs/                    # Documentation site routes (/docs and /docs/$slug)
│   ├── blog/                    # Blog index and post pages
│   ├── settings/                # User dashboard pages (route.tsx = layout + nav)
│   ├── admin/                   # Admin panel pages (route.tsx = layout + nav)
│   └── api/                     # Server routes — REST endpoints
│
├── content/pages/               # MDX content for static pages (<slug>.en.mdx)
├── content/docs/                # Documentation markdown — ships empty
├── hooks/                       # Shared react-query hooks
├── blocks/                      # Zero-config page sections: read i18n, wire data into components
├── components/                  # Reusable UI: all content via props, no i18n reads
│   │                            # e.g. site-header, site-footer, pricing-table, app-sidebar
│   ├── data-table.tsx           # Paginated table (TanStack Table, manual pagination, `loading` prop)
│   ├── form-field.tsx           # TextField — TanStack Form field wired to a labeled Input
│   ├── mdx-components.tsx        # MDX element styling (mdxComponents for MDXProvider)
│   ├── docs/                    # Documentation site components
│   └── ui/                      # shadcn/ui primitives (add via `npx shadcn add`)
├── styles/globals.css           # Theme tokens (oklch CSS variables)
└── lib/                         # Utilities (api-client, query-client, hash, resp, cookie, cache, rate-limit, time, env, crypto, cn)
```

Key entry files:

- `vite.config.ts` — plugins: mdx → tailwindcss → **paraglideVitePlugin** (outdir `./src/paraglide`, `strategy: ['url','baseLocale']`, English-only `urlPatterns`) → tanstackStart → viteReact → nitro. Calls `loadEnvFiles()` so server-side `process.env` is populated from `.env.{NODE_ENV}`.
- `src/server.ts` — Nitro fetch entry; wraps the request in `paraglideMiddleware` so `getLocale()` resolves server-side.
- `src/router.tsx` — exports `getRouter`; its `rewrite` runs Paraglide `deLocalizeUrl`/`localizeUrl` so routes and URLs stay locale-free for English.
- `src/routes/__root.tsx` — HTML shell (`QueryClientProvider` + `ReactQueryDevtools` in dev, fonts via `@fontsource`, `ThemeProvider`/`Toaster`/`GoogleOneTap`/`Analytics`, `notFoundComponent`). Its loader also resolves the appearance, cookie-consent, analytics and `docs_enabled` switches.
- `src/routeTree.gen.ts` — generated; never edit by hand (`pnpm route:generate`).

## Module System

Every module in `src/modules/` is a **standalone service file** that:

- Imports only from `@/core/`, `@/config/`, `@/lib/`, or `drizzle-orm`
- Exports pure functions (no React, no route handlers)
- Can be deleted without breaking other modules

### How modules connect to routes

```
User Request → API Route (src/routes/api/*) → Module Service (src/modules/*) → Database
```

API routes are thin server-route wrappers — they check auth, parse params, call the service, return JSON.

### Module dependency rules

- Modules depend on `core/`, `config/`, `lib/`, and `drizzle-orm` — never on other modules' internals
- Exception: `payment/service.ts` calls `credits/` and `subscriptions/` because payment success triggers credit granting and subscription creation. This is the ONE allowed cross-module dependency.
- `ai-tasks/service.ts` calls `credits/` for consumption/revocation. This is the second.
- `payment/service.ts` also calls `notify/` to push a bot message (Telegram/Feishu/WeCom/webhook, configured in Admin → Settings → Notify) after a paid order commits. Channel senders live in `@/core/notify`.
- All other modules are fully independent.

## Key Patterns

### i18n (translations)

i18n is powered by **Paraglide JS** (`@inlang/paraglide-js`). Messages are compiled into tree-shakeable functions — there is no provider, no `useTranslations` hook, no `useLocale`.

**Message source:** flat dot-keyed JSON in `messages/en.json`. The key prefix is the old namespace, e.g. `"landing.hero.headline"`, `"common.nav.profile"`, `"admin.users.credits_granted"`. The Inlang project config lives at `project.inlang/settings.json`. The compiler output `src/paraglide/` is **gitignored** and regenerated by the vite plugin on each build/dev — run `pnpm paraglide:compile` before running `tsc` or the tests on a fresh clone.

**Components (any component — they're all regular React):**

```tsx
import { m } from '@/paraglide/messages.js';

export function MyButton() {
  return <button>{m['landing.nav.get_started']()}</button>;
}
```

- With params: `m['common.table.total']({ count })`
- Explicit locale (e.g. in a loader): `m['landing.pricing.title']({}, { locale })`
- Runtime-built keys (tab labels, keyed lists): `tDynamic(key)` from `@/core/i18n/dynamic`. Prefer static `m['ns.key']()` whenever the key is known — dynamic access opts the bundle out of tree-shaking.

**Adding a translation:** add the key to `messages/en.json`, then call `m['the.key']()`. No per-namespace folders, no `localeMessagesPaths` registration — `src/config/locale/index.ts` only exports `localeNames` for the switcher UI.

**Locale runtime:** `import { getLocale, setLocale, localizeHref, localizeUrl, locales, baseLocale } from '@/paraglide/runtime.js'`. `getLocale()` works in components and in loaders (server-side via the `paraglideMiddleware` AsyncLocalStorage, client-side after hydration).

**Locale selection:** only `en` is supported. `localizedPath('/pricing', 'unknown')` falls back to the base locale.

**Locale-aware links:** use `Link` from `@/core/i18n/navigation` instead of a raw anchor for pages. Internal hrefs stay **locale-free** (`href="/pricing"`); the router rewrite localizes the output URL (English has no prefix). `useRouter`/`usePathname` come from the same module.

### Pages & route metadata

Pages are file routes living directly under `src/routes/**` — **there is no `{-$locale}` segment**. URL locale prefixes are handled entirely by the router `rewrite` (`src/router.tsx`) + `paraglideVitePlugin` `urlPatterns` (`vite.config.ts`) + `paraglideMiddleware` (`src/server.ts`). So `createFileRoute` paths have no locale segment:

```tsx
import { createFileRoute } from '@tanstack/react-router';

import { m } from '@/paraglide/messages.js';

function PricingPage() {
  return <h1>{m['landing.pricing.title']()}</h1>;
}

export const Route = createFileRoute('/pricing')({
  component: PricingPage,
});
```

Layouts are `route.tsx` files in a folder that render `<Outlet />`. Route groups `(auth)`, `(pages)` work like Next. Colocated non-route files use a `-` prefix (e.g. `-settings-form.tsx`).

Metadata replaces `generateMetadata` — declare it on the route's `head`. When a title/description needs the active locale, resolve it in the `loader` with `getLocale()` and pass it to the message function (see `src/routes/pricing.tsx` and `(pages)/-static-page.tsx`):

```tsx
export const Route = createFileRoute('/pricing')({
  loader: () => {
    const locale = getLocale();
    return { title: m['landing.pricing.title']({}, { locale }) };
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.title }] : [],
  }),
  component: PricingPage,
});
```

`notFound()` and `redirect()` are imported from `@tanstack/react-router`.

### Client data fetching (TanStack Query + api-client)

Components never call `fetch` directly — they use **TanStack Query** over the typed `@/lib/api-client`. `QueryClientProvider` is mounted in `src/routes/__root.tsx` (`src/lib/query-client.ts`: a fresh client per SSR request, a browser singleton).

`@/lib/api-client` unwraps the `respData`/`respErr` envelope (`{ code, message, data }`) and throws `ApiError` on `code !== 0`:

- `apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete`
- `pageQuery(base, { page, pageSize, search })` — builds the list query string
- `PageResult<T>` = `{ items: T[]; total: number }`

**List query** (paginated, keeps previous page while fetching):

```tsx
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiGet, pageQuery, type PageResult } from '@/lib/api-client';

const listQuery = useQuery({
  queryKey: ['admin-users', page, debouncedSearch],
  queryFn: () =>
    apiGet<PageResult<User>>(
      pageQuery('/api/admin/users', {
        page,
        pageSize: 10,
        search: debouncedSearch,
      })
    ),
  placeholderData: keepPreviousData,
});
// listQuery.data?.items, listQuery.data?.total, listQuery.isFetching
```

**Mutation** (invalidate + toast on success):

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiPost } from '@/lib/api-client';

const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: (vars: { userId: string; credits: number }) =>
    apiPost('/api/admin/users/credits', vars),
  onSuccess: () => {
    toast.success(m['admin.users.credits_granted']());
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  },
  onError: (e: Error) => toast.error(e.message),
});
```

Shared hooks live in `src/hooks/` — `usePublicConfig()` (`use-public-config.ts`), `useUserPermissions()` (`use-user-permissions.ts`), `useUserFeatures()` (`use-user-features.ts`), `useAppearance()` (`use-appearance.ts`), `useConfirm()` (`use-confirm.tsx`). Pass `listQuery.isFetching` to `<DataTable loading={...} />`.

### Forms (TanStack Form + zod)

Forms use **TanStack Form** with zod validation and the `TextField` helper from `@/components/form-field`:

```tsx
import { useForm } from '@tanstack/react-form';
import { z } from 'zod';

import { TextField } from '@/components/form-field';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const form = useForm({
  defaultValues: { email: '', password: '' },
  validators: { onSubmit: schema },
  onSubmit: async ({ value }) => {
    /* ... */
  },
});

<form
  onSubmit={(e) => {
    e.preventDefault();
    form.handleSubmit();
  }}
>
  <form.Field name="email">
    {(field) => (
      <TextField
        field={field}
        label={m['common.sign.email_title']()}
        type="email"
      />
    )}
  </form.Field>
  <form.Subscribe selector={(s) => s.isSubmitting}>
    {(isSubmitting) => (
      <Button type="submit" disabled={isSubmitting}>
        Submit
      </Button>
    )}
  </form.Subscribe>
</form>;
```

See `src/routes/(auth)/sign-in.tsx` and the admin dialog forms for reference.

### Route loaders & server functions

Server-side work happens in route `loader`s or `createServerFn` — not in components. Components never import server-only modules (`@/modules/*`, `@/core/db`); they fetch from API routes or call server functions.

```tsx
import { getAuth } from '@/core/auth';

// inside a route loader, beforeLoad, or a createServerFn handler
const auth = getAuth();
const session = await auth.api.getSession({ headers: request.headers });
```

Auth on the client uses `useSession` from `@/core/auth/client`.

### API routes (server routes)

Files live under `src/routes/api/**` and serve the same `/api/**` URLs as before:

```ts
import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized');
  // call module service...
  return respData(result);
}

export const Route = createFileRoute('/api/<feature>')({
  server: { handlers: { GET } },
});
```

Dynamic params: `$provider.ts` → `params.provider`. Catch-all: `$.ts`. better-auth mounts at `src/routes/api/auth/$.ts` via `auth.handler(request)`. `respData`/`respErr`/`respPage` come from `@/lib/resp`.

### Database queries

```ts
import { eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { someTable } from '@/config/db/schema';

const rows = await db()
  .select()
  .from(someTable)
  .where(eq(someTable.userId, id));
```

### Atomic writes (money, credits, anything multi-statement)

**Never use `db().transaction()` for writes that must succeed together.** D1 has no interactive transactions, and on D1 `transaction()` just runs the callback statement by statement. A failure halfway leaves partial data, such as a paid order with no credits. Use `atomic()` from `@/core/db/atomic` instead. It runs the steps as one `batch()` on D1/SQLite/Turso and as a real transaction on Postgres/MySQL:

```ts
import { atomic, AtomicGuardError, guard } from '@/core/db/atomic';

// 1. Read everything first, and decide in JS (no reads between writes).
// 2. Build every write up front from `q` (never `db()`), and state each
//    condition as a guard instead of an `if`.
try {
  await atomic((q) => [
    guard({
      table: order,
      column: 'userId', // any NOT NULL column of `table`
      where: eq(order.id, id),
      require: eq(order.status, 'created'), // must hold for every matched row
      message: 'Order already settled',
    }),
    q.update(order).set({ status: 'paid' }).where(eq(order.id, id)),
    credits > 0 && q.insert(credit).values(newCredit), // falsy steps are skipped
  ]);
} catch (e) {
  if (e instanceof AtomicGuardError) return; // lost the race: already handled
  throw e;
}
```

- Guards see the earlier steps' writes. Use them as preconditions (claim a row before updating it) or postconditions (`remaining_credits >= 0` after a relative decrement).
- Prefer relative updates (`sql\`${col} - ${n}\``) plus a guard over writing values computed from a stale read.
- Credits: `planConsume()` / `planDeductForRefund()` return steps you can bundle into your own `atomic()` call (see `ai-tasks/service.ts`).
- D1 accepts at most 100 bound parameters per statement, so chunk large `inArray` lists and multi-row inserts. Keep a batch to a modest number of statements.
- Test the D1 path: `pnpm test:atomic` (SQLite batch), `pnpm test:atomic:d1` (real local D1 via wrangler), and `pnpm test:atomic:pg` (Postgres transaction, needs `ATOMIC_PG_URL`).

### Manual payments (offline transfer)

A second way to pay, for products sold outside a payment provider: the buyer transfers the money to a collection account, uploads a receipt, and an operator verifies it. It is **off by default** and **only for one-time products**.

- The switch is `manual_payments_enabled` (default `false`) in Admin → Settings → Payment → Manual payments; `manual_payments_sla_hours` (default `24`) records the expected verification time.
- `POST /api/payment/checkout` branches on `payment_provider === 'manual_payments'` (or a default provider set to it) and calls `createManualOrder()` instead of `PaymentManager`. It returns an **in-site** payment page URL, not an external checkout URL.
- `createManualOrder()` refuses anything that is not a one-time catalog product with a CNY price (`INVALID_OFFER`), refuses when the module is disabled (`MODULE_DISABLED`), and refuses when no collection account is enabled (`NO_MANUAL_PAYMENT_ACCOUNT`). **Subscriptions are never sold this way** — a subscription product is rejected before an order is created.
- The order amount is the catalog's CNY price plus a 1–99 fen fingerprint, so two live orders on the same account are distinguishable by amount alone. The `(accountId, payableAmount)` partial unique index is the arbiter; when all 99 fingerprints are taken the request fails with `AMOUNT_POOL_EXHAUSTED`.
- Receipts are stored under a private prefix and are only readable through `GET /api/payment/manual/receipt/<orderNo>` (owner or admin). `StorageProvider` grew an optional `getObject()` for that; the local fallback writes to `data/uploads/`, not `public/`.
- Operators work at `/admin/manual-payments`: manage collection accounts (with a QR image) and review submitted receipts (confirm, reject with a reason, mark refunded). Settlement reuses the normal payment path, so credits, idempotency and the audit trail behave exactly like a provider checkout.
- One-time products only means the module never creates a subscription and never renews one. Refunds roll back credits and close the order.

### Documentation site

The docs are an optional module: **off by default**, with an **empty** `content/docs/`.

- The switch is `docs_enabled` (default `false`) in Admin → Settings → General → Documentation. While it is off, `/docs` and `/docs/$slug` throw `notFound()` and the header/footer show no Docs entry.
- Content is markdown under `content/docs/**/*.md`, bundled at build time with `import.meta.glob('/content/docs/**/*.md', { eager: true, query: '?raw', import: 'default' })` — no database, no `content-collections` step.
- **The locale dimension is kept even though only English ships.** File naming: `guide.md` is the base-locale document, `guide.zh.md` is a translation of the same page, `guide.v2.md` is a dotted name that is not a locale tag. A locale is the dot-segment right before `.md` when it looks like a language tag (`^[a-z]{2,3}(-[A-Za-z0-9]+)?$`). A missing translation falls back to the base locale.
- The pure logic (slug, frontmatter, neighbors, search, headings) lives in `src/modules/docs/paths.ts` and is unit-tested with `node --test`; the glob-backed loader is `src/modules/docs/service.ts` (it cannot be imported under plain node, because `import.meta.glob` does not exist there).
- Frontmatter fields: `title` (required), `description`, `order`, `group`, `updated`.
- Add a language later by adding the locale to `project.inlang/settings.json`, a `messages/<locale>.json` catalog and `*.zh.md` files — no loader change needed.

### Tying an order to a record

`order.reference` carries `<kind>:<id>` when a product exists to sell one
specific record rather than a catalog item. Set it on `createCheckout()`;
on settlement, read it back as `existingOrder.reference` and fulfill
whatever that kind means. The column is general — any future product of
that shape reuses it instead of adding a table.

### User-center feature switches

Optional user pages (credits, billing, payments, API keys, tickets) are switched at Settings → Users → User Features. Defaults live in `src/config/user-features.ts` (`USER_FEATURES`; API keys off).

- Nav entries and widgets: `useUserFeatures()` from `@/hooks/use-user-features`.
- Pages: wrap the component in `<FeatureGate feature="...">` (`src/routes/settings/-feature-gate.tsx`); it redirects to `/settings`.
- API routes that must refuse while off: `await userFeatureEnabled('<name>_enabled')` from `@/server/user-features`.
- A new switch: add it to `USER_FEATURES`, a field in `modules/config/settings.ts` (`tab: 'user'`), and expose it from `/api/config/public`.
- Confirmations use `useConfirm()` (`@/hooks/use-confirm`), not `window.confirm`.

### Product events (admin user timeline)

The admin user detail page shows a timeline of everything a user did. Orders, subscriptions, credits, AI tasks and tickets appear automatically. For anything else:

- **Nothing records it yet** (paywall hit, plan picked, risk flag): register the kind in `src/config/events.ts`, then record it.
  - Server: `await recordEvent({ userId, kind, detail })` from `@/modules/events/service`. It never throws. Call it from the API route, not from another module's service, because modules don't import each other.
  - Browser: `track(kind, detail)` from `@/lib/track`, only for kinds marked `client: true`. Never mark money, risk or permission events `client`, because anyone can send those.
  - `detail` is flat: at most 10 keys of short strings, numbers or booleans. Never put secrets or personal data in it.
- **Already a row in your own table**: add a source to `src/server/admin/timeline-sources.ts` instead of recording it twice.
- Label each kind with `admin.user_detail.timeline_<kind>` in `messages/en.json`.

### Appearance (theme, font, size, sidebar)

The site's look comes from code by default: the `:root`/`.dark` palette and fonts in `src/styles/globals.css`, `DEFAULT_APPEARANCE` (sidebar variant and collapse) and `DEFAULT_COLOR_MODE` (light/dark) in `src/config/appearance.ts`. Restyle a project there.

An admin can turn on **Settings → General → Appearance** (`appearance_enabled`, off by default). Then the presets in `src/config/appearance.ts` take over: built-in color themes (the `[data-theme='<id>']` blocks in `globals.css`, applied on `<html>`), font, font size, sidebar layout and light/dark. Optionally, users may pick their own theme color from the user menu. Values are resolved in the root loader and read with `useAppearance()` from `@/hooks/use-appearance`.

- Text inside the dashboard sidebar uses `sidebar-foreground` tokens, never `foreground`/`muted-foreground`, so it stays readable on colored sidebars.
- Don't hard-code `ThemeProvider` props or `AppSidebar` `variant` / `collapsible`. They carry the admin's settings.

### shadcn/ui v4 (Base Nova)

- **No `asChild` prop.** Use `className={cn(buttonVariants())}` on Link instead.
- Add components: `npx shadcn add button card dialog` (`components.json` has `rsc: false`)
- Theme colors in `src/styles/globals.css` as CSS variables (oklch)

### Blocks vs Components

- **`src/blocks/`** — zero-config page sections. Read i18n (`m['...']()` from `@/paraglide/messages.js`), build the content config, and pass it to a component. Marketing sections are named `<name>-section.tsx` and export `<Name>Section` (`HeroSection`, `FeaturesSection`, `PricingSection`, `FaqSection`, `CtaSection`, `BlogSection`).
- **`src/components/`** — reusable UI. All content arrives via props; no i18n reads inside. Covers shadcn primitives (`components/ui/`), marketing shells (`SiteHeader`, `SiteFooter`), authenticated-app shells (`AppSidebar`, `AppLayout`), and pure primitives like `PricingTable`.
- **Rule:** a file reads translations → block. A file takes all content via props → component.
- **Pattern:** pages consume only blocks. Blocks read i18n and configure components. Components render — they don't know the app's content.
- **Naming:** `site-*` = public marketing chrome (`SiteHeader`, `SiteFooter`). `app-*` = authenticated-app chrome (`AppSidebar`, `AppLayout`). These are separate surfaces — don't merge them.

### Template Philosophy: Blocks Are Disposable, Components Are Durable

This repo ships with a default landing page (hero, features, pricing, FAQ, blog, CTA sections) so a fresh clone has something to render. **That content is demo material — it's expected to be rewritten for any real project.**

When starting a new project:

1. **Keep** `src/components/*` and `src/components/ui/*` — they're the durable primitives (`PricingTable`, `SiteHeader`, `SiteFooter`, `AppSidebar`, shadcn UI). These are the chassis.
2. **Rewrite** `src/blocks/*` — delete the demo blocks, write new ones that wire the user's real content and i18n into the primitives. Or compose fresh sections directly.
3. **Rewrite** `src/routes/index.tsx` — it's a thin composition. Recompose from the new blocks.
4. **Rewrite** the `landing.*` keys in `messages/en.json` — the translations that feed the blocks.

The `/quick-start` and `/clone-website` skills automate this workflow.

The split is not cosmetic — it's **what survives a rebrand**. Primitives survive; block content doesn't.

## Adding a New Feature

1. **Need new DB tables?** Add to `src/config/db/schema.<dialect>.ts` (and the working `schema.ts`), run `pnpm db:push`
2. **Create module service:** `src/modules/<feature>/service.ts` — pure business logic (unchanged)
3. **Create API server route:** `src/routes/api/<feature>.ts` — `createFileRoute(...)` with `server.handlers`, calling the service (unchanged)
4. **Create page:** `src/routes/settings/<feature>.tsx` (or `admin/<feature>.tsx`) — `useQuery` + `@/lib/api-client` to fetch from the API
5. **Add translations:** add `settings.<feature>.*` (or `admin.<feature>.*`) keys to `messages/en.json`
6. **Add nav entry:** update the nav array in the layout `src/routes/settings/route.tsx` (or `admin/route.tsx`)
7. **Need a static page?** Add an MDX file at `src/content/pages/<slug>.en.mdx` plus a thin route file `src/routes/(pages)/<slug>.tsx` using `staticPageRouteOptions('<slug>')` from `(pages)/-static-page.tsx`

Or use skills: `/new-module`, `/new-page`, `/new-static-page`.

## Configuration Model

Three layers, and only three:

1. **env** — the boot variables plus server runtime parameters, normalized in `src/config/index.ts` (`envConfigs`).
2. **Admin settings** — fields declared in `src/modules/config/settings.ts`, values stored in the `config` table. Database values win over env values of the same name.
3. **Code catalogs** — `src/config/pricing.ts` (price, credits, plan, CNY price), `src/config/user-features.ts` (user-center defaults), `src/config/appearance.ts` (theme defaults), `src/config/events.ts` (event kinds).

Do not add a fourth layer: no `website.ts`-style aggregate config, no brand/feature switches spread over code, env and the database at once.

### Config security baseline

Three gates, all covered by `tests/config-security.test.ts`:

1. **Public allowlist.** `GET /api/config/public` walks a hand-written list (`PUBLIC_CONFIG_KEYS` in `src/modules/config/public-keys.ts`) and `filterPublicConfigs` re-checks every key against `PROTECTED_CONFIG_KEYS` and `isSecretConfigKey()`; matches are dropped. Anything outside the list — including custom config — is never sent to the browser.
2. **Masked admin values.** `GET /api/admin/config` returns `getAdminConfigs()`: protected keys (`auth_secret`, `database_*`) are removed entirely, other secrets are masked with `••••••••` (long values keep their last 4 characters). A masked value sent back is treated as "unchanged" and skipped.
3. **Encryption at rest.** Secret settings are encrypted with AES-256-GCM before they are stored, using `CONFIG_ENCRYPTION_KEY` (SHA-256 of the key is used as the AES key). The stored format is `enc:v1:<base64(iv | authTag | ciphertext)>`; plaintext rows still decrypt, and a wrong or missing key makes the value unreadable rather than leaking it.

Additional rules:

- `assertEndpointSecretsResupplied` makes an endpoint change (OpenAI, Anthropic, R2, Telegram, notify webhook) require the matching secret to be re-entered, so a saved key can't be re-pointed at someone else's server.
- `CONFIG_ENCRYPTION_KEY` unset means secrets are stored as plaintext. Local development may leave it empty; **a production deploy must set it** — `pnpm check:deploy-env` refuses to continue without it (and without a non-placeholder `AUTH_SECRET`). It runs automatically before `pnpm cf:deploy`.
- **Boundary:** encryption protects the "database only" scenario (a leaked backup, a SQL-injection dump). The key lives in the env of the same machine, so it does not protect against a compromised application server. Say this honestly — do not oversell it.

## Security & Integrity Rules for New Features

These come from real findings. Follow them for every feature that touches money, credits, permissions, secrets, or user input:

1. **Money and credits**
   - Never trust a price, amount, credits or plan from the request; look them up in the server catalog (`src/config/pricing.ts`).
   - Charge each provider in its own currency, and never reuse a USD amount as CNY.
   - Every write that grants or takes away value goes through `atomic()` with a claim guard, so retries and concurrent webhooks act exactly once.
   - Back the claim with a database unique key (e.g. `grant_<orderNo>`) so that a status edit can't make it run twice.
   - Money states (`paid`, `refunding`, `refunded`) change only through the payment flows. Admin edit endpoints must not set them or move an order out of them.
2. **Webhooks and callbacks**
   - A valid signature only proves the provider sent the message. Also check that it is for **this** merchant/app (`app_id`, `mchid`, account) and that the amount and currency match the order before settling.
   - Make every handler idempotent.
3. **Permissions**
   - Every new admin operation gets its own permission code.
   - Actions that move money or grant privileges (refunds, credits, roles, settings) get a **dedicated** code that is listed explicitly in seeds, never reached through a wildcard such as `admin.payments.*`.
   - Code that assigns roles or permissions must reject anything beyond the caller's own permissions (`beyondCeiling` in `src/server/admin/ceiling.ts`).
4. **Secrets**
   - Store secrets through `saveConfigs` (encrypted at rest) and return them only masked.
   - If a setting is a URL that a saved secret gets sent to, add it to `ENDPOINT_SECRETS` in `src/modules/config/service.ts`. Changing the URL then requires re-entering the secret.
   - Never log or echo keys. Agent keys are hash-only and shown once.
5. **Abuse limits**
   - Rate-limit with `enforceMinIntervalRateLimit`: by IP before auth, then again with `extraKey: session.user.id` after auth. Never key on cookies.
   - Uploads: allow-list MIME types (no SVG), and cap file count, per-file size and total size.
   - A setting that becomes a `<script src>` or other executable URL needs a host allow-list taken from deployment env, not from settings. "https" alone is not trust.
6. **Accounts**
   - Don't auto-link or auto-verify identities. Keep better-auth's `requireLocalEmailVerified`.
   - Agent and service accounts are `user.type = 'api'`. Exclude them from user lists and analytics.
7. **Tests**
   - Add a test under `tests/` for any change to money, credits or permissions, including the concurrent case.

## Testing

- Tests use the **Node built-in test runner** (`node:test` + `node:assert/strict`), executed through `tsx`: `pnpm test` runs `node --import tsx --test tests/*.test.ts`.
- `pretest` runs `pnpm paraglide:compile`, so the generated `src/paraglide/` messages exist before the suite starts. On a fresh clone, run `pnpm install` first (it compiles nothing) and then `pnpm test` — the `pretest` hook covers it.
- The tests create their own temporary SQLite database and push the schema themselves; no external service is needed.
- `src/paraglide/` and `src/routeTree.gen.ts` are gitignored. `pnpm typecheck` regenerates the route tree via `pretypecheck`; `pnpm build` regenerates the Paraglide output via the Vite plugin.
- Focus areas today: admin agent API, atomic writes, config security, credits guards, docs loader, English-only policy, IndexNow, initial role, manual payments (schema, config, orders, receipts, settlement, admin), operations, payment guards and idempotency, refunds, tooling, user events and the user timeline.
- CI (`.github/workflows/ci.yaml`, on push and PR to `main`) runs on Node 22 with the pnpm version pinned in `package.json`: `pnpm install --frozen-lockfile` → `pnpm paraglide:compile` → `pnpm typecheck` → `pnpm test` → `pnpm build`. `.github/workflows/docker-build.yaml` builds the Docker image.

## Agent Skills

Project skills live in `.claude/skills/` (canonical) with cross-agent symlinks at `.agents/skills`, `.codex/skills`, and `.cursor/skills` — all four resolve to the same files (SKILL.md open standard, agentskills.io). If your agent runtime doesn't auto-discover skills, read `.claude/skills/<name>/SKILL.md` and follow it when the task matches:

| Skill               | When to use                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- |
| `quick-start`       | Build a complete SaaS project from a brief/reference URL                                |
| `clone-website`     | Clone/rebuild an existing website pixel-perfect                                         |
| `new-module`        | New backend service + API following the module pattern                                  |
| `new-page`          | New dashboard page with API wiring + nav entry                                          |
| `new-static-page`   | Static MDX page (legal, about, etc.)                                                    |
| `design-theme`      | Change colors, fonts and theme presets                                                  |
| `generate-image`    | AI-generate a decorative image for a page/block                                         |
| `security-scan`     | **Before every git commit** — secrets, vulns, ignore gaps                               |
| `deploy-cloudflare` | Deploy to Cloudflare Workers (D1 or Postgres+Hyperdrive + secrets + schema, idempotent) |

**Database backends on Cloudflare Workers** (chosen by `wrangler.jsonc` `vars.DATABASE_PROVIDER`):

- **D1** (`d1`, default) — zero external infra; binding `DB` in `d1_databases`
- **Postgres via Hyperdrive** (`postgresql`) — binding `HYPERDRIVE` in `hyperdrive`; `src/core/db/postgres.ts` reads `connectionString` from the Workers env stashed on `globalThis.__CF_ENV__` by `src/server.ts`. `vite.config.ts` reads `vars.DATABASE_PROVIDER` at build time and keeps the matching driver in the Worker bundle (the others are stubbed). Schema/RBAC/admin scripts talk to the real Postgres directly (`DATABASE_URL`), never through Hyperdrive. Setup: `npx wrangler hyperdrive create <name> --connection-string="postgres://..."`, then fill the binding in `wrangler.jsonc` (the committed template `wrangler.example.jsonc` shows the exact shape).

`wrangler.jsonc` is **not committed** — it is gitignored. Copy `wrangler.example.jsonc` and fill in the real resource IDs.

## Inlined Modules (src/core/ and src/lib/)

All functionality is self-contained — no external packages needed.

| Location                  | Key Exports                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `@/core/payment`          | `PaymentManager`, `paymentManager`, providers: Stripe, Creem, PayPal, Alipay, WeChat          |
| `@/core/email`            | `EmailManager`, `emailManager`, providers: Resend, Cloudflare                                 |
| `@/core/storage`          | `StorageManager`, `storageManager`, providers: S3, R2, local private fallback                 |
| `@/core/ai`               | `AIManager`, `aiManager`, providers: Replicate, Gemini, Fal, Kie                              |
| `@/core/notify`           | `sendTelegram`, `sendFeishu`, `sendWecom`, `sendWebhook`, `sendToChannels`                    |
| `@/core/auth/rbac`        | `matchPermission`, `matchAnyPermission`, `matchAllPermissions`, `ROLES`                       |
| `@/core/db`               | `db()` singleton, `createDb` (multi-dialect)                                                  |
| `@/core/db/atomic`        | `atomic`, `guard`, `AtomicGuardError`                                                         |
| `@/lib/hash`              | `getUuid`, `getSnowId`, `getUniSeq`, `getNonceStr`, `md5`                                     |
| `@/lib/resp`              | `respData`, `respOk`, `respErr`, `respPage`                                                   |
| `@/lib/cookie`            | `getCookie`, `setCookie`, `getCookieFromCtx`                                                  |
| `@/lib/rate-limit`        | `enforceMinIntervalRateLimit`                                                                 |
| `@/lib/cache`             | `cacheGet`, `cacheSet`, `cacheRemove`                                                         |
| `@/lib/crypto`            | `encryptSecret`, `decryptSecret`, `isEncryptedSecret`                                         |
| `@/lib/time`              | `getTimestamp`, `getIsoTimestr`, `formatDateTime`                                             |
| `@/lib/api-client`        | `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete`, `pageQuery`, `PageResult`, `ApiError` |
| `@/lib/query-client`      | `getQueryClient`, `makeQueryClient`                                                           |
| `@/lib/locale-path`       | `localizedPath` (locale-free path for server-built URLs)                                      |
| `@/lib/redirect`          | `safeInternalPath`, `resolveAfterAuthUrl`, `isAppProtocolUrl`                                 |
| `@/paraglide/messages.js` | `m` — compiled message functions (`m['ns.key']()`)                                            |
| `@/paraglide/runtime.js`  | `getLocale`, `setLocale`, `localizeHref`, `localizeUrl`, `locales`, `baseLocale`              |
| `@/core/i18n/navigation`  | `Link`, `useRouter`, `usePathname` (locale-aware)                                             |
| `@/core/i18n/dynamic`     | `tDynamic` (runtime-built message keys)                                                       |

## Database Schema

**`src/config/db/schema.ts` is gitignored** — it is the working copy generated from a template. Three dialect templates are committed to git:

- `src/config/db/schema.sqlite.ts` — SQLite (default; also used by Turso and D1)
- `src/config/db/schema.postgres.ts` — PostgreSQL
- `src/config/db/schema.mysql.ts` — MySQL

**Setup:** `pnpm db:setup` copies the template matching `DATABASE_PROVIDER` into `schema.ts`; `drizzle.config.ts` reads the dialect automatically. `postinstall` and `prebuild` run the same script, so a fresh clone and every build already have a matching working copy.

Each template exports **strong types** for all tables (`User`, `NewUser`, `Order`, `NewOrder`, …) via `$inferSelect` / `$inferInsert`. Use these in service functions instead of `any`.

**Auth:** user, session, account, verification
**Business:** order, subscription, credit, apikey, inviteCode, userInvite
**RBAC:** role, permission, rolePermission, userRole
**Content:** post, taxonomy, config
**AI:** aiTask, chat, chatMessage
**Support:** ticket, ticketMessage
**Manual payments:** manualPaymentAccount, manualPaymentDetail
**Admin & reporting:** adminExecution, userEvent, analyticsVisitor, operationsExperiment

## Environment Variables

Public, client-visible vars use the `VITE_` prefix (read via `import.meta.env` on the client). Secrets stay on `process.env` (server-only). `src/config/index.ts` exposes both isomorphically via `envConfigs`.

**Five variables boot the app:**

```env
VITE_APP_URL=http://localhost:3000
VITE_APP_NAME=Jerbix
DATABASE_PROVIDER=sqlite        # sqlite | postgres | mysql | turso | d1
DATABASE_URL=file:data/local.db
AUTH_SECRET=<openssl rand -base64 32>
```

**Commonly set, but optional:**

```env
VITE_APP_DESCRIPTION=
VITE_APP_LOGO=/logo.svg
VITE_DEFAULT_LOCALE=en
VITE_DOCS_ENABLED=false          # alternative to the admin switch
CONFIG_ENCRYPTION_KEY=           # encrypts admin-settings secrets (AES-256-GCM)
AUTH_TRUSTED_ORIGINS=            # extra origins allowed to call the auth API
AUTH_URL=                        # defaults to VITE_APP_URL
MANUAL_PAYMENTS_ENABLED=false   # alternative to the admin switch
MANUAL_PAYMENTS_SLA_HOURS=24
```

**Provider credentials live in the admin panel, not env.** Payments (Stripe/Creem/PayPal/Alipay/WeChat), OAuth (Google/GitHub/One-Tap), email (Resend), storage (R2/S3), AI (Replicate/Gemini/Fal/Kie), analytics, and the notify channels are configured at `/admin/settings` and stored in the `config` table (encrypted when `CONFIG_ENCRYPTION_KEY` is set). Resolution is `{ ...envConfigs, ...dbConfigs }` — same-named env vars still work as fallbacks, but database values win. Keep `.env.example` minimal; don't add provider keys to it.

## Critical Rules

1. **Don't import between modules** (except the documented payment→credits/subscriptions dependency)
2. **Don't import server-only modules (`@/modules/*`, `@/core/db`) from components** — use API routes, route loaders, or `createServerFn` instead
3. **Don't edit `components/ui/*` manually** — use `npx shadcn add`
4. **Don't hardcode app name** — use `envConfigs.app_name` from `@/config`
5. **Use `@/lib/api-client` + TanStack Query for client data fetching** — no raw `fetch` in components
6. **Translations live in `messages/en.json`** with flat dot keys; access via `m['ns.key']()` (add the key to the English catalog)
7. **Always verify `pnpm build` passes** after making changes
8. **Return `respData`/`respErr`** from API routes
9. **Run the `security-scan` skill before every `git commit`** — it checks for leaked secrets, injection/XSS/logic vulnerabilities in the diff, and `.gitignore`/`.dockerignore` gaps. HIGH findings block the commit.
10. **Multi-statement writes use `atomic()`, never `db().transaction()`.** The latter is not atomic on D1. See "Atomic writes".
11. **Prices live in code, not in the admin.** `src/config/pricing.ts` is the source of truth; changing a price means editing the file and redeploying. The admin UI cannot change prices.
12. **Never add a locale prefix or a `/zh` redirect.** English-only is enforced by `tests/english-only.test.ts`.

## Cloud Sandbox Notes (Cloud sandbox / e2b)

When this project runs inside a cloud sandbox (working dir like
`/home/user/sessions/<id>`), the dev server is proxied through a per-sandbox
domain: `https://<port>-<sandboxId>.e2b.app`.

- `pnpm dev` must listen on port 3000 (the default) — the preview panel
  auto-detects it.
- `vite.config.ts` already allows `.e2b.app` in `server.allowedHosts`, and
  `.env.development` ships with `AUTH_TRUSTED_ORIGINS=.e2b.app` so better-auth
  accepts sign-in/sign-up from the preview domain. Do not remove either.
- Keep `VITE_APP_URL=http://localhost:3000` — the preview proxy handles the
  external domain; changing it breaks auth redirects.
- OAuth providers (Google/GitHub) cannot complete their redirect flow on a
  sandbox preview domain; test with email+password instead.
- Use the administrator account configured for this project; do not assume
  preset credentials. After starting the dev server, share the admin console
  at `<preview-url>/admin` and sign-in page at `<preview-url>/sign-in` for
  configuring payments, login providers, email, storage, and AI in Settings.
- Browser automation is preinstalled: Playwright with Chromium
  (`playwright` CLI on PATH, browsers at `$PLAYWRIGHT_BROWSERS_PATH`). The
  clone-website skill's extraction phase should use it via Node scripts or
  `playwright screenshot` — no MCP browser tools exist here.
- After ANY change to a schema template in `src/config/db/`, immediately run
  `pnpm db:setup` and `pnpm db:push` to sync the database — never leave the
  schema and the database out of sync, and don't wait for the user to ask.
