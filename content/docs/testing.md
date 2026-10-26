---
title: Testing
description: The three test layers, common commands, and when to add an E2E
locale: en
order: 22
group: develop
updated: 2026-10-22
---

**E2E only guards "can a user complete a task"; detailed interactions belong in component
tests.** This page covers the split and what to ask before adding a case.

## Prerequisites

`pnpm test` runs locally, see [Getting Started](./getting-started).

## Setup

### The three layers

| Layer | Scope | Location |
|---|---|---|
| Unit | Pure logic: module gates, theme parsing, locale normalization, env validation, email templates | `tests/unit/` |
| Component | Single page or component interactions: form validation, menu toggles, breakpoint layout, anchors, copy | `tests/components/` |
| E2E | Cross-page, cross-service journeys: sign-up and sign-in, account center reads and writes, module gates, key pages reachable | `e2e/` |

### What belongs in E2E

**Yes**: paths that need a real browser, real server, and real database — session cookies,
redirects, SSR and hydration, route guards, API and page working together.

**No**: element positions, overflow at breakpoints, animation toggles, hover offsets,
anchor scrolling, TOC structure, single-field validation messages, static file contents
(sitemap / robots / manifest). Component tests or build-time assertions cover these at an
order of magnitude lower cost.

Before adding an E2E, ask: "which core flow does this guard?" If you cannot answer, push it
down to a component test. Keep each spec under 10 cases and the whole suite under five
minutes. Cross-locale behavior is covered by unit tests; E2E runs the main flow in **one**
locale only.

### Current E2E baseline

| Spec | What it guards |
|---|---|
| `auth.spec.ts` | Sign-up → auto sign-in → sign-out; validation blocks submission |
| `settings.spec.ts` | Route guard, default landing, nickname written to D1, session invalid after sign-out |
| `docs.spec.ts` | `/docs` redirect, ⌘K search → navigation, sidebar preference read back from the server |
| `marketing.spec.ts` | Home renders, locale switch uses the real `/en` prefix |
| `hydration.spec.ts` | zh / en home hydrate without React or CSP errors |
| `site-config.spec.ts` | Disabled module APIs return 404 rather than a fake success |
| `payment.spec.ts` | Cannot buy twice; billing page shows plan, renewal date, and amount |

> `payment.spec.ts` needs `VITE_PAYMENT_PROVIDER` and `STRIPE_SECRET_KEY` in `.env`.
> Without them the cases **skip** rather than fail — shipping without credentials is the
> normal state. It never calls Stripe: it writes an `active` subscription into local D1
> via `scripts/e2e-seed-subscription.ts` and exercises the real API and page. The price
> anchors (`lookup_key`) live in `src/config/products.ts`, not in env.

### Two traps

- **Wait for hydration before clicking.** A click before hydration finishes fails silently
  — no error, no navigation, indistinguishable from a product bug.
- **Add randomness to concurrent sign-up emails.** `Date.now()` alone collides under
  `fullyParallel`.

## Commands

| Command | Purpose |
|---|---|
| `pnpm test` | All unit and component tests |
| `pnpm test:affected` | Only affected tests |
| `pnpm test:watch` | Watch mode |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm test:e2e:ui` | Playwright UI mode |
| `pnpm exec vitest run --project unit` | Unit tests only |
| `pnpm exec vitest run --project components` | Component tests only (jsdom) |

> `pnpm test` runs `locale:compile` first and can stall on an interactive prompt in
> non-interactive environments. In CI, run the projects separately.

## References

- [Vitest](https://vitest.dev/)
- [Playwright](https://playwright.dev/docs/intro)

## Next steps

- [Project Structure](./project-structure) — where test files live
- [Forms](./forms) — component tests around forms
- [Cloudflare](./cloudflare) — CI and automatic deployment
