---
title: Analytics
description: Enabling tracking scripts, CSP allowlists, and business events
locale: en
order: 21
group: analytics
updated: 2026-11-19
---

The analytics module injects tracking scripts in production builds and reports page views plus
business events. You can enable several providers at once; each one reports independently.

## Steps

1. **Pick providers and enter their IDs.** Open admin **Settings → Analytics**:

   - tick one or more providers (GA / Plausible / Umami / Clarity);
   - fill in each provider's public identifier on the same tab;
   - save — it takes effect immediately, no redeploy.

   The values live in the database (`analytics.providers` and `analytics.config.*`) and are sent
   to the browser with the page.

   | Provider | Setting | Notes |
   |---|---|---|
   | `ga` | `analytics.gaId` | The Google Analytics Measurement ID (`G-…`) |
   | `plausible` | `analytics.plausibleDomain` | Your site domain |
   | `umami` | `analytics.umamiWebsiteId` + `analytics.umamiScriptUrl` | The script URL must be a credential-free HTTPS URL |
   | `clarity` | `analytics.clarityProjectId` | The Microsoft Clarity project ID |

   A provider that is selected but missing its ID is not registered and injects no script; the
   status page marks it `incomplete` and lists the missing fields.

2. **CSP follows automatically.** The allowlist is derived per request from the effective
   configuration (next section), so no code change is needed.

## CSP allowlist

Tracking scripts are external `<script>` tags injected at runtime, which the CSP nonce cannot
cover, so `script-src` must explicitly allow the matching origins (`src/lib/security.ts`):

| Provider | `script-src` origin |
|---|---|
| `ga` | `https://www.googletagmanager.com` |
| `plausible` | `https://plausible.io` |
| `clarity` | `https://www.clarity.ms` |
| `umami` | The origin of `analytics.umamiScriptUrl` (self-hosted, derived per request) |

Data reporting goes through `connect-src`, which already includes GA4's `*.google-analytics.com`
and `*.analytics.google.com` — without those two, the script loads but the events never arrive.

Tracking scripts are injected only in production builds with the module enabled, so local
development never pollutes real accounts.

## Business events

Event names are declared centrally in `src/lib/analytics/events.ts`. They are a contract with the
analytics platform's data structures, so call sites never use string literals.

| Event | Meaning | Status |
|---|---|---|
| `sign_up` | Sign-up succeeded | Reported by the sign-up flow |
| `login` | Sign-in succeeded | Reported by the sign-in flow |
| `begin_checkout` | The visitor clicked buy and started checkout | `trackBeginCheckout()` exists, no call site yet |
| `purchase` | The hosted checkout completed and the visitor returned to the site | `trackPurchase()` exists, no call site yet |

`begin_checkout` and `purchase` need you to call the matching reporting function from your own
checkout entry point and payment-success callback. Event parameters carry non-PII values only
(product ID, amount, currency, mode); emails and names stay out — analytics data lands on
third-party servers, and passing PII breaks both GDPR and the platform's terms of service.

## Verify

Tracking only initializes when **browser + production build + `analytics.enabled`** all hold;
development never reports, so local debugging cannot pollute real data. To check the injection
path locally, run the production artifact:

```bash
pnpm build && pnpm preview
```

Open a page and watch the Network panel for requests to the tracking domain.

## Notes

- Page views are reported once on first paint and once per route change by `AnalyticsProvider`.
- The CSP has no `unsafe-inline` / `unsafe-eval`; the nonce is the only path for inline scripts.

Once this works, see [Payment Overview](./payment) — the parameters for `begin_checkout` and
`purchase` come from the checkout flow.
