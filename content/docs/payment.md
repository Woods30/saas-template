---
title: Payment
description: Flat product configuration, hosted checkout, and billing management
locale: en
order: 14
group: features
updated: 2026-10-28
---

Select one provider for the site through `websiteConfig.payment.provider`. Stripe is implemented; customers do not choose a provider during checkout.

## Products and prices

Define each product once in `src/config/products.ts`, inside `getProducts()`:

```ts
{
  id: 'pro',
  name: m.pricing_pro_name(),
  description: m.pricing_pro_description(),
  features: [m.pricing_pro_feature_1()],
  recommended: true,
  prices: { monthly: 'pro_monthly', yearly: 'pro_yearly' },
}
```

Keys in `prices` are application offer IDs. Values are sales references interpreted by the selected provider: Stripe uses Price lookup keys. Create separate Stripe Products for different plans, with multiple Prices for billing variants. Amounts, currency, and actual billing intervals come from the provider and are cached for 10 minutes. An offer ID does not determine its billing interval.

Empty `prices` means free; its button opens registration or the dashboard. `recommended` is optional. Array order controls display order. No CTA, tier, or exclusivity configuration is required. Evaluate translated copy inside the function, never at module initialization.

Configuration diagnostics reject duplicate product IDs, duplicate references, and empty references. Missing prices disable purchasing instead of sending customers to registration. Cache keys include the provider and references. Stripe price changes can transfer the existing lookup key to a new Price.

## Purchase rules

The client submits only `productId` and `offerId`. The server authenticates, rate limits, checks same-origin return URLs, resolves the real price, and creates hosted Checkout. Login returns customers to pricing with their selection restored; checkout requires another explicit click.

Each account can have at most one non-terminal subscription. `active`, `trialing`, `past_due`, `unpaid`, `paused`, and `incomplete` occupy the slot. A subscription scheduled to cancel still occupies it until termination. `canceled` and `incomplete_expired` allow another purchase. Existing subscribers are directed to billing management.

A persistent reservation and stable idempotency key reuse an unfinished subscription Checkout across concurrent requests. The same offer reuses that session. A different offer returns an explicit conflict; continue the original offer or wait for expiration. Historical subscription events cannot release a newer reservation. Before releasing a reservation, the server checks the provider session and synchronizes any completed subscription; repurchase requires a terminal subscription. Local expiration alone cannot establish that no payment occurred. Provider errors retain the reservation. A lost creation response is recovered with the original request, idempotency key, and fixed expiration time.

Independent one-time products may be purchased separately and repeatedly. They never cancel or supersede subscriptions.

## Billing and management

`/dashboard/billing` shows the current subscription, price and interval, status, renewal/end date, historical subscriptions, and payment records. Partial refunds retain and display the original payment amount and cumulative refunded amount.

The server resolves the customer ID from authenticated subscription or payment ownership. One-time-only customers can also access the hosted portal. Clients cannot supply another customer's ID.

Cancellation, payment methods, and invoices use the provider portal. There is no application-owned switching, proration, scheduled downgrade, or lifetime takeover. Stripe Portal may offer plan changes when configured in the provider dashboard. Webhooks synchronize the actual price. Portal capabilities differ across providers.

## Webhooks

`/api/webhooks/stripe` preserves the raw body and verifies its signature asynchronously. The adapter produces a provider-neutral `PaymentEvent`; `src/payment/events.ts` persists it.

Handle completed and asynchronously paid Checkouts, subscription lifecycle events, paid/failed invoices, and charge refunds. Unpaid asynchronous sessions do not fulfill purchases. Subscription and invoice events retrieve the latest subscription state to resist out-of-order delivery. The success page never grants access.

Provider-scoped event IDs deduplicate processing; business transaction IDs independently prevent duplicate payments. Failures return 500 for retries. Refunds that arrive before the payment is synchronized also retry. Partial refunds do not mark the full payment refunded. Multiple invoice payments are recorded separately with their actual amounts and refund references. Subscription snapshots use version-checked writes and re-fetch provider state after a conflict. Successful payments retain operational notifications when enabled.

The return page displays a notice without emitting revenue analytics from its query parameters; revenue tracking should use verified transactions.

## Another provider

Implement `PaymentProvider` in `src/payment/types.ts`, register the adapter, add environment validation, and expose its webhook route. The adapter interprets sales references and normalizes catalog prices, subscription snapshots, and events; pages and persistence stay shared.

Creem could interpret references as Product IDs. It is not implemented in this template. Moving existing subscriptions between providers is outside scope.

## Schema changes

Review `0008_payment_simplification.sql` before applying it. It removes switching-specific fields and adds Checkout reservations. Production application requires separate authorization. No historical payment conversion or automatic database reset is provided. New instances should apply all migrations to an empty database; compatibility with existing production payment data is outside this refactor.
