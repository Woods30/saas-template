---
title: Account Settings
description: The account area behind sign-in: profile, security, devices, and section entries
locale: en
order: 10
group: auth
updated: 2026-11-03
---

The account area behind sign-in lives at `/{locale}/settings/*` and is reachable from the user menu in the navbar. Opening it while signed out redirects to `/{locale}/auth/login`.

![Account center · Profile](/docs/screenshots/settings-profile.png "Account center · Profile: name and email, with a verification entry point when the address is unverified")

## Routes and sections

| Path | Section | What it does |
|---|---|---|
| `/settings/profile` | Profile | Change the display name, see the email verification state, resend verification when unverified |
| `/settings/security` | Security | Change the password, change the email address, delete the account |
| `/settings/sessions` | Sessions | See signed-in devices, revoke one or sign out all other devices |
| `/settings/notifications` | Notifications | Subscribe and unsubscribe from mail; needs the `newsletter` module |
| `/settings/billing` | Billing | Subscription state, renewal date, and transactions; needs the `payment` module |
| `/settings/api-keys` | API keys | Create and delete keys; needs `features.enableApiKeys`, see [API Keys](./api-keys) |
| `/admin/users` | Users | Change roles, ban, delete, impersonate; needs the `admin` role and `features.enableAdmin`, see [Users and Roles](./user-management) |
| `/admin/revenue` | Revenue | Revenue and subscription overview; same gate as Users |

`/settings` is not a page of its own — it lands on Profile.

## Session guard

The `beforeLoad` in `src/routes/{-$locale}/_layout/settings.tsx` does two things: `assertPageEnabled('auth')` confirms the auth module is on, then `fetchSession()` reads the session. Without a session it redirects to the login page.

The session cookie is httpOnly, so the client cannot read it — the session has to be read server-side:

```ts
// src/core/auth/session.ts
const session = await getAuth(env).api.getSession({ headers: getRequestHeaders() })
```

Only the fields the pages need are handed down (`id` / `name` / `email` / `emailVerified` / `image` / `role`); child pages read them with `Route.useRouteContext()`.

## Add your own section

1. Add a nav entry in `getSettingsSections()` in `src/config/settings.ts` with its `id`, title, icon, and target route.
2. Add the page file under `src/routes/{-$locale}/_layout/settings/`, with the file path matching the entry's `id`.
3. Add the section title and description in `getSettingsSectionMeta()` in the same `src/config/settings.ts` file.

The shell renders the sidebar entry and the breadcrumb from the `id`, so the layout component needs no change.

## Verify

Sign in and open `/{locale}/settings/profile`; the name and email should be there. Opening the same address while signed out sends you to the login page.
