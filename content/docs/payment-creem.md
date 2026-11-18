---
title: Creem
description: Creem product mapping, sandbox testing, and webhook setup
locale: en
order: 15
group: payment
updated: 2026-11-03
---

Creem is a Merchant of Record: it collects in its own name and handles tax and refunds, so the
site receives net settlements. Both subscriptions and one-time payments are supported.

## Steps

1. Create products in the Creem dashboard: recurring products for subscriptions (one per
   interval) and one-time products for lifetime purchases.
2. In admin **Settings → Payment**, pick the `creem` provider and enter the API key, the webhook
   secret, and the product map in the Creem group:

   ```text
   pro_monthly=prod_xxx,pro_yearly=prod_yyy,lifetime=prod_zzz
   ```

   The left side of the map is the reference on the right-hand side of `prices` in
   `src/config/products.ts`; the right side is the Creem product ID (`prod_*`). Separate entries
   with commas, and map each reference to exactly one product ID. Secrets are encrypted at rest;
   saving takes effect immediately.

3. In the Creem dashboard add the webhook endpoint `<your-site-domain>/api/webhooks/creem`, enter
   the same signing secret, and subscribe to the events below.

The endpoint only responds while Creem is the active provider: when the site runs a different
channel it answers 404, and Creem stops retrying.

## Events

| Event | Purpose |
|---|---|
| `checkout.completed` | Checkout finished; one-time orders are recorded here |
| `subscription.paid` | **The authoritative subscription payment event**, sent for the first payment and every renewal |
| `subscription.*` | Subscription lifecycle; `scheduled_cancel` normalizes to active with cancel-at-period-end |

The `creem-signature` header is the HMAC-SHA256 hex digest of the raw request body; an invalid
signature returns 400. Ownership travels in the checkout `metadata.userId` / `productId` /
`offerId`, and subscription metadata wins when present. If both are missing, the write fails and
Creem retries — a payment is never attributed to a guessed user.

## Sandbox testing

With `CREEM_DEBUG=true` requests go to the sandbox at `test-api.creem.io` (production is
`api.creem.io`). Test with a sandbox API key (starting with `creem_test_`) and sandbox product
IDs; before launch set it back to `false` and switch to production keys and product IDs.

## Differences from Stripe

| Dimension | Creem | Stripe |
|---|---|---|
| Products and prices | The product is the price; there is no lookup key and checkout takes `product_id` | Prices and products are separate objects, linked by `lookup_key` |
| Fetching prices | One `GET /v1/products/{id}` per reference | Prices are queried in batches by lookup key |
| Cancel redirect | No `cancel_url`; cancelling lands on Creem's own page | Has `cancel_url`, returning to the page that started the purchase |
| Amounts | Pre-tax; the checkout page adds tax, so the displayed price may differ from the charged total | Displayed price equals the charged amount |
| Subscription status | `expired` is recorded as `past_due` (still recoverable); unknown statuses become `incomplete`, withholding access for now | Status is taken from Stripe as-is |
| Cancellation | `POST /v1/subscriptions/{id}/cancel` with `mode: scheduled` takes effect at period end | `cancel_at_period_end: true` |
| Refunds | The admin orders page refunds via `POST /v1/refunds` by transaction ID; **full refunds only** | The admin orders page refunds by PaymentIntent, partial refunds supported |

Existing subscriptions do not migrate when you switch providers: switching means changing the
merchant of record, so handle the existing subscribers yourself.

## Verify

- After saving in the admin, `payment` reports `configured` in the service status.
- The Creem dashboard's webhook log shows deliveries from your site (`200` means the signature
  verified).
