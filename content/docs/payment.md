---
title: Payment
description: Stripe checkout, pricing map, billing page, and webhooks
locale: en
order: 14
group: features
updated: 2026-10-22
---

The only built-in provider is **Stripe**, but the payment path is bounded by the
`PaymentProvider` interface (`src/payment/types.ts`). Adding Creem or Waffo means
implementing that interface and registering it in `buildPaymentProviderRegistry` —
the **checkout and portal pages, API routes, and tables stay unchanged**.

The **webhook handling is not part of that interface**, though: the persistence logic
(`handleCheckoutCompleted` / `handleInvoicePaid` / `handleSubscriptionUpsert`) lives in
the Stripe-specific `src/routes/api/webhooks/stripe.ts`. A second provider needs its own
webhook route, and that persistence logic should be factored out per provider.

The provider registers with `STRIPE_SECRET_KEY` alone. `STRIPE_WEBHOOK_SECRET` is only
needed for **signature verification** — listing prices and creating a Checkout Session
don't use it. The webhook endpoint guards both variables on its own.

## Prices come from Stripe, not from constants

The amounts on the pricing page are **not** constants in the code — they are the
current values of the Stripe Prices, read at runtime. Stripe is explicit about this:

> If these prices are hard-coded and you want to change them, the process is often
> manual and requires you to deploy new code. To better manage these scenarios, you can
> use the `lookup_key` attribute on the Price object.
>
> — [Manage prices](https://docs.stripe.com/products-prices/manage-prices)

So this project anchors "price ↔ page" on the Price's `lookup_key`:

- **The env holds keys, not Price IDs.** When a price changes, move the key to the new
  Price (`transfer_lookup_key=true`); neither the page nor the code changes. A new
  Price ID would require a code change and a redeploy.
- **The displayed price and the charged price are the same Price.** The page shows
  $9.90 and Stripe charges $9.90 — there is no second copy of the number to keep in
  sync by hand.
- **Checkout sends a plan id + interval, never a Price ID.** The server resolves the
  Price from the key, so the client can neither change the amount nor pick a different
  Price — harder to work around than allowlisting a Price ID.

The lookup path:

```text
VITE_STRIPE_LOOKUP_*  →  lookup_key  →  Prices API (server side, cached in KV for 10 min)
                                            ├→ the amount shown on the pricing page
                                            └→ the Price id used by /api/payment
```

Stripe also recommends a caching layer for price reads ("To improve performance, you
might want to add a caching layer to only reload the price occasionally"), otherwise
every render hits the API. The cache key includes the lookup key list, so changing the
env invalidates it.

## Configuration

```ts
// src/config/website.ts
payment: {
  enabled: true,
  provider: 'stripe',
  // Derived from VITE_STRIPE_LOOKUP_* — not written by hand
  lookupKeyMap: buildLookupKeyMap(env),
},
```

`lookupKeyMap` maps the pricing page's plan id to a Price's `lookup_key`:

| Env var | Plan id | Billing interval | Price `lookup_key` |
|---|---|---|---|
| `VITE_STRIPE_LOOKUP_PRO_MONTHLY` | `pro_monthly` | Monthly | `pro_monthly` |
| `VITE_STRIPE_LOOKUP_PRO_YEARLY` | `pro_monthly` | Yearly | `pro_yearly` |
| `VITE_STRIPE_LOOKUP_LIFETIME` | `lifetime` | One-time | `lifetime` |

Set the `lookup_key` on each Price in the Stripe dashboard first (Products → the
Price → Advanced → Lookup key), then put the same values in `.env`. When the two
disagree the pricing page finds no price, and `getServiceStatuses()` reports
`incomplete`.

With no key configured, the pricing page still renders, but paid plans degrade to
"sign up first" rather than a button that 502s.

## Checkout flow

1. Click a plan on the pricing page → `startCheckout()` (`src/payment/checkout-client.ts`)
2. Not signed in → redirect to login with `?redirect=/pricing`, then back
3. Signed in → `POST /api/payment`: gate → session auth → rate limit (10 per IP per
   minute) → body validation → **resolve the price from the lookup key**
   → **return-URL same-origin check** → **existing-subscription check**
   → create Checkout Session
4. Redirect the whole page to Stripe Checkout
5. On return, land on `/dashboard/billing?checkout=success`

### Return URLs must be same-origin

The client-supplied `successUrl` / `cancelUrl` (and the portal's `returnUrl`) are
handed to Stripe **verbatim** — that is where Stripe sends the customer once payment
completes. Not validating them means the client decides where the user lands after
paying, which is an open redirect: an attacker can drop the victim on a lookalike page
after checkout and keep harvesting credentials.

The server therefore gates them through `safeSameOriginUrl` (`src/lib/urls.ts`), which
accepts only **absolute URLs on the site's own origin** — the origin must equal
`VITE_BASE_URL`'s origin. Relative paths are rejected too: Stripe resolves them against
the domain configured on its own account, which this app does not control.

The allowlist comes **only from configuration**. The request's own origin is
deliberately excluded: `request.url`'s host comes from the `Host` header, which the
client controls. An attacker can send `Host: evil.com` to make an off-site URL pass
validation, then share the resulting Checkout link — the victim pays on Stripe and
lands on a phishing page. Any additional domain has to be configured explicitly; it
cannot come from a request header.

`safeInternalPath` in the same module handles a different kind of input (in-site
relative paths such as the post-login redirect). The two are not interchangeable.

### Monthly vs. yearly

`pro_monthly` is a single plan with two Prices: `VITE_STRIPE_LOOKUP_PRO_MONTHLY`
(monthly) and `VITE_STRIPE_LOOKUP_PRO_YEARLY` (yearly). If only one is configured, the
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

Failures return 502; a 409 stays on the pricing page with a toast pointing at the existing
subscription; missing configuration or a network error falls back to the sign-up guide.

Checkout outcomes (success / cancel / duplicate) go through toasts rather than an inline
line: all three appear **after** a click or a redirect, where an inline message easily
lands outside the viewport. Success returns to the billing page (`?checkout=success`) and
cancel returns to the pricing page (`?checkout=cancelled`); both clear the query parameter
with a `replace` navigation right after showing the toast, so a reload never repeats it.

## Billing page

`/dashboard/billing` is split in two sections:

- **Current plan** — one card per subscription, not a table row. Plan name (mapped from
  the Price id), status, price with billing period, and the exact next renewal time all
  read in a single glance, with the manage action on the card itself. This data normally
  has one row per page, so a four-column table has no information-density win.
- **Transactions** — a table that keeps its header. The first column labels what the
  money was for (subscription charge / one-time purchase), then the date, then a status
  badge with the amount.

Two separate status vocabularies, never swapped: "Current plan" uses subscription states
(active / past due / trialing / cancelled), while "Transactions" uses payment states
(paid / refunded). Their value sets differ — `payments.status` is only `paid` or
`refunded`, so reusing subscription wording would render every payment as "Active".

Same for the billing period: only `one_time` shows "Lifetime". `checkout.session.completed`
inserts the subscription row before `interval` is populated, and the period only arrives
with `customer.subscription.created`; while it is empty the card shows just the amount,
with no period at all. This page briefly rendered "Period syncing" there, but that is a
backend webhook-timing detail a user can neither read nor act on.

A "Manage subscription" button → `DELETE /api/payment` → Stripe Billing Portal
(opens in a new tab).

The server looks up the caller's `customerId` from the database and never trusts a
client-supplied value, so one user cannot open another's billing portal. Both queries
hit the `userId` index.

## Where the free-tier button goes

The free tier has no Price, so its button branches on **session state**:

| State | Destination |
|---|---|
| Signed out | `/auth/register`, carrying `?plan=free` |
| Signed in | `/dashboard` (which itself redirects to `/dashboard/profile`) |

A signed-in user clicking "Start for free" used to be sent all the way to the register
page — they already have an account, so registering again only produces an "email
already registered" error. The session is read in the route's `loader` via
`fetchSession()` (a server function), not the client-side `useSession()`: the latter is
pending on the SSR's first frame, so the button would render "Start for free" and then
flip to "Go to dashboard" after hydration.

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

### Local development

**Stripe webhooks do not reach localhost on their own.** Without forwarding, the payment
succeeds on Stripe's side but the local `webhook_events` / `payments` tables stay empty —
so the billing page shows neither payment records nor subscription info. This is the
easiest trap to fall into: the charge went through, yet the page acts like nothing
happened.

Forward events to localhost with the Stripe CLI:

```bash
# 1. Log in (once)
stripe login

# 2. Forward to the local webhook endpoint
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

`stripe listen` prints a **Signing secret** (`whsec_...`) and then "Ready! You are now
listening for events". Put the former in `.env`:

```
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
```

Restart the dev server afterwards — Vite does not hot-reload env changes.

That `whsec_` is **not** the endpoint secret generated in the Stripe Dashboard — mixing
the two makes every signature check fail (400, nothing written).

**The CLI must be v1.43.3 or newer** (currently v1.54.1). Older builds hang forever
on `Getting ready...`: they speak a WebSocket subscription protocol Stripe has since
retired, so no event is ever forwarded. The symptom is misleading — payment succeeds,
the page confirms it, yet nothing lands in the local database and the CLI shows no
requests at all. Upgrade fixes it:

```bash
brew upgrade stripe
```

**Watch the CLI terminal, not the Stripe Dashboard.** `stripe listen` forwards over its
own channel; the events do **not** appear in a Dashboard webhook endpoint's event list.
They only show up there if you configured a separate endpoint — and that endpoint's
requests cannot reach `localhost` either.

Enable these event types, in the Dashboard or via the CLI:

| Event type | Why |
|---|---|
| `checkout.session.completed` | creates the subscription row / one-time payment row |
| `customer.subscription.created` | fills in price and billing period |
| `customer.subscription.updated` | status changes (cancel-at-period-end, …) |
| `customer.subscription.deleted` | marks `canceled` |
| `invoice.paid` | writes the transaction row (with `invoiceId` / `chargeId`) |
| `charge.refunded` | marks the refund |

The CLI forwards every event by default; `--events` narrows it down:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,charge.refunded
```

### Event order is not guaranteed

Stripe states it explicitly: *"Stripe doesn't guarantee the delivery of events in the
order that they're generated."* `customer.subscription.created` can easily arrive before
`checkout.session.completed`.

Every handler must therefore cope with the target row not existing yet:

- `customer.subscription.created` / `updated`: when the row is missing, rebuild it from
  `metadata.userId`. That metadata comes from the `subscription_data.metadata` written
  **explicitly** when the session was created — Stripe does **not** copy a Checkout
  Session's metadata onto the Subscription (the subscription's metadata is empty in
  practice). Without writing it, the subscription has no way to know whose it is.
- `invoice.paid`: when the owner cannot be resolved, **throw** instead of writing an
  orphan row with `user_id = NULL`. `payments.user_id` is nullable, so such a row is
  silently invisible on the user's own billing page — money quietly lost. Throwing
  deletes the event row and returns 500, and by the time Stripe retries, the
  subscription row usually exists.

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
