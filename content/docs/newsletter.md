---
title: Newsletter
description: Wiring Resend / Beehiiv subscriptions and rate limits
locale: en
order: 7
group: features
updated: 2026-10-14
---

| Provider | Required config |
|---|---|
| `resend` | `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` |
| `beehiiv` | `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID` |

`BEEHIIV_SEND_WELCOME_EMAIL` controls whether Beehiiv sends a welcome email; `'true'` / `'false'`, default `'false'`.

Subscription status is read through the KV cache (`CACHE_TTL.newsletterStatus`), and subscribe / unsubscribe invalidate the matching cache key.

```ts
newsletter: { enabled: true, provider: 'resend' },
```

> **Note**: `/api/newsletter` has its own rate limit of 5 requests per IP per minute.

## Next steps

- [Payment](./payment) — Stripe checkout and the Price allowlist
- [Analytics](./analytics) — enabling GA / Plausible / Umami / Clarity
