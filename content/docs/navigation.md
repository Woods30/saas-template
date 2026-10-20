---
title: Navigation & Menus
description: Configure the navbar, footer, and social links
locale: en
order: 3
group: config
updated: 2026-10-21
---

Every menu shares one data model and one set of render components, so filtering rules,
external-link behavior, and keyboard handling are identical across the navbar, footer, and
docs sidebar.

| File | Responsibility |
|---|---|
| `src/config/navigation.ts` | Menu types, link targets, filtering rules |
| `src/config/navbar-config.ts` | Navbar links and right-side actions |
| `src/config/footer-config.ts` | Footer groups |
| `src/config/social-config.ts` | Social platform mapping and filtering |

## Prerequisites

Read [Website Config](./configuration) first — menu entries show and hide based on module
switches.

## Setup

### Add a navbar link

Edit `src/config/navbar-config.ts`:

```ts
// src/config/navbar-config.ts
{
  kind: 'link',
  id: 'pricing',
  title: 'Pricing',
  destination: { kind: 'internal', options: getPublicLinkOptions('pricing', locale) },
  visibility: { module: 'payment' },   // hidden when payment is off
}
```

`getPublicLinkOptions()` returns type-safe `linkOptions()`. Internal links are validated by
TanStack Router — **a missing route, missing dynamic params, or an internal link written as
external is rejected at `tsc` time**.

| `target` | Resolves to |
|---|---|
| `home` | `/{locale}` |
| `docs` | `/{locale}/docs` |
| `blog` | `/{locale}/marketing/blog` |
| `changelog` | `/{locale}/marketing/changelog` |
| `pricing` | `/{locale}/pricing` |
| `contact` | `/{locale}/marketing/contact` |
| `roadmap` | `/{locale}/marketing/roadmap` |
| `waitlist` | `/{locale}/marketing/waitlist` |
| `login` | `/{locale}/auth/login` |
| `terms` / `privacy` | `/{locale}/marketing/legal/{slug}` |

### Visibility filtering

All four conditions in `visibility` must hold for an entry to render:

| Field | Meaning |
|---|---|
| `module` | Module switch, e.g. `{ module: 'payment' }` |
| `feature` | Feature switch, e.g. `{ feature: 'enableApiKeys' }` |
| `authenticated` | Whether sign-in is required |
| `roles` | Role allowlist |

> Entries pointing at `contact` **must** carry `visibility: { module: 'contact' }` — that
> page is off by default and the link would 404. `roadmap` / `waitlist` are static pages
> with no module switch and need no `visibility`.

### Entry shapes

| `kind` | Notes |
|---|---|
| `link` | Internal (`internal` + `options`) or external (`external` + `href` + `newTab`) |
| `group` | Recursive children; the group disappears when every child is filtered out |
| `separator` | Removed automatically at the start, end, or when duplicated |

All three carry `id`, optional `title` / `description` / `icon`, and `visibility`.

### Footer and social

The footer lives in `src/config/footer-config.ts` and uses the same structure. Social links
go in `social` on `src/config/website.ts`:

```ts
social: {
  github: 'https://github.com/your-org/your-repo',
  x: 'https://x.com/your-handle',
}
```

Only valid HTTPS URLs without credentials render; anything else is dropped silently.

## References

- [TanStack Router · type-safe links](https://tanstack.com/router/latest/docs/framework/react/guide/type-safety)

## Next steps

- [Website Config](./configuration) — module switches and the `social` field
- [Design System](./design-system) — visual rules for menus
- [Integrations](./integrations) — how menus change when modules turn on
