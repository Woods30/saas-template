---
title: Payment
description: Product config, Stripe checkout, billing page, and webhooks
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

## Products vs. payment modes

This repo separates *what is sold* from *how it is sold*, matching Stripe's model:

| This repo | Stripe | Example |
|---|---|---|
| **Product** (`productId`) | Product | Pro, Lifetime |
| **Payment mode** (`options`) | Price | Monthly, Yearly, One-time buyout |

So "Pro monthly" and "Pro yearly" are **two payment modes of the same product**, not two
plans; "Lifetime" is a different product and is naturally distinct from Pro. The pricing
page renders one card per product, with a switcher inside the card for that product's own
payment modes.

That distinction is the basis for every later decision (who supersedes whom, what counts
as the same thing).

## Product configuration

Products are configured in `src/config/products.ts`. That file is the single anchor
between "page ↔ price":

```ts
const PRODUCT_OPTIONS: Record<string, ProductOption[]> = {
  free: [], // the free tier isn't sold: its button goes to sign-up
  pro: [
    { kind: 'subscription', interval: 'month', lookupKey: 'pro_monthly' },
    { kind: 'subscription', interval: 'year', lookupKey: 'pro_yearly' },
  ],
  lifetime: [{ kind: 'one_time', interval: 'one_time', lookupKey: 'lifetime' }],
}

const PRODUCT_EXCLUSIVITY: Record<string, string[]> = {
  lifetime: ['pro'],
}
```

The config has two layers:

- The **structural layer** (`PRODUCT_OPTIONS` / `PRODUCT_EXCLUSIVITY`) is language-free,
  so diagnostics scripts, server jobs, and unit tests can read it directly.
- The **copy layer** (`getProducts()`) is evaluated at render time and follows the
  request's locale. A module-level constant would freeze the first request's language
  for every later request (in SSR that shows up as a whole page in the wrong language
  plus a hydration mismatch).

### Why `lookup_key` is not in env

`lookup_key` is a Price's stable public name. When a price changes, move the key to the
new Price (`transfer_lookup_key=true`) and neither the page nor the code changes; a new
Price ID would require a code change and a redeploy, and drifts easily from the dashboard
configuration. Stripe is explicit about this:

> If these prices are hard-coded and you want to change them, the process is often
> manual and requires you to deploy new code. To better manage these scenarios, you can
> use the `lookup_key` attribute on the Price object.
>
> — [Manage prices](https://docs.stripe.com/products-prices/manage-prices)

It **used to** live in env (`VITE_STRIPE_LOOKUP_*`) and now lives in the product config:
keeping a copy in both places guarantees drift — change one and the page shows a price
that doesn't match. And env describes the *deployment environment*, while the price
anchor describes *how this product is sold* — the latter belongs to the product config.

The lookup path:

```text
src/config/products.ts  →  lookup_key  →  Prices API (server side, cached in KV for 10 min)
                                                ├→ the amount shown on the pricing page
                                                └→ the Price id used by /api/payment
```

Stripe also recommends a caching layer for price reads ("To improve performance, you
might want to add a caching layer to only reload the price occasionally"), otherwise
every render hits the API. The cache key includes the lookup key list, so changing the
config invalidates it.

Set the `lookup_key` on each Price in the Stripe dashboard first (Products → the
Price → Advanced → Lookup key), then put the same values in `src/config/products.ts`.
When the two disagree the pricing page finds no price, and `getServiceStatuses()` reports
`incomplete`.

With no key configured, the pricing page still renders, but paid products degrade to
"sign up first" rather than a button that 502s.

## Checkout flow

1. Click a product on the pricing page → `startCheckout()` (`src/payment/checkout-client.ts`)
2. Not signed in → redirect to login with `?redirect=/pricing`, then back
3. Signed in → `POST /api/payment`: gate → session auth → rate limit (10 per IP per
   minute) → body validation → **resolve the price from the product + period**
   → **return-URL same-origin check** → **existing-subscription check**
   → create Checkout Session
4. Redirect the whole page to Stripe Checkout
5. On return, land on `/dashboard/billing?checkout=success`

The client sends `productId` + `interval`, **never a Price ID**. The server resolves the
Price from the lookup key, so the client can neither change the amount nor pick a
different Price — harder to work around than allowlisting a Price ID.

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

Pro carries two Prices: `pro_monthly` and `pro_yearly`. If only one is configured, the
card's billing-period switcher lists only the configured period — there is no "yearly"
option that would 502 on click. Lifetime is a `one_time` Price and has no billing
period to switch, so its card shows no switcher at all (a switcher with one choice is
noise).

The billing mode (subscription / one-time) is decided by the **Stripe Price itself**:
`recurring` present means subscription, absent means one-time payment. The config only
says *which period to sell*; it cannot say what the Price on Stripe actually is.

## Exclusion: buyout vs. subscription

"Exclusion" holds in exactly two cases:

1. **Within one product**: a one-time buyout supersedes the subscription — the buyout is
   the higher tier of the same thing, and keeping the subscription means charging twice
   for the same thing.
2. **Across products**, when the config explicitly declares `exclusiveWith`.

The config is the authority; the **Stripe Product** is the fallback: Prices under the
same Stripe Product are the same thing at different price points (monthly / yearly /
lifetime).

```ts
const PRODUCT_EXCLUSIVITY: Record<string, string[]> = {
  lifetime: ['pro'], // bought the lifetime tier — no point also paying monthly
  merch: [], // physical goods: explicitly not exclusive; may coexist with a subscription
}
```

The relation lives in the config because Stripe's Product structure cannot express it:
Stripe only knows "which Prices hang under which Product", not "does a buyout supersede
a subscription". **Not declaring it means coexistence** — two subscriptions on different
products running side by side is normal business, not a bug.

Exclusion is **bidirectional**: A declaring itself exclusive with B means A and B are
exclusive. Declaring only one side makes "who supersedes whom" depend on the direction
of the check — the easiest way to get this wrong.

The rules live in `src/payment/plan-state.ts` (pure functions, no side effects):

| Function | What it answers |
|---|---|
| `isSupersededByPurchase` | Does this buyout supersede that subscription? |
| `findSupersededSubscriptions` | Which subscriptions does this buyout take over? |
| `resolveProductHoldings` | Group holdings per product and find the one in force |
| `resolveCurrentPlan` | The single plan in force; `null` when several products coexist |

### One-time purchases may be many

**Uniqueness constrains subscriptions only, not one-time purchases.** Buying three
physical items is three orders — independent and each in force. Blocking the second
purchase because "you already bought one" would be wrong. So the checkout guard only
applies to `mode: 'subscription'`; one-time payments are never blocked for "already
owned".

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

The same guard also blocks a **buyout that is exclusive** with the product being
ordered: `409 ALREADY_OWNED_EXCLUSIVE_PRODUCT`.

Both layers matter: Stripe's matches on email / Customer, which changes if the user
edits their email; the app guard matches on the local `userId` and lets the pricing
page explain the 409 instead of failing inside Stripe.

Switching plans goes through Stripe Billing Portal ("Manage subscription" on the
account page), which prorates the old subscription into the new one instead of adding
a second.

Failures return 502; a 409 stays on the pricing page with a toast pointing at the existing
subscription; missing configuration or a network error falls back to the sign-up guide.

Checkout outcomes (success / cancel / duplicate) go through toasts rather than an inline
line: all three appear **after** a click or a redirect, where an inline message easily
lands outside the viewport. Success returns to the billing page (`?checkout=success`) and
cancel returns to the pricing page (`?checkout=cancelled`); both clear the query parameter
with a `replace` navigation right after showing the toast, so a reload never repeats it.

## A buyout supersedes the old subscription

After buying an exclusive product, the old subscription is **cancelled immediately with
a prorated refund**:

1. `checkout.session.completed` writes the buyout row (`payments.type = 'one_time'`)
2. Find the subscriptions that are exclusive with it and still in force
3. Cancel them on Stripe (`prorate: true, invoice_now: true`) — the prorated amount
   lands in the customer's credit balance, i.e. the unused time is refunded
4. Mark the local row `canceled`

The order matters: marking the local row "canceled" while Stripe keeps charging would
mislead the user. A failed cancel throws — the webhook returns 500 and Stripe retries, and
by then the buyout row already exists (idempotent insert), so nothing is double-counted.

**Both directions are checked**: when `checkout.session.completed` arrives first it
cancels the old subscription; when `customer.subscription.created` arrives first (Stripe
does not guarantee event order) it finds the existing exclusive buyout and stops the new
subscription right away. Otherwise you get "buyout first, subscription later, both left
standing" — the user paying twice for the same thing.

## Billing page

`/dashboard/billing` is split in two sections:

- **My plans** — one card per buyout and per subscription. The one actually in force
  carries an "Active now" badge; a subscription superseded by a buyout is still listed
  but marked as such, so the user doesn't think they are still being charged.
- **Transactions** — a table that keeps its header. The first column labels what the
  money was for (subscription charge / one-time purchase), then the date, then a status
  badge with the amount.

Two separate status vocabularies, never swapped: "My plans" uses subscription states
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

## Why not Stripe Entitlements

Stripe has an official Entitlements model: attach a feature to a product, and once a
customer buys or subscribes, Stripe maintains an Active Entitlement for that customer and
feature. It answers "**does this user have the permission**".

This repo does **not** wire it up, because the question here is not permission but
**attribution**:

- "What did the user buy" — owned by the product config and `plan-state`;
- "Which of them supersedes which" — owned by the exclusion rules;
- "Does the user have feature X" — **your own** gating logic.

Entitlements only covers the third one, which is the one a template should least impose:
feature gating is each project's own business rule, and baking it in costs more to remove
than to write. Entitlements also means an extra `entitlements` table and an extra
`entitlements.active_entitlement_summary.updated` event — a second source of truth for
something this repo already tracks. Two places to query the same fact is how they drift.

When you do need gating, query this repo's own `subscriptions` / `payments` tables and
decide on `product_id`. The semantics are clear and there is no dependency on Stripe's
feature system.

## Configuration self-check

`getServiceStatuses()` (`src/config/service-status.ts`) reports whether the payment
module is usable and additionally validates the **structural** problems of the product
config — these are not "missing fields" but "the config is wrong":

| Problem | Consequence |
|---|---|
| One `lookup_key` attached to several products | The Price → product reverse lookup is ambiguous; attribution drifts |
| `exclusiveWith` points at a product that doesn't exist | The exclusion **silently fails** — the user pays twice with no hint |

Neither misconfiguration is caught by the type system, so the self-check has to surface
them.

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
| `customer.subscription.created` / `updated` | status, price, and period; stops the subscription when an exclusive buyout exists |
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

Product attribution uses two columns:

| Column | Meaning |
|---|---|
| `product_id` | This repo's product id (`pro` / `lifetime`) — the authority for exclusion |
| `stripe_product_id` | The Stripe Product id — the fallback when no exclusion is declared |

Both tables carry these two columns. Feature gating reads `product_id` directly — there
is no separate entitlements table.

## References

- [Manage prices](https://docs.stripe.com/products-prices/manage-prices) — `lookup_key` and price display
- [Stripe API keys](https://docs.stripe.com/keys) — key types, webhook signing secrets, rotation
- [Stripe Checkout](https://docs.stripe.com/payments/checkout) — session creation and success/cancel URLs
- [Stripe Billing Portal](https://docs.stripe.com/customer-management/integrate-customer-portal) — the manage-subscription entry point

## Next steps

- [Notifications](./notifications) — operational alerts on successful payment
- [Integrations Overview](./integrations) — gate semantics and endpoints for the six modules
