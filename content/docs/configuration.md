---
title: Website Config
description: Every websiteConfig field and what its switches mean
locale: en
order: 2
group: config
updated: 2026-10-21
---

`src/config/website.ts` is the single entry point for site configuration and exports the
`websiteConfig` object. Name, logo, switches, and social links all live here.

```ts
// src/config/website.ts
export function createWebsiteConfig(env: PublicEnv): WebsiteConfig {
  return {
    baseUrl: env.VITE_BASE_URL,
    metadata: { name: 'Jerbix', images: { /* … */ } },
    ui: { defaultTheme: 'system', enableThemeSwitch: true, themeColor: { /* … */ } },
    docs: { enabled: true },
    // …
  }
}
```

## Prerequisites

A working local setup, see [Getting Started](./getting-started).

## Setup

### Site identity

```ts
metadata: {
  name: 'Jerbix',                                  // site name, used in titles and OG tags
  images: {
    ogImage: '/logo.png',                          // social share image (1200×630)
    logoLight: '/logo-horizontal-transparent.svg', // light-theme wordmark
    logoDark: '/logo-horizontal-dark.svg',         // dark-theme wordmark
    icon: '/icon-jerboa.svg',                      // favicon
  },
}
```

See [Design System](./design-system#brand-logo) for how the logo is rendered.

### Template homepage marketing

```ts
template: {
  priceUsd: 99,
  productId: 'template',
  offerId: 'once',
}
```

Pricing is shown in the homepage `#pricing` section. The old `/pricing` URL redirects to that section in the current language and no longer shows the demo plan page.

The homepage uses the existing Checkout flow. `productId` / `offerId` select
`template.prices.once = 'jerbix_template'` in `src/config/products.ts`; no external sales URL
is needed. Configure that Stripe `lookup_key` with a one-time USD 99 price. The server
checks the actual amount against `priceUsd`, along with the currency and payment mode,
and rejects missing or mismatched prices.

Enable `auth.enabled` and `payment.enabled`. Guests sign in or register first, with the
return path preserved through email verification. They return to the homepage pricing
section to continue purchasing. Cancelling Checkout returns there too; successful payments
return to billing, with payment records confirmed by the existing webhook. “See how to start”
links to the current language’s docs, falling back to features when docs are disabled.

### Theme

```ts
ui: {
  defaultTheme: 'system',      // 'light' | 'dark' | 'system'
  enableThemeSwitch: true,     // show the toggle in the navbar
  themeColor: {                // browser chrome and PWA background
    light: '#FCFAFF',
    dark: '#0A0A0F',
  },
}
```

> `themeColor` must match `--background` in `styles/globals.css`. These values render
> outside the page and cannot read CSS variables, so they must be declared here.
> `tests/unit/theme-colors.test.ts` asserts equivalence — change both together.

### Module switches

Every optional module has `enabled`. When off, its pages 404, its API returns
`404 MODULE_DISABLED`, and navigation entries hide themselves.

```ts
docs: { enabled: true },
blog: { enabled: true },
changelog: { enabled: true },
mail: { enabled: false, provider: 'resend', supportEmail: '' },
contact: { enabled: false },
newsletter: { enabled: false, provider: 'resend' },
payment: { enabled: false, provider: 'stripe', /* … */ },
notification: { enabled: false, provider: 'discord' },
analytics: { enabled: false, providers: ['ga'] },
auth: { enabled: true, requireEmailVerification: false },
```

| Field | Default | Notes |
|---|---|---|
| `docs` / `blog` / `changelog` | `true` | Content modules, pages already exist |
| `mail` | `false` | Transactional email. `supportEmail` feeds a `mailto:` entry |
| `contact` | `false` | Contact form |
| `newsletter` | `false` | Email subscriptions |
| `payment` | `false` | Stripe checkout and billing page |
| `notification` | `false` | Discord / Feishu webhooks |
| `analytics` | `false` | Analytics scripts |
| `auth` | `true` | Sign-in and registration; off means the whole auth path 404s |

> `auth.requireEmailVerification` is a **security control**, not an email switch. It
> defaults to `false` so the template works without mail configured; set it to `true` once
> email is wired up. Setting it to `true` without working mail makes
> `pnpm check:env:prod` fail — requiring verification while being unable to send the
> verification email would lock every new user out.

### Feature switches

```ts
features: {
  enableI18n: true,        // zh / en
  enableFileUpload: false, // uploads (needs R2)
  enableApiKeys: true,     // self-service API keys
  enableAdmin: true,       // admin dashboard
  enableAIGateway: false,  // AI gateway
}
```

### Social links

```ts
social: {
  github: 'https://github.com/your-org/your-repo',
  x: 'https://x.com/your-handle',
}
```

Only valid HTTPS URLs without credentials are rendered. Supported platforms are listed in
the `WebsiteConfig['social']` type.

## References

- [Navigation & Menus](./navigation) — navbar, footer, docs sidebar
- [Environment](./environment) — where `baseUrl` comes from

## Next steps

- [Navigation & Menus](./navigation) — configure menu entries
- [Environment](./environment) — the `VITE_` rule
- [Design System](./design-system) — change colors and the logo


Configure plans in `src/config/products.ts` with `prices: { monthly: 'pro_monthly', yearly: 'pro_yearly' }`. References are interpreted by the selected provider; amount and billing interval come from its catalog. Empty prices means free. See [Payment](./payment).
