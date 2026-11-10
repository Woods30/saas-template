---
title: Payments Overview
description: Plan declarations, the buyer flow, and the billing page
locale: en
order: 13
group: payment
updated: 2026-11-10
---

Declare your plans once in `src/config/products.ts`, then pick how you get paid: a hosted
provider (Stripe or Creem) that runs the whole checkout, or QR-code verification (a personal
QR code plus manual verification). The two paths are mutually exclusive and switched by
`VITE_CHECKOUT_MODE`. The site stores no provider prices — hosted amounts come from the
provider's price catalog, and verification amounts live in `collectionPrices` on the product.

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
- `recommended` is optional; array order is display order.
- Copy is evaluated when the function runs — never call `m.*()` at module top level.

The provider is chosen by `websiteConfig.payment.provider`, and the `VITE_PAYMENT_PROVIDER`
environment variable switches it at deploy time without touching code.

## Buyer flow

1. The buyer sees the price and the buy button in the home page's `#pricing` block; that block
   sells the product and payment option named by `websiteConfig.landingOffer`. To sell several
   plans, extend the list in `src/config/products.ts` and render cards with the `Pricing`
   component in `src/components/sections/Pricing.tsx` (each card switches between monthly,
   yearly, and one-time), wiring `renderCta` to `startCheckout`.
2. Signed-out buyers are sent to sign-in first; after signing in they return to the pricing
   section and click buy again.
3. The client submits `productId`, `offerId`, and the return URLs; the server authenticates, rate
   limits, verifies that the return URLs are same-origin, then creates a hosted checkout session
   with the provider.
4. The browser goes to the provider's payment page; a completed payment returns to
   `/dashboard/billing?checkout=success`, a cancelled one returns to the page that started the
   purchase.
5. Entitlements are written after the provider's webhook confirms them — the return page never
   grants access.

An account keeps at most one **non-terminal** subscription (`active`, `trialing`, `past_due`,
`unpaid`, `paused`, and `incomplete` all count). A subscription scheduled to cancel at period
end still holds the slot until it ends. One-time products can be bought repeatedly and can
coexist with a subscription; they never cancel or take over an existing subscription.

## Billing page

`/dashboard/billing` shows:

- the current subscription: plan name, status, amount and interval, renewal or end date;
- subscription history;
- payment records: date, plan, amount, status, with partial refunds shown separately.

The "Manage subscription" button sends the user to the provider's self-service portal (cancel
renewal, change payment method, invoices). The server resolves the customer ID from the
signed-in user; the client cannot name another customer.

Read next: [Stripe](./payment-stripe), [Creem](./payment-creem), or
[QR Code Verification](./payment-collection).
