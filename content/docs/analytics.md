---
title: Analytics
description: Enabling GA / Plausible / Umami / Clarity, CSP, and business events
locale: en
order: 16
group: features
updated: 2026-10-19
---

| Provider | Required config |
|---|---|
| `ga` | `VITE_GA_ID` |
| `plausible` | `VITE_PLAUSIBLE_DOMAIN` |
| `umami` | `VITE_UMAMI_WEBSITE_ID` (or the legacy `VITE_UMAMI_ID`) + `VITE_UMAMI_SCRIPT_URL` |
| `clarity` | `VITE_CLARITY_PROJECT_ID` (or the legacy `VITE_CLARITY_ID`) |

```ts
analytics: { enabled: true, providers: ['ga', 'plausible'] },
```

## Enable conditions

`initAnalytics()` registers providers and injects scripts only when **all three** hold:
the browser context, a production build, and `analytics.enabled`. Nothing is reported
from a dev server — that would pollute real account data.

To verify the injection path locally, run the production artifact:
`pnpm build && pnpm preview`.

A provider that is selected but missing its ID is neither registered nor script-injected.
Umami additionally requires a credential-free HTTPS script URL.

## CSP (important)

Analytics scripts are **external** (`<script src>`) and are created at runtime by
`injectScript()`. The CSP nonce only covers inline scripts serialized into the HTML by
the server; it cannot cover tags inserted afterwards. So `script-src` in
`src/lib/security.ts` must allow script origins explicitly:

- GA / Plausible / Clarity have fixed origins, always present in `script-src`;
- Umami is self-hosted, so its origin is derived per request from
  `VITE_UMAMI_SCRIPT_URL` (`getAnalyticsScriptOrigins()`).

With no provider enabled, `connect-src` still lists common analytics domains (for data
reporting), but `script-src` never relaxes to `unsafe-inline`.

> An earlier version put analytics origins only in `connect-src`, so every production
> analytics script was blocked by the browser. Tests only asserted `connect-src`, so
> the suite stayed green while the feature did not work.

## Business events

Page views are reported explicitly on first paint and on route change by
`AnalyticsProvider`. Business events are declared in one place,
`src/lib/analytics/events.ts`:

| Event | Fires when |
|---|---|
| `sign_up` | registration succeeds (including the "awaiting verification" branch) |
| `login` | email/password login succeeds |
| `begin_checkout` | the pricing page starts checkout, before the Stripe redirect |
| `purchase` | returning to the billing page from Stripe Checkout |

Event params carry only non-PII values (plan id, amount, currency, mode). Email and
names never enter params: raw analytics data lands with a third party, and sending PII
runs into both GDPR and the platform's own terms.

Add new events to `ANALYTICS_EVENTS` rather than writing strings at the call site —
event names are an external contract, and scattered literals produce `sign_up` /
`signup` spellings that split the reports.

## References

- [Google Analytics Measurement ID](https://support.google.com/analytics/answer/12270356?hl=en) — where to find `VITE_GA_ID`
- [Plausible tracking script](https://plausible.io/docs/plausible-script) — `VITE_PLAUSIBLE_DOMAIN` and script injection
- [Umami Collect data](https://docs.umami.is/docs/collect-data) — `VITE_UMAMI_WEBSITE_ID` and `VITE_UMAMI_SCRIPT_URL`
- [Microsoft Clarity Setup](https://learn.microsoft.com/en-us/clarity/setup-and-installation/) — where to find `VITE_CLARITY_PROJECT_ID`

## Next steps

- [Email](./email) — transactional mail and the contact form
- [Integrations Overview](./integrations) — gate semantics and endpoints for the six modules
