---
title: QR Code Verification
description: Manual-verification checkout with a personal QR code
locale: en
order: 15
group: payment
updated: 2026-11-10
---

A personal Alipay QR code can take payments too: the buyer pays the exact amount shown on the
order page and declares the payment, an admin verifies the received amount in the admin console,
and only then does the system record the payment. No Stripe, no webhook, no hosted checkout —
money goes straight to your Alipay account, and the verification decision is what grants access.

This path is mutually exclusive with the hosted [Stripe](./payment-stripe) / [Creem](./payment-creem)
providers; `VITE_CHECKOUT_MODE` picks one, and only one takes new orders at a time.

## Steps

1. Declare `collectionPrices` on the product you want to sell in `src/config/products.ts`
   (the source of truth for amounts, in cents):

   ```ts
   collectionPrices: {
     once: { amount: 18_000, currency: 'cny', kind: 'one_time' },
   },
   ```

2. Configure collection accounts. Either source works, and they stack (a database row
   overrides a source account with the same `id`):
   - Source fallback: `collection.accounts` in `src/config/website.ts`;
   - Environment variable: `VITE_COLLECTION_ACCOUNTS` (a JSON array; an invalid value is
     ignored entirely and the source config applies).

   ```dotenv
   VITE_COLLECTION_ACCOUNTS=[{"id":"alipay-1","channel":"alipay","displayName":"Personal Alipay","currency":"cny","qrImageUrl":"/collection/qr.png"}]
   ```

   The QR image URL must be an in-site root path or a credential-free HTTPS URL; only Alipay
   (`channel: 'alipay'`) is supported for now.
3. Set the environment variables and enable the module:

   ```dotenv
   VITE_CHECKOUT_MODE=collection
   VITE_MODULES=collection,auth,mail
   ```

   `VITE_MODULES` is an allowlist: once you set it, list every module you need.
4. Put the QR image under `public/` at the configured path (e.g. `public/collection/qr.png`);
   for R2 hosting see [Storage](./storage) — with `BUCKET` configured, the admin console can
   upload QR codes and buyer receipts.
5. Deploy: `pnpm run deploy`.

## Buyer flow

1. Click the buy button in the `#pricing` section → the server creates an order. The payable
   amount = product price + a random cent suffix (1–99) used for manual reconciliation; active
   orders on the same account never share an amount.
2. The order page shows the exact amount, the QR code, and a 15-minute countdown. The buyer
   scans, pays the exact amount, and declares via "I've paid" or a receipt upload — a
   declaration is intent, not a confirmed arrival.
3. An admin verifies in the queue at `/dashboard/admin/orders`, comparing the observed amount
   with the payable amount. Only an exact match allows a normal approval; mismatches are flagged,
   and ones needing a refund become `requires_refund`.
4. On approval the system settles: a payment record is written, entitlements are granted, and
   the buyer's page (polling every 5 seconds) shows "settled".

An unclaimed order expires after 15 minutes and releases its cent suffix; a declared order holds
its suffix until the admin processes it, so two buyers can never pay an identical amount.

## Admin console

`/dashboard/admin/orders` requires the admin role and has two sections:

- **Verification queue**: filter by status; start from "pending verification";
- **Collection accounts**: override the display name, QR image, and enabled flag of source
  accounts with the same `id`; a disabled account falls back to the next configured one.

## Verification

- `pnpm run check:env` passes, meaning the module and account config are in place.
- After placing an order, the order page shows the exact amount and QR code; the admin console
  lists the pending-verification order.
- End-to-end acceptance for this path: `pnpm exec playwright test e2e/collection.spec.ts`.
