---
title: Payment
description: Stripe checkout, Price allowlist, and webhooks
locale: en
order: 8
group: features
updated: 2026-10-15
---

Only **Stripe** is supported today. The provider registers only when both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are present.

`allowedPriceIds` is a server-side allowlist: when non-empty, `/api/payment` rejects a `priceId` not in the list; when empty, no allowlist check runs.

```ts
payment: {
  enabled: true,
  provider: 'stripe',
  allowedPriceIds: [env.VITE_STRIPE_PRICE_PRO_MONTHLY ?? ''].filter(Boolean),
},
```

Checkout (`POST /api/payment`): gate → session auth → rate limit (10 per IP per minute) → body validation → Price ID allowlist → create Checkout Session. Failures return 502.

> **Note**: The webhook is idempotent and replay-safe — a failed signature returns 400 without writing; event IDs are deduped in the `webhook_events` table, so duplicates return 200; a business error returns 500 so Stripe retries. Fill in real Price IDs for production; the sample content does not mean your product has commercial plans configured.

## References

- [Stripe API keys](https://docs.stripe.com/keys) — key types, webhook signing secrets, rotation

## Next steps

- [Notifications](./notifications) — wiring Discord / Feishu webhooks
- [Integrations Overview](./integrations) — gate semantics and endpoints for the six modules
