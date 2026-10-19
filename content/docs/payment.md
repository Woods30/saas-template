---
title: Payment
description: Stripe checkout, pricing map, billing page, and webhooks
locale: en
order: 8
group: features
updated: 2026-10-19
---

The only built-in provider is **Stripe**, but the payment path is bounded by the
`PaymentProvider` interface (`src/payment/types.ts`). Adding Creem or Waffo means
implementing that interface and registering it in `buildPaymentProviderRegistry` —
pages, API routes, and tables stay unchanged.

The provider registers only when both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
are present.

## Configuration

```ts
// src/config/website.ts
payment: {
  enabled: true,
  provider: 'stripe',
  // Derived from VITE_STRIPE_PRICE_* — not written by hand
  allowedPriceIds: collectPriceIds(buildPriceMap(env)),
  priceMap: buildPriceMap(env),
},
```

`priceMap` maps the pricing page's plan id to a Stripe Price ID:

| Env var | Plan id | Billing interval |
|---|---|---|
| `VITE_STRIPE_PRICE_PRO_MONTHLY` | `pro_monthly` | Monthly |
| `VITE_STRIPE_PRICE_PRO_YEARLY` | `pro_monthly` | Yearly |
| `VITE_STRIPE_PRICE_LIFETIME` | `lifetime` | One-time |

`allowedPriceIds` and `priceMap` are **derived from the same env** so that a Price
can never be allowlisted without also being mapped. An empty allowlist disables the
check in `/api/payment`, which is why real deployments must configure Prices —
`getServiceStatuses()` reports `incomplete` otherwise.

With no Price configured, the pricing page still renders, but paid plans degrade to
"sign up first" rather than a button that 502s.

## Checkout flow

1. Click a plan on the pricing page → `startCheckout()` (`src/payment/checkout-client.ts`)
2. Not signed in → redirect to login with `?redirect=/pricing`, then back
3. Signed in → `POST /api/payment`: gate → session auth → rate limit (10 per IP per
   minute) → body validation → Price ID allowlist → create Checkout Session
4. Redirect the whole page to Stripe Checkout
5. On return, land on `/dashboard/billing?checkout=success`

Failures return 502; missing configuration or a network error falls back to the
sign-up guide.

## Billing page

`/dashboard/billing` shows:

- The current subscription (status, renewal date, amount)
- Payment history (date, amount, status)
- A "Manage subscription" button → `DELETE /api/payment` → Stripe Billing Portal

The server looks up the caller's `customerId` from the database and never trusts a
client-supplied value, so one user cannot open another's billing portal. Both
queries hit the `userId` index.

## Webhook

Endpoint: `POST /api/webhooks/stripe`

- Failed signature → 400 (nothing written)
- Event IDs are deduped in `webhook_events`; duplicates return 200
- A business error deletes the event row and returns 500 so Stripe retries
- On success, `processedAt` is set

Handled events:

| Event | Persisted to |
|---|---|
| `checkout.session.completed` | `subscriptions` for subscriptions; `payments` for one-time |
| `invoice.paid` | `payments` (with `invoiceId` / `chargeId`) |
| `customer.subscription.created` / `updated` | status, price, and period |
| `customer.subscription.deleted` | marks `canceled` |
| `charge.refunded` | marks refunded by `chargeId` |

> **Stripe API version note**: this repo pins `stripe@23` (API `2025-09-30.clover`).
> That version moved two fields destructively, and the webhook reads the new shape:
> - `Invoice.subscription` → `Invoice.parent.subscription_details.subscription`
> - `Invoice.charge` → `Invoice.payments.data[].payment.charge`
> - `Subscription.current_period_start/end` → `Subscription.items.data[].current_period_*`
>
> Reading the old fields does not throw — the values are simply `undefined`, so
> `chargeId` stays `null` and periods become `Invalid Date`. The webhook returns 200
> while writing wrong data.

## Tables

`subscriptions` and `payments` keep **provider-neutral** column names (`provider`,
`invoiceId`, `chargeId`, not `stripeInvoiceId`). That way a second provider needs no
migration: the same semantics live in the same column, and "all payments for a user"
does not branch per provider.

## References

- [Stripe API keys](https://docs.stripe.com/keys) — key types, webhook signing secrets, rotation
- [Stripe Checkout](https://docs.stripe.com/payments/checkout) — session creation and success/cancel URLs
- [Stripe Billing Portal](https://docs.stripe.com/customer-management/integrate-customer-portal) — the manage-subscription entry point

## Next steps

- [Notifications](./notifications) — operational alerts on successful payment
- [Integrations Overview](./integrations) — gate semantics and endpoints for the six modules
