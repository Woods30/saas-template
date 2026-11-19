---
title: Payments Overview
description: Plan declarations, the buyer flow, cancellation, refunds and the billing page
locale: en
order: 13
group: payment
updated: 2026-11-19
---

Declare your plans once in `src/config/products.ts`; the provider (Stripe or Creem) decides how
you get paid. The site stores no amounts — displayed prices and charged prices both come from
the provider's price catalog.

## Records: orders, payments and subscriptions

The database keeps purchase intent and money facts apart:

| Table | What it is | When a row is written |
|---|---|---|
| `orders` | A checkout attempt. Status describes the attempt, not whether money arrived. | Every checkout creation, for both subscriptions and one-time purchases. Renewals do not write one. |
| `payments` | A confirmed money fact. Never written by a checkout redirect or a user claim. | A provider webhook, or an admin settling a manual payment. `order_id` links back when known (nullable for historical rows). |
| `subscriptions` | A billing contract: period, renewal, cancel-at-period-end. | Subscription events from the provider or a manual-payment settlement. |
| `manual_payment_details` | Manual-payment details, 1:1 with an order (`order_id` is the primary key): amount tail, payee account, receipt and review fields. | Together with the manual order. |

A manual order writes one `orders` row (`status = open`, `provider = manual_payments`) and one
`manual_payment_details` row (`status = pending_payment`). Admin verification writes the
`payments` row and moves the order to `completed`.

## Plan configuration

Edit `getProducts()` in `src/config/products.ts` and nothing else:

```ts
{
  id: 'pro',
  name: m.pricing_pro_name(),
  description: m.pricing_pro_description(),
  features: [m.pricing_pro_feature_1()],
  recommended: true,
  prices: { monthly: 'pro_monthly', yearly: 'pro_yearly' },
  // Credits granted after a successful payment; keys match `prices`.
  credits: {
    monthly: { amount: 1000, durationDays: 31 },
    yearly: { amount: 12_000, durationDays: 366 },
  },
}
```

- `id` is the site's plan identifier.
- The keys of `prices` are **site offer IDs** (such as `monthly`); the values are **sales
  references**, interpreted by the provider:

| Provider | What the sales reference means |
|---|---|
| Stripe | The `lookup_key` of a Price |
| Creem | A site-defined reference, mapped to a `prod_*` product ID via `CREEM_PRODUCTS` |

- Empty `prices` means a free plan: the card still renders a button, but it leads to sign-up or
  the dashboard instead of checkout.
- `credits` declares how many credits each payment option grants and for how many days (omit
  `durationDays` for no expiry). Subscription renewals grant again with the same config;
  refunds claw credits back proportionally.
- `recommended` is optional; array order is display order.
- Copy is evaluated when the function runs — never call `m.*()` at module top level.

The provider is chosen in admin **Settings → Payment** (`stripe` / `creem`) and takes effect as
soon as you save — no redeploy.

## Buyer flow

1. The buyer sees the price and the buy button in the home page's `#pricing` block; that block
   sells the product and payment option named by `websiteConfig.landingOffer`. To sell several
   plans, extend the list in `src/config/products.ts` and render cards with the `Pricing`
   component in `src/blocks/pricing.tsx` (each card switches between monthly,
   yearly, and one-time), wiring `renderCta` to `startCheckout`.
2. Signed-out buyers are sent to sign-in first; after signing in they return to the pricing
   section and click buy again.
3. The client submits `productId`, `offerId`, and the return URLs; the server authenticates, rate
   limits, verifies that the return URLs are same-origin, then creates a hosted checkout session
   with the provider.
4. The browser goes to the provider's payment page; a completed payment returns to
   `/settings/billing?checkout=success`, a cancelled one returns to the page that started the
   purchase.
5. Credits are granted after the provider's webhook confirms the payment — the return page never
   grants anything.

An account keeps at most one **non-terminal** subscription (`active`, `trialing`, `past_due`,
`unpaid`, `paused`, and `incomplete` all count). A subscription scheduled to cancel at period
end still holds the slot until it ends. One-time products can be bought repeatedly and can
coexist with a subscription; they never cancel or take over an existing subscription.

## Billing page

`/settings/billing` shows:

- the current subscription: plan name, status, amount and interval, renewal or end date;
- subscription history;
- payment records: date, plan, amount, status, with partial refunds shown separately.

The "Manage subscription" button sends the user to the provider's self-service portal (change
payment method, invoices). The server resolves the customer ID from the signed-in user; the
client cannot name another customer.

The "Cancel subscription" button calls a site endpoint and **takes effect at period end**: the
user keeps access for the paid period, then renews no more. Stripe uses
`cancel_at_period_end`, Creem uses `mode: scheduled`. Manual-payment flows have no provider
subscription and do not show the button.

## Attribution

Registration writes **first-touch** attribution into nine `users` columns: the five UTM
parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`), the
referrer, country, IP and locale. Values are never overwritten afterwards — a later visit
cannot rewrite history. An empty value means "not attributed"; the funnel displays it as
`direct`. The admin overview reads these columns to group the conversion funnel.

## Admin pages

| Page | Permission | What it shows |
|---|---|---|
| `/admin/payments` | `admin` role | Confirmed payments, in four type tabs: **All / Subscription / One-time / Manual payments** (`all` is the default and is omitted from the URL). The tabs partition the data — a manual payment never shows under Subscription or One-time. |
| `/admin/subscriptions` | `admin` role | Subscription periods and statuses. |
| `/admin/manual-payments` | `admin.orders.read` / `admin.orders.write` | Review queue for manual orders. |
| `/admin` | `admin.orders.read` | KPI cards, the sign-up → checkout → paid conversion funnel (24h / 7d / 30d, grouped by UTM dimension, referrer or country; an empty value displays as `direct`), recent payments and to-dos. |

## Refunds and clawback

The admin **Payments** page (`/admin/payments`) can issue a **full refund** on a paid payment
(permission `payments.refund`, held by the `admin` role by default). The refund button is
rendered only for `stripe` and `creem` rows; manual-payment rows are refunded offline and never
show it:

1. a conditional state transition claims the payment row as `refunding`, so concurrent clicks can
   only win once;
2. the provider is called: Stripe by PaymentIntent, Creem by transaction ID (Creem only supports
   full refunds);
3. on success the row becomes `refunded` / `partially_refunded`, and the credit grant issued for
   **that payment** is clawed back;
4. a provider failure restores the previous status so the operator can retry; every success is
   written to the audit log.

Clawback stops at zero: credits already consumed never turn the balance negative, and the ledger
records the expected amount, the amount actually deducted, and the shortfall. Final settlement
comes from the provider webhook; the admin page records the refund as accepted.

Read next: [Stripe](./payment-stripe) or [Creem](./payment-creem).
