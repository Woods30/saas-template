---
title: Integrations Overview
description: Gate semantics, endpoints, and wiring for the service modules
locale: en
order: 9
group: features
updated: 2026-10-14
---

The six service modules (`mail` / `contact` / `newsletter` / `payment` / `notification` / `analytics`) are all off by default. Wiring a module has three parts:

1. **Switch** — `enabled` in `src/config/website.ts`;
2. **Provider registry** — `src/{mail,newsletter,notification,payment}/index.ts`, built per request in `src/server.ts` and stored in AsyncLocalStorage;
3. **Runtime gate** — `src/lib/module-access.server.ts`, enforced at the very front of the API handler.

[Authentication](./auth) is a seventh gated module, on by default. It has no provider registry — Better Auth owns its own wiring — so only steps 1 and 3 apply to it. Its mail flows do go through the `mail` module's providers; see below.

## Gate semantics

`getModuleUnavailableResponse(module)` must run before body parsing, auth, rate limiting, and provider calls.

| Condition | Response |
|---|---|
| Module `enabled` is `false` | `404 { "error": "MODULE_DISABLED" }` |
| Enabled but required config missing | `503 { "error": "SERVICE_UNAVAILABLE" }` |
| Config complete | `undefined`; the caller continues |

The response carries only a stable error code — never the missing field or a credential.

| Endpoint | Method | Module |
|---|---|---|
| `/api/contact/*` | `POST` | `contact` |
| `/api/newsletter/*` | `POST` / `DELETE` | `newsletter` |
| `/api/payment/*` | `POST` / `DELETE` | `payment` |
| `/api/email/*` | `POST` | `mail` |
| `/api/auth/*` | `GET` / `POST` | `auth` |

> **Note**: The Stripe webhook (`/api/webhooks/stripe`) is **not** gated by `payment.enabled`, so existing subscriptions keep processing valid events after the module is turned off.

Two prefixes under `/api/auth/*` are additionally bound by a **feature flag**; when it is off they
return 404 before ever reaching Better Auth (not merely a disappearing UI):

| Prefix | Flag | When off |
|---|---|---|
| `/api/auth/api-key/*` | `features.enableApiKeys` | The create / list / delete key HTTP endpoints are disabled entirely |
| `/api/auth/admin/*` | `features.enableAdmin` | The user-management HTTP endpoints are disabled entirely |

The gate lives in the route layer at `src/routes/api/auth/$.ts`. **The role check is not there**:
a non-admin calling the admin endpoints gets 403 from the plugin itself. Direct server-side
function calls (such as `auth.api.verifyApiKey`) do not go through the router and are unaffected
by either flag. See [API Keys](./api-keys) and [User Management](./user-management).

`auth` declares no **field-level** required config, so `BETTER_AUTH_SECRET` is enforced by `check:env:prod` at deploy time instead; locally Better Auth falls back to its own development secret, and failing the gate there would block local development for no gain.

It does have one **conflict rule** that yields a 503: when `auth.requireEmailVerification` is `true` and `mail` is not fully configured, `auth` reports `incomplete`. Requiring verification while the verification mail cannot be sent means no new user can ever sign in — a deployment accident, not an acceptable degradation. See [Auth mail through the mail module](#auth-mail-through-the-mail-module).

## Auth mail through the mail module

The authentication module's three mail flows (verification, password reset, welcome) are not a separate provider — they render through whichever provider `mail.enabled` selects:

```
Better Auth callback  →  src/auth/emails.ts  →  src/mail/index.ts sendMail(provider)
```

`src/auth/emails.ts` is the only bridge, and it never throws: Better Auth calls `sendVerificationEmail` / `sendResetPassword` from inside the sign-up and sign-in request, so a throwing callback would fail the sign-up itself. Failures collapse to `{ ok: false, error }` plus a `console.warn`.

The dependency is one-way and soft: with `mail.enabled: false` the auth mail silently skips. But `requireEmailVerification` does **not** follow that switch — it is an explicit security control (`auth.requireEmailVerification`), because letting an unconfigured mail provider silently permit unverified registration would let anyone claim an address they do not own. It ships `false` so the mail-less template works out of the box; **set it to `true` when you turn mail on.** The contradictory combination (verification required, mail not configured) is reported by `getServiceStatuses()` and fails `pnpm check:env:prod`. See [Authentication](./auth).

## Per-module docs

| Module | Doc |
|---|---|
| Email (with contact form) | [Email](./email) |
| Newsletter | [Newsletter](./newsletter) |
| Payment | [Payment](./payment) |
| Notifications | [Notifications](./notifications) |
| Analytics | [Analytics](./analytics) |
| Authentication | [Authentication](./auth) |

## Config status diagnostics

`getServiceStatuses({ config, publicEnv, serverEnv, bindings })` is a pure function: no network calls, no env reads, no credential echo. It returns `disabled` / `incomplete` / `configured` per module.

> **Note**: `configured` is **not** delivered / paid / collected — it only means the switch and required fields are complete. `pnpm check` prints per-module status and deploy checklists; `pnpm check:env:prod` fails outright when an enabled module is missing a field.
