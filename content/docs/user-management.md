---
title: Users and Roles
description: The role column, the admin dashboard, and promoting an admin from the CLI
locale: en
order: 12
group: auth
updated: 2026-11-19
---

User management is built on Better Auth's admin plugin. Admins use the dashboard in the account center to see every user and change roles, ban, or delete them; the first admin comes from a CLI script.

## Roles and permissions

What a user may do comes from **RBAC**, not from the `users.role` column: the `roles`, `permissions`,
`role_permissions` and `user_roles` tables in `src/core/db/schema.ts`. Built-in roles:

| Role | Permissions |
|---|---|
| `super_admin` | `*` — everything |
| `admin` | Every permission point except editing the role matrix |
| `editor` | Content and support tickets |
| `viewer` | Every `*.read` permission point |

Entering the management console needs **any `admin.*` permission point** — so `editor` and `viewer`
get in too, and each page still checks its own permission point on the server. Users without one get
a 404 rather than a 403, so the page's existence is not leaked.

`users.role` is a plain text column (`src/core/db/schema.ts`) defaulting to `'user'` that RBAC keeps in
sync: `assignRolesToUser` writes `'admin'` when the user holds any `admin.*` permission, `'user'`
otherwise. It is a **coarse marker**, used by Better Auth's admin plugin and the top-bar menu; it is
not the authorization source of truth.

## Promotion

The first admin cannot come from the UI — the dashboard itself requires an admin. Use the script:

```bash
pnpm db:admin:local  <your-email>   # local D1
pnpm db:admin:remote <your-email>   # remote D1
```

The script does one thing: `UPDATE users SET role = 'admin' WHERE email = ?`. `role` is a plain column, so writing it directly is enough; the user picks up the new role on their next session fetch. You can also edit it graphically with `pnpm db:studio:local`.

> Both commands **require an explicit target** (`--local` / `--remote`); without one the script prints usage and exits, so production is never touched by accident. The email is validated against a regex, its SQL single quotes are escaped, and the command is passed to wrangler as an argument array (never through a shell), so a malicious email cannot inject commands.

## The dashboard

`/admin/users`, with its entry under the Administration sidebar of the admin console; `/admin` is the revenue overview. Both need any `admin.*` permission point; the pages themselves check `admin.users.read` / `admin.users.write`.

- **List**: queried straight from D1 on the server (`fetchAdminUsers`), with search by email, filters on role and status, and offset paging, 20 rows per page.
- **Set role**: `authClient.admin.setRole({ userId, role })`.
- **Ban**: `authClient.admin.banUser({ userId, banReason, banExpiresIn })`. `banExpiresIn` is in **seconds**; the UI takes days and converts. Leave it blank for a permanent ban. A ban takes effect **immediately**: the user is refused at sign-in (`BANNED_USER`, HTTP 403) and existing sessions are rejected too.
- **Unban**: `authClient.admin.unbanUser({ userId })`.
- **Delete**: `authClient.admin.removeUser({ userId })`, which also deletes their sessions and cannot be undone.
- **Impersonate**: `authClient.admin.impersonateUser({ userId })`, with access to that user's sessions and the ability to revoke them.

> The `/api/auth/admin/*` endpoints are the plugin's own, and the plugin authorizes on `users.role`.
> Because that column is the coarse marker above, a read-only `viewer` also carries `'admin'` there —
> so `src/routes/api/auth/$.ts` re-checks a **permission point** before letting a request through
> (`admin.users.read` for the read endpoints, `admin.users.write` for everything else, including any
> endpoint the plugin adds later). `stop-impersonating` is exempt: the impersonated user has to be able
> to end the impersonation themselves.

## `role` and `ADMIN_EMAILS` are two different things

`role: 'admin'` does **not** grant send permission on `/api/email`. That route uses a **double email allowlist**: both the recipient and the caller's email must appear in the `ADMIN_EMAILS` environment variable (`src/routes/api/email/$.ts`). `role` governs the dashboard, `ADMIN_EMAILS` governs the mail route, and the two are independent.

## Verify

Sign in as an admin and open `/admin/users`; the user list should be there. Remove the account's
`admin.users.read` permission (Roles page, or the RBAC tables) and the sidebar entry disappears while
the same address returns 404.
