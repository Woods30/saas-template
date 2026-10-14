---
title: Integrations Overview
description: Gate semantics, endpoints, and wiring for the six service modules
locale: en
order: 5
group: features
updated: 2026-10-14
---

The six service modules (`mail` / `contact` / `newsletter` / `payment` / `notification` / `analytics`) are all off by default. Wiring a module has three parts:

1. **Switch** — `enabled` in `src/config/website.ts`;
2. **Provider registry** — `src/{mail,newsletter,notification,payment}/index.ts`, built per request in `src/server.ts` and stored in AsyncLocalStorage;
3. **Runtime gate** — `src/lib/module-access.server.ts`, enforced at the very front of the API handler.

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

> **Note**: The Stripe webhook (`/api/webhooks/stripe`) is **not** gated by `payment.enabled`, so existing subscriptions keep processing valid events after the module is turned off.

## Per-module docs

| Module | Doc |
|---|---|
| Email (with contact form) | [Email](./email) |
| Newsletter | [Newsletter](./newsletter) |
| Payment | [Payment](./payment) |
| Notifications | [Notifications](./notifications) |
| Analytics | [Analytics](./analytics) |

## Config status diagnostics

`getServiceStatuses({ config, publicEnv, serverEnv, bindings })` is a pure function: no network calls, no env reads, no credential echo. It returns `disabled` / `incomplete` / `configured` per module.

> **Note**: `configured` is **not** delivered / paid / collected — it only means the switch and required fields are complete. `pnpm check` prints per-module status and deploy checklists; `pnpm check:env:prod` fails outright when an enabled module is missing a field.
