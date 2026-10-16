---
title: Website Config
description: Every websiteConfig field, its default, and switch semantics
locale: en
order: 2
group: config
updated: 2026-10-14
---

All site configuration lives in `src/config/website.ts`, which exports the `websiteConfig` object.

```ts
// src/config/website.ts
import { type PublicEnv, publicEnv } from '@/env/public'

export const websiteConfig = createWebsiteConfig(publicEnv)
```

The factory `createWebsiteConfig(env)` takes public env explicitly, so scripts and unit tests can build an independent config without relying on the module singleton.

> **Notes**
> - Language-independent values only. The config is evaluated once at module load; copy that varies by request language must call `m.*()` inside a component render or a route `head()`.
> - Public values only. The type only accepts `PublicEnv`, so a secret cannot reach the client bundle through it.

## Metadata

Image paths must be root-relative (`/logo.svg`) or protocol-relative (`//cdn/logo.svg`), or `pnpm check` reports an error.

| Field | Type | Description |
|---|---|---|
| `metadata.name` | `string` | Site name for JSON-LD, mail sender display name, and manifest |
| `metadata.images.ogImage` | `string` | Open Graph image; `seo()` expands it to an absolute URL |
| `metadata.images.logoLight` | `string` | Logo used in light theme |
| `metadata.images.logoDark` | `string` | Logo used in dark theme |
| `metadata.images.icon` | `string` | Favicon and PWA icon |

## UI

| Field | Type | Default | Description |
|---|---|---|---|
| `ui.defaultTheme` | `'light' \| 'dark' \| 'system'` | `'system'` | Theme when no `THEME` cookie is present |
| `ui.enableThemeSwitch` | `boolean` | `true` | Hide the theme toggle when `false` |

`ui.defaultTheme` is read by both SSR and the client, so the first paint does not flicker.

## Site base URL

| Field | Type | Description |
|---|---|---|
| `baseUrl` | `string` | Comes from `VITE_BASE_URL`; used for canonical, OG, sitemap, robots |

> Production must be a real HTTPS domain. `pnpm check:env:prod` rejects `localhost`, loopback addresses, `0.0.0.0`, URLs with embedded credentials, and reserved domains such as `example.com` / `.net` / `.org`.

## Content modules

`docs` / `blog` / `changelog` are **on** by default. When off, the pages return 404, drop out of the sitemap, and their menu items stop rendering.

| Field | Type | Default | Description |
|---|---|---|---|
| `docs.enabled` | `boolean` | `true` | Docs site (`/docs`) |
| `blog.enabled` | `boolean` | `true` | Blog (`/marketing/blog`) |
| `changelog.enabled` | `boolean` | `true` | Changelog (`/marketing/changelog`) |

## Service modules

The six service modules are **off** by default. Fill in the required config before enabling, or the status is `incomplete` and the API returns 503.

| Field | Type | Default | Required config |
|---|---|---|---|
| `mail.enabled` | `boolean` | `false` | See [Email](./integrations#email) |
| `mail.provider` | `'resend' \| 'cloudflare'` | `'resend'` | — |
| `mail.supportEmail` | `string` | `''` | A valid email address |
| `contact.enabled` | `boolean` | `false` | Requires `mail` to be fully configured |
| `newsletter.enabled` | `boolean` | `false` | See [Newsletter](./integrations#newsletter) |
| `newsletter.provider` | `'resend' \| 'beehiiv'` | `'resend'` | — |
| `payment.enabled` | `boolean` | `false` | See [Payment](./integrations#payment) |
| `payment.provider` | `'stripe'` | `'stripe'` | Stripe only for now |
| `payment.allowedPriceIds` | `string[]` | `[]` | At least one non-empty Price ID |
| `notification.enabled` | `boolean` | `false` | A Discord or Feishu webhook |
| `analytics.enabled` | `boolean` | `false` | See [Analytics](./integrations#analytics) |
| `analytics.providers` | `AnalyticsName[]` | `[]` | The ID for each selected provider |
| `auth.enabled` | `boolean` | `true` | See [Authentication](./auth) |
| `auth.requireEmailVerification` | `boolean` | `false` | Security control; see [Authentication](./auth). Does **not** follow `mail.enabled`. Set to `true` once mail is configured |

## Social media

`social` is `Partial<Record<SocialPlatform, string>>`. Platforms you do not configure render no placeholder at all.

Supported: `github`, `x`, `bluesky`, `mastodon`, `discord`, `youtube`, `linkedin`, `facebook`, `instagram`, `tiktok`, `telegram`.

```ts
social: {
  github: 'https://github.com/your-org/your-project',
  x: 'https://x.com/your-handle',
},
```

> Links must be **credential-free HTTPS URLs**. Items that fail are skipped silently and reported by `pnpm check` as field names (never raw values). When `mail.supportEmail` is valid, the footer also renders a `mailto:` entry.

## Feature flags

| Field | Type | Default | Description |
|---|---|---|---|
| `features.enableI18n` | `boolean` | `true` | Internationalization |
| `features.enableFileUpload` | `boolean` | `false` | File upload (depends on the storage module) |
| `features.enableApiKeys` | `boolean` | `true` | API key management |
| `features.enableAdmin` | `boolean` | `false` | Admin dashboard |
| `features.enableAIGateway` | `boolean` | `false` | AI gateway |

These flags mark capability boundaries. They do not register routes — the route files always exist. Instead they gate behaviour: with `enableApiKeys` off, `/api/auth/api-key/*` returns 404 and its menu entries stop rendering.

## Full example

```ts
// src/config/website.ts
export function createWebsiteConfig(env: PublicEnv): WebsiteConfig {
  return {
    baseUrl: env.VITE_BASE_URL,
    metadata: {
      name: 'Jerbix',
      images: {
        ogImage: '/logo.png',
        logoLight: '/logo-horizontal-transparent.svg',
        logoDark: '/logo-horizontal-transparent.svg',
        icon: '/icon-jerboa.svg',
      },
    },
    ui: { defaultTheme: 'system', enableThemeSwitch: true },
    docs: { enabled: true },
    blog: { enabled: true },
    changelog: { enabled: true },
    mail: { enabled: false, provider: 'resend', supportEmail: '' },
    contact: { enabled: false },
    newsletter: { enabled: false, provider: 'resend' },
    payment: { enabled: false, provider: 'stripe', allowedPriceIds: [] },
    notification: { enabled: false, provider: 'discord' },
    analytics: { enabled: false, providers: [] },
    auth: { enabled: true, requireEmailVerification: false },
    social: {},
    features: {
      enableI18n: true,
      enableFileUpload: false,
      enableApiKeys: true,
      enableAdmin: false,
      enableAIGateway: false,
    },
  }
}
```

## Validating the config

`getServiceStatuses()` in `src/config/service-status.ts` is a pure function that returns one of three states per module:

| State | Meaning |
|---|---|
| `disabled` | The module switch is `false` |
| `incomplete` | Enabled but missing required fields; `issues` lists field names and locations |
| `configured` | Switch and required fields are complete |

> `configured` means **the config is complete only**. It does not mean an external service is ready, mail was delivered, or a payment succeeded. Diagnostics contain field names, reasons, and locations — never credential values.

## Next steps

- [Navigation & Menus](./navigation) — how menus filter by module switch
- [Integrations](./integrations) — each service module's provider and wiring
- [Environment Variables](./environment) — the two-layer env check and the `VITE_` rule
