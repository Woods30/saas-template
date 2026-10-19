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
   minute) → body validation → Price ID allowlist → **existing-subscription check**
   → create Checkout Session
4. Redirect the whole page to Stripe Checkout
5. On return, land on `/dashboard/billing?checkout=success`

### Monthly vs. yearly

`pro_monthly` is a single plan with two Prices: `VITE_STRIPE_PRICE_PRO_MONTHLY`
(monthly) and `VITE_STRIPE_PRICE_PRO_YEARLY` (yearly). If only one is configured, the
pricing page's billing-period switcher lists only the configured period — there is no
"yearly" option that would 502 on click. `lifetime` is a `one_time` Price and has no
billing period to switch.

### An existing subscription blocks a re-purchase

This template assumes one subscription per user: buying twice yields two live
subscriptions, both charging, while the billing page can only show one. Two layers
enforce that.

**Layer 1 — Stripe dashboard** (recommended). In the Stripe Dashboard, go to
`Settings` → `Checkout and Payment Links` → `Subscriptions` and turn on
`Limit customers to 1 subscription`. Set `Direct customers to manage their
subscription on` to `Your website` and point it at the billing page (e.g.
`https://YOUR-DOMAIN.com/dashboard/billing`).

Stripe matches on the **Customer object** (when the session carries one) or the
**email**, so it also catches Checkout links used outside your app. It treats
`active`, `past_due`, `unpaid` and `paused` as existing subscriptions. This setting
depends on the customer portal login link being enabled (`Billing` →
`Customer portal`) — disabling the login link disables the limit too.

**Layer 2 — application guard** (this repo). `mode: 'subscription'` checkouts query
the database for the **signed-in user** before creating a session and return
`409 ALREADY_SUBSCRIBED` for any of:

| Status | Why it blocks |
|---|---|
| `active` | Currently in force |
| `trialing` | A trial still occupies the slot |
| `past_due` | Payment failed but the subscription is still live — the worst moment to sell a second one |
| `unpaid` | Retries exhausted, subscription not yet over |
| `paused` | Paused; billing resumes later |

`canceled` and `incomplete_expired` do **not** block — those are over, and the user
should be able to subscribe again.

Both layers matter: Stripe's matches on email / Customer, which changes if the user
edits their email; the app guard matches on the local `userId` and lets the pricing
page explain the 409 instead of failing inside Stripe.

Switching plans goes through Stripe Billing Portal ("Manage subscription" on the
account page), which prorates the old subscription into the new one instead of adding
a second. One-time payments (Lifetime) are not affected — a buyout has no notion of
"already owned".

Failures return 502; a 409 stays on the pricing page with a pointer to manage the
existing subscription; missing configuration or a network error falls back to the
sign-up guide.

## Billing page

`/dashboard/billing` shows:

- The current subscription (plan, status, renewal date and time, amount, billing period)
- Payment history (date, amount, status)
- A "Manage subscription" button → `DELETE /api/payment` → Stripe Billing Portal
  (opens in a new tab)

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
