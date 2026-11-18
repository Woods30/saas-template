---
title: Stripe
description: Stripe products, checkout, and webhook setup
locale: en
order: 14
group: payment
updated: 2026-11-03
---

Amounts, subscriptions, and the payment page all live on Stripe's side; the site only declares
plans and keeps a `lookup_key`.

## Steps

1. Create products and prices in the Stripe dashboard. A subscription needs a recurring price, a
   one-time purchase needs a one-time price. **Give every price a `lookup_key`** whose value
   matches the right-hand side of `prices` in `src/config/products.ts` (`pro_monthly`,
   `pro_yearly`, and so on).
2. In admin **Settings → Payment**, pick the `stripe` provider and enter the secret key and the
   webhook secret in the Stripe group. Both are encrypted at rest and shown masked; saving takes
   effect immediately.
3. In Stripe Dashboard → Developers → Webhooks, add the endpoint
   `<your-site-domain>/api/webhooks/stripe` and put its signing secret back into the webhook
   secret field in the admin.
4. Tick the events listed below on that endpoint.

## Required events

Miss one and the corresponding record never gets written.

| Event | Purpose |
|---|---|
| `checkout.session.completed` | Checkout context; one-time payment ownership travels here |
| `checkout.session.async_payment_succeeded` | Actual settlement for delayed payment methods |
| `customer.subscription.created` / `updated` / `deleted` | Subscription lifecycle |
| `invoice.paid` | **The authoritative payment-success event** |
| `invoice.payment_failed` | Failed charge, never grants access |
| `charge.refunded` | Refunds |

`invoice.paid` is the authoritative source: Stripe does not guarantee event order, and an
endpoint may deliver only `invoice.*` events, so payment records must not depend on
`checkout.session.completed` alone. One-time payments also create an invoice, with ownership
written into the invoice metadata so a standalone invoice event can still locate the user.

The endpoint returns 503 when `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is missing, 400 for
an invalid signature, and 500 when processing fails — Stripe retries the latter.

## Where buyers go

- Payment: the buy button in the home page's `#pricing` section → the server creates a Checkout
  Session → the browser goes to Stripe's hosted payment page → a completed payment returns to
  `/settings/billing`.
- Management: the "Manage subscription" button on the billing page → Stripe Customer Portal, where
  payment methods and invoices live. Whether the portal offers plan
  switching is decided by your Stripe dashboard configuration.
- Cancellation: the in-app "Cancel subscription" button calls
  `subscriptions.update(id, { cancel_at_period_end: true })`, so it **takes effect at period
  end** and the current period stays usable.
- Refunds: the admin orders page refunds by PaymentIntent
  (`refunds.create({ payment_intent })` with an idempotency key); `charge.refunded` reconciles
  the row afterwards.

## Price catalog and price changes

Displayed prices come from Stripe Prices, looked up in batches by `lookup_key` and restricted to
`active` prices. The result is cached server-side for 60 seconds; the cache key includes the
provider and the reference set, so changing env invalidates it automatically.

Changing a price needs no code change: create a new price in the Stripe dashboard and move the
`lookup_key` over to it (deactivate the old one). Neither the pages nor the code change.

## Verify

- After saving in the admin, `payment` reports `configured` in the service status.
- The Webhooks page in Stripe Dashboard shows deliveries to your endpoint (`200` means the
  signature verified).
