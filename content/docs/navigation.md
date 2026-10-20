---
title: Navigation & Menus
description: Configure the navbar, footer, docs sidebar, and social links
locale: en
order: 3
group: config
updated: 2026-10-20
---

Every menu shares one data model and one set of render components, so filtering rules, external-link behavior, and keyboard handling are identical across the navbar, footer, and docs sidebar.

| File | Responsibility |
|---|---|
| `src/config/navigation.ts` | Menu types, link targets, filtering rules |
| `src/config/navbar-config.ts` | Navbar links and right-side actions |
| `src/config/footer-config.ts` | Footer groups |
| `src/config/social-config.ts` | Social platform map and safety filter |
| `src/components/layout/MenuLink.tsx` | A single link (internal / external) |
| `src/components/layout/MenuItems.tsx` | Recursive rendering (group / separator) |

## Link targets

`getPublicLinkOptions(target, locale, hash?)` maps a logical target to a type-safe `linkOptions()`. Internal links are validated by TanStack Router's `ValidateLinkOptions`: **a missing route, a missing dynamic param, or an internal link written as external is rejected by the TypeScript check**.

| `target` | Resolves to |
|---|---|
| `home` | `/{locale}` (optionally with `hash`) |
| `docs` | `/{locale}/docs` |
| `blog` | `/{locale}/marketing/blog` |
| `changelog` | `/{locale}/marketing/changelog` |
| `pricing` | `/{locale}/pricing` |
| `contact` | `/{locale}/marketing/contact` |
| `roadmap` | `/{locale}/marketing/roadmap` |
| `waitlist` | `/{locale}/marketing/waitlist` |
| `login` | `/{locale}/auth/login` |
| `terms` | `/{locale}/marketing/legal/terms` |
| `privacy` | `/{locale}/marketing/legal/privacy` |

`contact` is gated by the `contact` module (its route `beforeLoad` throws 404), so **any menu
item pointing at it must carry `visibility: { module: 'contact' }`** — otherwise the default
config (`contact.enabled: false`) ships a link that 404s on click. `roadmap` / `waitlist` are
static pages with no module switch, so their menu items carry no `visibility`.

## Menu item types

`MenuItem` is a union of three shapes:

| `kind` | Key field | Description |
|---|---|---|
| `link` | `destination` | Internal (`internal` + `options`) or external (`external` + `href` + `newTab`) |
| `group` | `items` | Recursive children; the group disappears when all children are filtered out |
| `separator` | — | Divider; leading, trailing, and consecutive duplicates are removed |

All three carry `id` (stable identifier), optional `title` / `description` / `icon`, and optional `visibility`.

## Visibility filtering

All three `MenuVisibility` conditions must hold for an item to show:

| Field | Type | Semantics |
|---|---|---|
| `module` | `SiteModule` | Shows when that module's `enabled` is `true` |
| `authenticated` | `boolean` | Shows when it equals the current auth state |
| `roles` | `readonly string[]` | Shows when signed in and the role is in the list |

`filterMenuItems(items, ctx)` applies the rules recursively and **does not mutate its input**: it returns a new array, filtered groups leave no empty shell, and redundant `separator`s are cleaned up. Menu factories are pure functions; `MenuContext` is passed in with the current request's auth state, so processing zh → en back-to-back in one process still yields correct copy and locale params.

```ts
export type MenuContext = { config: WebsiteConfig; authenticated: boolean; role?: string }
```

> **Note**: `roles: []` means "never show" (an empty list matches no role), which is asymmetric with the three-state `authenticated` semantics. The template has no caller today; keep this in mind when extending.

## Navbar

`getNavbarLinks(locale, ctx)` returns the main links; `getNavbarActions(locale, config)` returns the two right-side actions, `login` and `primary`.

The `primary` target follows config: when `docs.enabled` is `true` it points at the docs entry in the current language, otherwise it falls back to the `#features` anchor on the home page, so users are never sent to a removed page.

Desktop and mobile render **the same data**, so the two can never disagree. Mobile supports the keyboard: `Enter` expands a group, `Escape` closes it, and focus returns to the trigger.

### The account area

The menu factories are filtered with `authenticated: false` — the navbar link list is deliberately session-independent, so SSR and the client always agree on it. The account slot is the one exception, and it is not a menu item at all: `src/components/layout/UserMenu.tsx` reads the real session through `authClient.useSession()` and renders either the guest fallback (the `login` action passed in as `guestFallback`) or the signed-in menu with the user's email and a sign-out item.

While the session is still pending, `UserMenu` renders the guest fallback rather than a skeleton — a skeleton would leave the server HTML with no sign-in link at all, and the link would pop in after hydration. See [Authentication](./auth).

## Docs sidebar

The docs sidebar does not use the menu model above. `src/lib/docs.ts` resolves `content/docs/` for the current language and passes the result to `DocsSidebar`.

The sidebar supports two levels: documents are grouped by the `group` frontmatter field, and the order of groups is decided by **the smallest `order` inside each group**, so there is no separate `groupOrder` field to keep in sync.

| Frontmatter field | Purpose |
|---|---|
| `order` | Sorts within a group, and decides group order |
| `group` | Group name; leave empty to list at the sidebar top level |

Docs slugs are language-independent (see `contentSlug()`): both `getting-started.md` and `getting-started.zh.md` yield `getting-started`. So the URL stays stable across a language switch, and one URL hits the right translation in both languages instead of 404ing.

## Social links

`social-config.ts` maps the 11 platforms in `websiteConfig.social` to menu items with Tabler icons.

- Unconfigured platforms render **no placeholder** and never produce an iconless entry;
- Non-HTTPS or credential-bearing links are skipped and reported by `pnpm check` as field names;
- External links set `newTab: true`, and `MenuLink` adds `rel="noopener noreferrer"`;
- When `mail.supportEmail` is a valid email, an extra `mailto:` support entry is rendered.

## Next steps

- [Website Config](./configuration) — how module switches affect menu visibility
- [Integrations](./integrations) — how each service module is wired
