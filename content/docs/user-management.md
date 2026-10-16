---
title: User Management
description: Admin roles, CLI promotion, and the admin dashboard
locale: en
order: 19
group: features
updated: 2026-10-16
---

User management is built on better-auth's admin plugin. Admins use the dashboard to view every
user and change roles, ban, or delete them; the first admin comes from a CLI script.

## Roles

`users.role` is a plain text column (`src/db/schema.ts`) defaulting to `'user'`. This template
uses exactly two values:

| Value | Meaning |
| --- | --- |
| `user` | Regular user — only their own dashboard |
| `admin` | Admin — additionally sees the Administration group and the admin dashboard |

The check is an **exact match**: `assertAdminRole` accepts only `'admin'`, with no case folding
or prefix matching, and rejects `undefined` (signed out or missing field) outright. The plugin's
`adminRoles` keeps its default `['admin']`, matching this, so no `options` are needed.

## Promotion: the CLI

The first admin cannot come from the UI — the dashboard itself requires an admin. Use the script:

```bash
pnpm db:admin:local  you@example.com   # local D1
pnpm db:admin:remote you@example.com   # remote D1
```

The script does one thing: `UPDATE users SET role = 'admin' WHERE email = ?`. `role` is a plain
column, so writing it directly is enough; the user picks up the new role on their next session
fetch. You can also edit it graphically with `pnpm db:studio:local`.

> **Notes**: both commands **require an explicit target** (`--local` / `--remote`); without it
> the script prints usage and exits, so production is never touched by accident. The email is
> validated against a regex, its SQL single quotes escaped, and the command is passed to
> wrangler as an argument array (never through a shell), so a malicious email cannot inject
> commands.

## The dashboard

`/dashboard/admin/users` (`src/routes/{-$locale}/_layout/dashboard/admin/users.tsx`). Its entry
sits in the Administration group of the dashboard sidebar and is bound by **both** the
`features.enableAdmin` flag and the role — it is visible and reachable only when both hold.

- **List**: `authClient.admin.listUsers({ query: { limit, offset, searchValue, searchField: 'email' } })`
  → `{ users, total, limit, offset }`. Twenty per page, paged with offset/limit.
- **Search**: by email, debounced 300 ms, resetting to the first page.
- **Set role**: `authClient.admin.setRole({ userId, role })`.
- **Ban**: `authClient.admin.banUser({ userId, banReason, banExpiresIn })`. `banExpiresIn` is in
  **seconds**; the UI takes days and converts. Leave it blank for a permanent ban.
- **Unban**: `authClient.admin.unbanUser({ userId })`.
- **Delete**: `authClient.admin.removeUser({ userId })`.

A ban takes effect **immediately**: the user is refused at sign-in (`BANNED_USER`, HTTP 403) and
existing sessions are rejected too. Unbanning restores access.

> **Notes**: the dashboard's three gates must agree — sidebar visibility (`visibility` in
> `src/config/settings.ts`), the page gate (`assertFeatureEnabled` + `assertAdminRole` in
> `beforeLoad`), and the API gate (the flag check for the `/api/auth/admin/*` prefix in
> `src/routes/api/auth/$.ts`). Turning `features.enableAdmin` off makes that whole HTTP surface
> return 404, but **the role check is not in the route layer**: a non-admin calling the plugin
> endpoints gets 403 from the plugin itself, so the UI gate and the API gate are both required.
>
> Deleting a user also deletes their sessions, and cannot be undone; the dashboard guards it
> with a confirmation dialog.

## `role` and `ADMIN_EMAILS` are two different things

`role: 'admin'` does **not** grant send permission on `/api/email`. That route uses a **double
email allowlist**: both the recipient and the caller's email must appear in the `ADMIN_EMAILS`
environment variable (`src/routes/api/email/$.ts`). The two mechanisms are independent — `role`
governs the dashboard, `ADMIN_EMAILS` governs the mail route. If you want an admin to send
mail, list their address in `ADMIN_EMAILS` as well.

## References

- [better-auth Admin plugin](https://www.better-auth.com/docs/plugins/admin) — roles, banning, impersonation, and the permission model
- [better-auth Access Control](https://www.better-auth.com/docs/concepts/access-control) — custom roles and permissions

## Next steps

- [Authentication](./auth) — sessions and the email/password path
- [Configuration](./configuration) — the `features.enableAdmin` flag
