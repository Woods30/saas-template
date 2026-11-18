---
title: Users and Roles
description: The role column, the admin dashboard, and promoting an admin from the CLI
locale: en
order: 12
group: auth
updated: 2026-11-03
---

User management is built on Better Auth's admin plugin. Admins use the dashboard in the account center to see every user and change roles, ban, or delete them; the first admin comes from a CLI script.

## Roles

`users.role` is a plain text column (`src/core/db/schema.ts`) defaulting to `'user'`. This repo uses exactly two values:

| Value | Meaning |
|---|---|
| `user` | Regular user — only their own account center |
| `admin` | Admin — additionally sees the Administration group and the admin dashboard |

The check is an **exact match**: `assertAdminRole` accepts only `'admin'`, and rejects a signed-out or missing field outright (with a 404 rather than a 403, so the page's existence is not leaked).

## Promotion

The first admin cannot come from the UI — the dashboard itself requires an admin. Use the script:

```bash
pnpm db:admin:local  <your-email>   # local D1
pnpm db:admin:remote <your-email>   # remote D1
```

The script does one thing: `UPDATE users SET role = 'admin' WHERE email = ?`. `role` is a plain column, so writing it directly is enough; the user picks up the new role on their next session fetch. You can also edit it graphically with `pnpm db:studio:local`.

> Both commands **require an explicit target** (`--local` / `--remote`); without one the script prints usage and exits, so production is never touched by accident. The email is validated against a regex, its SQL single quotes are escaped, and the command is passed to wrangler as an argument array (never through a shell), so a malicious email cannot inject commands.

## The dashboard

`/admin/users`, with its entry under the Administration sidebar of the admin console; `/admin` is the revenue overview. Both are bound by **two** constraints: the `features.enableAdmin` flag and the `admin` role.

- **List**: queried straight from D1 on the server (`fetchAdminUsers`), with search by email, filters on role and status, and offset paging, 20 rows per page.
- **Set role**: `authClient.admin.setRole({ userId, role })`.
- **Ban**: `authClient.admin.banUser({ userId, banReason, banExpiresIn })`. `banExpiresIn` is in **seconds**; the UI takes days and converts. Leave it blank for a permanent ban. A ban takes effect **immediately**: the user is refused at sign-in (`BANNED_USER`, HTTP 403) and existing sessions are rejected too.
- **Unban**: `authClient.admin.unbanUser({ userId })`.
- **Delete**: `authClient.admin.removeUser({ userId })`, which also deletes their sessions and cannot be undone.
- **Impersonate**: `authClient.admin.impersonateUser({ userId })`, with access to that user's sessions and the ability to revoke them.

> Turning off `features.enableAdmin` makes the whole `/api/auth/admin/*` HTTP surface return 404, but **the role check is not in the route layer**: a non-admin calling the plugin endpoints gets a 403 from the plugin itself. The UI gate and the API gate are both required.

## `role` and `ADMIN_EMAILS` are two different things

`role: 'admin'` does **not** grant send permission on `/api/email`. That route uses a **double email allowlist**: both the recipient and the caller's email must appear in the `ADMIN_EMAILS` environment variable (`src/routes/api/email/$.ts`). `role` governs the dashboard, `ADMIN_EMAILS` governs the mail route, and the two are independent.

## Verify

Sign in as an admin and open `/admin/users`; the user list should be there. Turn off `features.enableAdmin` and the sidebar entry disappears while the same address returns 404.
