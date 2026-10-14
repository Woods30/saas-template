---
title: Analytics
description: Enabling GA / Plausible / Umami / Clarity and script injection
locale: en
order: 10
group: features
updated: 2026-10-14
---

| Provider | Required config |
|---|---|
| `ga` | `VITE_GA_ID` |
| `plausible` | `VITE_PLAUSIBLE_DOMAIN` |
| `umami` | `VITE_UMAMI_WEBSITE_ID` (or the legacy `VITE_UMAMI_ID`) + `VITE_UMAMI_SCRIPT_URL` |
| `clarity` | `VITE_CLARITY_PROJECT_ID` (or the legacy `VITE_CLARITY_ID`) |

`initAnalytics()` registers the selected adapters only in the browser and only when `analytics.enabled` is `true`.

```ts
analytics: { enabled: true, providers: ['ga', 'plausible'] },
```

> **Note**: A provider that is selected but missing its ID is neither registered nor script-injected; `track()` / `page()` are no-ops with no provider. Umami additionally requires a credential-free HTTPS script URL. This module only handles enable-filtering and script injection — it does **not** mean the collection endpoint is reachable.

## Next steps

- [Email](./email) — transactional mail and the contact form
- [Integrations Overview](./integrations) — gate semantics and endpoints for the six modules
