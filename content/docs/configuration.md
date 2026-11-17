---
title: Site Configuration
description: websiteConfig fields explained
locale: en
order: 2
group: config
updated: 2026-11-18
---

Site configuration has two layers:

| Layer | Where | How to change it |
|---|---|---|
| **Factory values** | `src/config/website.ts` | Edit the code and deploy; they are the fallback when the database has no matching group |
| **Live configuration** | The `settings` table in the database | Save in the admin settings page — **takes effect immediately**, no deploy needed |

The live configuration = factory values + the groups in the database, merged in
`src/core/config/settings.ts`. Everything in the app reads `websiteConfig`, which always returns
the live one — call sites never need to know where it came from.

The database holds six groups, each validated on its own: a broken group only loses that group,
the rest keep working.

| Group | Contents | Admin section |
|---|---|---|
| `brand` | Site name, wordmark accent, tagline | Brand |
| `seo` | Default SEO copy + per-locale overrides | SEO |
| `social` | Social links | Social links |
| `payment` | Payment provider and switch | Payment |
| `mail` | Mail provider, switch, support email | Mail |
| `modules` | Service modules and capability switches | Modules |

**Secrets never go into the database**: payment and mail credentials stay in environment
variables; the database only holds the provider choice and public parameters.

Saving refreshes the in-process snapshot immediately; on a multi-isolate deployment the other
isolates pick it up within 30 seconds.

The field tables below list the **factory values** — what applies when the database has no
matching group.

## Site identity

| Field | Default | Purpose |
|---|---|---|
| `metadata.name` | Template's default brand | Site name in page titles, OG tags, and JSON-LD; editable in the admin "Brand" section |
| `metadata.logoAccent` | Last letter of the brand | Trailing part of the wordmark rendered in the accent color; leave empty for a single-color wordmark |
| `metadata.images.ogImage` | `/logo.png` | Social share image, 1200×630 recommended |
| `metadata.images.logoLight` / `logoDark` | `/logo-horizontal-transparent.svg` / `/logo-horizontal-dark.svg` | Horizontal logo for the light / dark theme |
| `metadata.images.icon` | Mascot icon | Site icon; it points at the mascot SVG in `public/` by default — swap in your own |
| `baseUrl` | `VITE_BASE_URL` | Site root URL, used for canonical tags, OG, and the sitemap |

## What the homepage sells

| Field | Default | Purpose |
|---|---|---|
| `landingOffer.productId` | `template` | Which product the homepage CTA points at; products are declared in `src/config/products.ts` |
| `landingOffer.offerId` | `once` | Which purchase option it uses (one-time / subscription interval) |

Config **never stores an amount**: prices live only in the payment provider's catalog, and the homepage display and checkout both read that one copy; `productId` / `offerId` must resolve to a price reference in `src/config/products.ts`.

## Theme and colors

| Field | Default | Purpose |
|---|---|---|
| `ui.defaultTheme` | `system` | Theme on first visit: `light` / `dark` / `system` |
| `ui.enableThemeSwitch` | `true` | Whether the navbar shows a theme toggle |
| `ui.themeColor.light` / `ui.themeColor.dark` | `#FCFAFF` / `#0A0A0F` | Browser chrome and PWA background in light / dark mode |

`themeColor` must match the light/dark values of `--background` in `styles/globals.css`: these values render outside the page, cannot read CSS variables, and must be declared explicitly. Change both together.

## Module switches

| Field | Default | Purpose |
|---|---|---|
| `docs.enabled` / `blog.enabled` / `changelog.enabled` | `true` | Docs site / blog / changelog; the matching pages 404 when off |
| `mail.enabled` / `mail.provider` | `true` / `resend` | Transactional email; sending channel `resend` or `cloudflare` |
| `mail.supportEmail` | Placeholder address | Support inbox behind a `mailto:` entry; independent of the `MAIL_FROM` sender address |
| `contact.enabled` | `false` | Contact form; needs the mail module configured |
| `newsletter.enabled` / `newsletter.provider` | `false` / `resend` | Email subscriptions; channel `resend` or `beehiiv` |
| `payment.enabled` / `payment.provider` | `true` / `stripe` | Checkout and the billing page; channel `stripe` or `creem` |
| `notification.enabled` / `notification.provider` | `false` / `discord` | Notifications for successful payments and contact form submissions; channel `discord` or `feishu` |
| `analytics.enabled` / `analytics.providers` | `true` / `['ga']` | Analytics scripts; `ga` / `plausible` / `umami` / `clarity` can all be on at once |
| `auth.enabled` | `true` | Sign-in and registration; off means the whole auth path 404s |
| `auth.requireEmailVerification` | `true` | New accounts must verify their email before signing in |

**Gating semantics**: with a module off, its pages and its API return 404 together (the API answers `404 MODULE_DISABLED`); with a module on but its required configuration missing, the API returns `503 SERVICE_UNAVAILABLE` while the page and the navigation entry stay visible. `getServiceStatuses()` labels each module `disabled` / `incomplete` / `configured`, `pnpm check` prints the services missing configuration, and `pnpm check:env:prod` fails outright on `incomplete`.

These switches are also the `modules` group in the database, editable in the admin "Modules" section and effective immediately. The `VITE_MODULES` / `VITE_FEATURES` whitelists still decide the **factory values** — use them to tell two deployment targets apart from one build — see [Environment Variables](./environment).

`auth.requireEmailVerification` is a **security control**, not an email switch: downstream code treats the email as an identity claim (the payment provider's `customerEmail`, `ADMIN_EMAILS`). Requiring verification while email is not configured makes `auth` report `incomplete` and the auth API return 503 — it never silently degrades to unverified sign-in.

## Static page switches

| Field | Default | Purpose |
|---|---|---|
| `pages.waitlist` | `true` | Waitlist page; turning it off removes the navbar and footer entries, 404s the page, and drops it from the sitemap |

## Standalone docs site

Besides `enabled`, `docs` has three optional fields for deploying the docs site to its own domain:

| Field | Purpose |
|---|---|
| `siteUrl` | External docs URL; when set, the "Docs" entry in the navbar and footer points there instead of the in-site `/docs` |
| `homeUrl` | Main site URL; the docs site's "Back to site" entry points here, and it is hidden when empty |
| `asHome` | This build is the docs site: the root goes to the docs home and public URLs drop the `/docs` segment |

`asHome` is normally turned on by the build environment (`VITE_DOCS_AS_HOME=true`), so the same codebase can ship both the marketing site and the docs site.

## Feature switches

`features` holds flat booleans for capabilities that are switched on by flag:

| Field | Default | Purpose |
|---|---|---|
| `enableI18n` | `true` | Multiple languages (zh / en) |
| `enableFileUpload` | `false` | File uploads, needs an R2 bucket |
| `enableApiKeys` | `true` | Self-service API keys |
| `enableAdmin` | `true` | Admin dashboard and user management |
| `enableAIGateway` | `false` | AI gateway |

Feature switches and service modules are two different things: the latter has `.enabled` plus provider fields, the former is a plain boolean, and pages and APIs are gated by `assertFeatureEnabled()` (off means 404).

## Social links

`social` maps a platform to a URL and supports `github`, `x`, `bluesky`, `mastodon`, `discord`, `youtube`, `linkedin`, `facebook`, `instagram`, `tiktok`, and `telegram`:

```ts
social: {
  github: 'https://github.com/your-org/your-repo',
  x: 'https://x.com/your-handle',
}
```

Only credential-free HTTPS URLs render; anything else is dropped silently. Social links are also the `social` group in the database, editable in the admin "Social links" section. Module and feature switches can still override the factory values with `VITE_MODULES` / `VITE_FEATURES` — see [Environment Variables](./environment).
