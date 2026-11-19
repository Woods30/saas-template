---
title: Project Structure
description: What each directory owns, and where to make changes
locale: en
order: 22
group: develop
updated: 2026-11-19
---

This page is a map. When you cannot find something, look here first, then read the code.

## Directory map

| Path | What it owns |
|---|---|
| `src/routes/` | File routes; `{-$locale}` prefix is optional, `_layout/` groups by layout |
| `src/routes/api/` | API endpoints: `contact/`, `auth/`, `payment/`, `newsletter/`, `email/`, `webhooks/` |
| `src/config/` | Site config: `website.ts` (switches), `products.ts` (plans), `navbar-config.ts`, `footer-config.ts`, `navigation.ts`, `settings.ts`, `social-config.ts` |
| `src/components/ui/` | shadcn (Base UI) upstream originals, **never edited locally** |
| `src/components/layout/` | Logo, locale switcher, menu items, user menu |
| `src/blocks/` | Page blocks and marketing assembly: `landing-*` home sections, generic blocks (Hero / Features / Pricing / FAQ…), the `landing-page.tsx` composition, `header` / `footer` / `marketing-layout`; kebab-case files, PascalCase exports, no barrel |
| `src/components/docs/` | Docs layout, sidebar, search, table of contents |
| `src/components/dashboard/` | Dashboard shell and user card |
| `src/components/auth/` | Form pieces: field adapter, submit button, hydration hook |
| `src/core/auth/` | Auth config, sessions, email verification |
| `src/core/db/` | Drizzle schema (two hand-written dialects + a generated entry) and migrations |
| `src/core/config/` | Site configuration: group shapes, merge rules, reads and cache |
| `src/core/env/` | Two-layer env validation: `public.ts` and `server.ts` |
| `src/lib/` | Pure logic: locale, SEO, module gates, rate limiting, theme parsing |
| `src/locale/` | Paraglide output and locale middleware |
| `src/core/cache/` `src/core/storage/` `src/core/email/` `src/modules/newsletter/` `src/core/notify/` `src/core/payment/` | Service modules: provider registry plus an abstract interface |
| `src/modules/subscriptions/` | Checkout, money facts (`payments`) and billing contracts (`subscriptions`), refunds, plus admin querying, revenue and the conversion funnel |
| `src/modules/manual-payments/` | Manual verification: the order + `manual_payment_details` pair, collection accounts, and the admin review flow |
| `src/styles/` | `globals.css` (design tokens), `mdx.css` |
| `src/hooks/` | Hooks reused across pages |
| `src/server.ts` / `src/router.tsx` | Server entry (CSP nonce, env injection) / router instance |

Repository root:

| Path | What it owns |
|---|---|
| `content/` | Docs / blog / changelog / legal; Chinese copies get a `.zh` suffix |
| `messages/` | UI copy in `zh.json` / `en.json` |
| `public/` | Static assets, including `public/docs/screenshots/` |
| `scripts/` | Build and validation scripts: `db-setup.ts` generates the schema, `db-seed.ts` writes the seed |
| `tests/` | Unit / component / workers tests |
| `e2e/` | Playwright specs |

## Where to change things

| Want to change | Go to |
|---|---|
| Site name, SEO, module and feature switches | The admin settings page (stored in the database); the factory values live in `src/config/website.ts` |
| Plans and purchase options | `src/config/products.ts` |
| Navbar and footer links | `src/config/navbar-config.ts`, `src/config/footer-config.ts` |
| Menu item shapes and visibility rules | `src/config/navigation.ts` |
| Dashboard sections | `src/config/settings.ts` |
| Social links | `src/config/social-config.ts` |
| Button labels, headings, hints | `messages/zh.json`, `messages/en.json` |
| Home / about / pricing copy | The route component, e.g. `src/routes/{-$locale}/index.tsx` |
| Colors, fonts, radii, shadows | `src/styles/globals.css` |
| Docs content | `content/docs/*.md` |
| Database table | Edit both `src/core/db/schema.sqlite.ts` and `schema.postgres.ts`, then `pnpm db:setup` |
| Payment records, refunds, admin payments page | `src/modules/subscriptions/` (`orders` / `payments` / `subscriptions`) |
| Manual verification flow and collecting accounts | `src/modules/manual-payments/` |
| Add a page | Create a file under `src/routes/`; the router picks it up |
| Add an API route | `src/routes/api/<name>/$.ts` |
| Add a UI control | `pnpm dlx shadcn@latest add <component> -y`, which lands in `src/components/ui/` |
| Add a service module | Mirror `src/core/email/`: `types.ts` + `provider/` + `index.ts` |

## Generated files

`src/routeTree.gen.ts` (router plugin), `src/locale/paraglide/**` (`pnpm locale:compile`), and `.content-collections/generated/**` (`pnpm content:build`) are rewritten at build time, so manual edits are overwritten.

See [Design System](./design-system) for colors and fonts, and [Form Conventions](./forms) for new forms.
