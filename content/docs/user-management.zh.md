---
title: 用户与管理员
description: 角色字段、管理台入口与命令行提权
locale: zh
order: 12
group: auth
updated: 2026-11-19
---

用户管理基于 Better Auth 的 admin 插件。管理员在个人中心的管理台查看全部用户、改角色、
封禁与删除；第一个管理员由命令行产生。

## 角色

能做什么由 **RBAC** 决定，而不是 `users.role` 列：`src/core/db/schema.ts` 里的 `roles`、`permissions`、
`role_permissions`、`user_roles` 四张表。内置角色：

| 角色 | 权限 |
|---|---|
| `super_admin` | `*`，全部 |
| `admin` | 除「改角色权限矩阵」外的全部权限点 |
| `editor` | 内容与客服工单 |
| `viewer` | 全部 `*.read` 权限点 |

进管理台要求持有**任意 `admin.*` 权限点**——`editor` 与 `viewer` 也进得来，页面内再按各自的
权限点校验。没有权限的人拿到 404 而不是 403，不泄漏这个页面存在。

`users.role` 是普通文本列（`src/core/db/schema.ts`），默认 `'user'`，由 RBAC 同步维护：
`assignRolesToUser` 在用户持有任意 `admin.*` 权限时写 `'admin'`，否则写 `'user'`。它是**粗粒度
标记**，供 Better Auth 的 admin 插件与顶栏菜单使用，不是授权依据。

## 提权

第一个管理员无法由 UI 产生——管理台本身要 admin 才能进。用脚本：

```bash
pnpm db:admin:local  <your-email>   # 本地 D1
pnpm db:admin:remote <your-email>   # 线上 D1
```

脚本只做一件事：`UPDATE users SET role = 'admin' WHERE email = ?`。`role` 是普通列，直接改库即可，
用户下次取会话时带上新角色。也可以用 `pnpm db:studio:local` 在图形界面里改。

> 两个命令都**必须显式指定目标库**（`--local` / `--remote`），缺参数时脚本打印用法并退出，
> 避免误改生产。邮箱先经正则校验、再转义 SQL 单引号，命令以参数数组传给 wrangler（不经 shell），
> 恶意邮箱无法注入命令。

## 管理台

`/admin/users`，入口在个人中心侧边栏的「管理」分组；`/admin` 是营收总览。
两者都要求持有**任意 `admin.*` 权限点**；页面内再按 `admin.users.read` / `admin.users.write` 校验。

- **列表**：服务端直接查 D1（`fetchAdminUsers`），支持按邮箱搜索、按角色与状态筛选、offset 翻页，
  每页 20 条。
- **改角色**：`authClient.admin.setRole({ userId, role })`。
- **封禁**：`authClient.admin.banUser({ userId, banReason, banExpiresIn })`。`banExpiresIn` 的单位是
  **秒**，界面上按天输入后换算；留空即永久。封禁**立即生效**：被禁用户登录被拒
  （`BANNED_USER`，HTTP 403），已有会话也失效。
- **解封**：`authClient.admin.unbanUser({ userId })`。
- **删除**：`authClient.admin.removeUser({ userId })`，连带删掉其会话，不可撤销。
- **模拟登录**：`authClient.admin.impersonateUser({ userId })`，可查看并吊销该用户的会话。

> `/api/auth/admin/*` 是插件自带的端点，插件按 `users.role` 判定。而该列是上面说的粗粒度标记——
> 只读的 `viewer` 在那里也是 `'admin'`。因此 `src/routes/api/auth/$.ts` 在进 handler 之前再按
> **权限点**拦一道：读端点要 `admin.users.read`，其余（含插件将来新增的端点）默认要
> `admin.users.write`。`stop-impersonating` 例外：被模拟的用户必须能自己结束模拟。

## `role` 与 `ADMIN_EMAILS` 是两套机制

`role: 'admin'` **不会**自动获得 `/api/email` 的发信权限。那里是**双重邮箱白名单**：收件人与调用者
邮箱都必须出现在 `ADMIN_EMAILS` 环境变量里（`src/routes/api/email/$.ts`）。`role` 管管理台，
`ADMIN_EMAILS` 管发信路由，各管各的。

## 验证

登录管理台账号后打开 `/admin/users`，应能看到用户列表；去掉该账号的全部 `admin.*` 权限
（角色页或 RBAC 表），侧栏入口消失，同一地址 404。只去掉 `admin.users.read` 时管理台仍进得去
（入口只要求任意 `admin.*` 权限），但这一页自己的请求会被拒。
