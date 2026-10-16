---
title: Account center
description: The session guard on protected routes, plus the profile, security, sessions, and notifications sections
locale: en
order: 12
group: features
updated: 2026-10-15
---

The account management area behind sign-in, at `/{locale}/dashboard/*`. Reach it from
"Account settings" in the navbar user menu.

## Route structure

`dashboard.tsx` is a pathless layout route (the same technique as `docs`): it holds only the
guard and the shell, no page content, so `/dashboard` itself is not a content page.

```
src/routes/{-$locale}/_layout/dashboard.tsx              # guard + session + shell + <Outlet/>
src/routes/{-$locale}/_layout/dashboard/index.tsx        # /dashboard → redirect to profile
src/routes/{-$locale}/_layout/dashboard/profile.tsx      # Profile
src/routes/{-$locale}/_layout/dashboard/security.tsx     # Security
src/routes/{-$locale}/_layout/dashboard/sessions.tsx     # Sessions
src/routes/{-$locale}/_layout/dashboard/notifications.tsx # Notifications (needs newsletter)
```

To add a section: add a nav entry in `src/config/settings.ts`, add a page under `dashboard/`,
and add a title in `getSettingsSectionMeta`. The shell renders it automatically.

## Session guard

`beforeLoad` in `dashboard.tsx` does two things:

```ts
beforeLoad: async ({ params }) => {
  assertPageEnabled('auth')
  const session = await fetchSession()
  if (!session) {
    throw redirect({ to: '/{-$locale}/auth/login', params: { locale: params.locale } })
  }
  return { session }
}
```

`fetchSession()` (`src/auth/session.ts`) is a **server function** reading the session via
`getAuth(env).api.getSession({ headers: getRequestHeaders() })`. It has to be, because:

- the session cookie is httpOnly and unreadable from the client;
- `getAuth` needs per-request env (the D1 binding), which the client does not have.

The server function evaluates in place during SSR (no network round trip) and degrades to
one RPC on client navigation, so both paths see the real session — the same reasoning as
`fetchAuthProviderAvailability`.

The return value carries **only the fields the pages need** (`id` / `name` / `email` /
`emailVerified` / `image`) rather than the whole session. Child pages read it via
`Route.useRouteContext()`.

## The four sections

| Section | better-auth calls | Components used |
|---|---|---|
| **Profile** | `updateUser({ name })`; `sendVerificationEmail({ email, callbackURL })` when unverified | `Field` / `Input` / `Button` / `Badge` |
| **Security** | `changePassword({ currentPassword, newPassword })`, `changeEmail({ newEmail, callbackURL })`, `deleteUser()` | `Field` / `AlertDialog` |
| **Sessions** | `listSessions()`, `revokeSession({ token })`, `revokeOtherSessions()` | `Table` / `Button` / `Spinner` |
| **Notifications** | `GET` / `POST` / `DELETE` `/api/newsletter` (see [Newsletter](./newsletter)) | `Switch` / `Field` |

Conventions:

- **Destructive actions** use `AlertDialog` for confirmation, never `window.confirm`.
  Deleting the account navigates the whole page because the session is gone.
- **Status markers** use `Badge` (e.g. email verification state), not a hand-rolled
  `<span>` with a background colour.
- **Empty and loading states** use `Spinner`, not a hand-rolled placeholder.
- **Notifications** is gated entirely by the `newsletter` module: `beforeLoad` calls
  `assertPageEnabled('newsletter')`, so when the module is off the page 404s and the menu
  entry disappears too (`filterMenuItems` filters on `visibility.module`).
- The **current password** field in change-password is only checked for presence, not against
  `MIN_PASSWORD_LENGTH` — an old password may be shorter than the current floor, and
  enforcing it there would lock users out of changing their password. Only the new
  password uses the length floor.

## Sidebar

The shell (`src/components/dashboard/DashboardLayout.tsx`) **uses shadcn's `sidebar` (Base UI
variant) directly** rather than reimplementing collapse, cookie persistence, or the mobile
drawer — `SidebarProvider` and `Sidebar` already provide those, switching to a `Sheet` on
narrow screens. This file only assembles them.

It is deliberately **not shared** with the hand-built sidebar in `DocsLayout`: that one has
its own cookie and collapse semantics, and merging them would only tangle both.

The sidebar has three sections, bottom-up:

| Section | Contents |
|---|---|
| `SidebarHeader` | Site logo, links to home; white plate in dark theme (same treatment as the marketing Navbar) |
| `SidebarContent` | The section menu described above, copy from `getSettingsSections` |
| `SidebarFooter` | User card (`SettingsUserCard`): avatar + name + email, expand to sign out |

The user card is the **only** sign-out entry inside the account area — `dashboard` is a
`_layout` route that does not render the marketing Navbar, so `UserMenu` is not visible
here. The avatar comes from `SessionInfo.user.image` (the `users.image` column, written by
Google sign-in); when empty it falls back to the first letter of `name` or email.

The top bar (the `header` inside `SidebarInset`) holds three things, left to right:

1. `SidebarTrigger` — the collapse button; click to shrink the sidebar to an icon rail,
   click again to expand. Visible on every breakpoint; on narrow screens the sidebar is a
   `Sheet` drawer and needs this button to open.
2. A three-level breadcrumb — `Home › Account › Current section`. The first two levels are
   `BreadcrumbLink`s, the last is a `BreadcrumbPage` (with `aria-current="page"`).
3. `ThemeToggle` — top right. In the sidebar header it would fight the logo for space (the
   collapsed sidebar is only ~3rem wide), and the marketing Navbar already puts it there.

The top bar has **no** `<h1>`: the last breadcrumb level is already the page title, and
repeating it would surface the same word twice — once visually, once in the accessibility
tree. There is also **no** "Back to site" link — the logo is that entry point.

## Page metadata

Each child page's `head()` runs `seo()` for meta and canonical, then appends
`robots: noindex` — personal pages should not be indexed.

## References

- [Better Auth options](https://www.better-auth.com/docs/reference/options) — account fields and session settings
- [TanStack Start authentication guide](https://tanstack.com/start/latest/docs/framework/react/guide/authentication) — `beforeLoad` guards and full-page redirects

## Next steps

- [Authentication](./auth) — sign-in, sign-up, and the email flows
- [Form conventions](./forms) — the TanStack Form pattern these forms use
- [Newsletter](./newsletter) — the subscribe API behind notification preferences
