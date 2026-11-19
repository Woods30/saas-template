---
title: Navigation
description: Navbar, footer, and socials
locale: en
order: 3
group: config
updated: 2026-11-03
---

The navbar, the footer, and the docs sidebar share one menu data model: the same structure and
the same filtering rules, so a change lands in all three.

| File | Responsibility |
|---|---|
| `src/config/navigation.ts` | Menu types, link targets, filtering rules |
| `src/config/navbar-config.ts` | Navbar links and right-side buttons |
| `src/config/footer-config.ts` | Footer groups |
| `src/config/social-config.ts` | Social platform mapping and safety filter |

## Add a navbar link

Edit `src/config/navbar-config.ts` and add an entry to the array in `getNavbarLinks()`:

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

Internal links go through `getPublicLinkOptions(target, locale)`, which returns type-safe
`linkOptions()`: a missing route or a missing dynamic parameter is rejected at `tsc` time.

| `target` | Resolves to |
|---|---|
| `home` | `/{locale}` |
| `docs` | `/{locale}/docs` |
| `blog` | `/{locale}/marketing/blog` |
| `changelog` | `/{locale}/marketing/changelog` |
| `pricing` | The homepage (`getPublicLinkOptions('home', locale, 'pricing')` is the variant that adds the anchor) |
| `contact` | `/{locale}/marketing/contact` |
| `roadmap` | `/{locale}/marketing/roadmap` |
| `waitlist` | `/{locale}/marketing/waitlist` |
| `login` | `/{locale}/auth/login` |
| `terms` / `privacy` | `/{locale}/marketing/legal/{slug}` |

The locale segment in these routes is optional (`{-$locale}`), so URLs in the default language carry no prefix.

## Visibility rules

Every condition in `visibility` must hold for an entry to render:

| Field | Meaning |
|---|---|
| `module` | Module switch, e.g. `{ module: 'payment' }` |
| `page` | Static page switch, e.g. `{ page: 'waitlist' }` |
| `authenticated` | Whether sign-in is required |
| `roles` | Role allowlist, e.g. `{ roles: ['admin'] }` |

Entries pointing at `contact` **must** carry `visibility: { module: 'contact' }` — that page is
off by default and the link would 404. `roadmap` is an unconditional static page; `waitlist` has
no module switch and is filtered by `pages.waitlist`.

## The two shapes of a menu entry

| `kind` | Notes |
|---|---|
| `link` | Internal (`destination: { kind: 'internal', options }`) or external (`destination: { kind: 'external', href, newTab }`) |
| `group` | Recursive children; the group disappears when every child is filtered out |
| `separator` | Removed automatically at the start, end, or when duplicated |

Links in the `social` field are validated as credential-free HTTPS URLs; the `href` of a custom
menu entry is not validated, so do not put an address carrying a token there.

## Footer and social links

The footer lives in `src/config/footer-config.ts` and uses the same structure: `getFooterLinks()`
returns two groups (product, resources), filtered by `visibility` just like the navbar.

Social links go in the `social` field of `src/config/website.ts`:

```ts
social: {
  github: 'https://github.com/your-org/your-repo',
  x: 'https://x.com/your-handle',
}
```

`src/config/social-config.ts` maps each platform to an icon and label and renders only
credential-free HTTPS URLs; anything else is dropped silently. A valid `mail.supportEmail` adds
a `mailto:` entry.
