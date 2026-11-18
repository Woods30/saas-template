---
title: 用户与管理员
description: 角色字段、管理台入口与命令行提权
locale: zh
order: 12
group: auth
updated: 2026-11-03
---

用户管理基于 Better Auth 的 admin 插件。管理员在个人中心的管理台查看全部用户、改角色、
封禁与删除；第一个管理员由命令行产生。

## 角色

`users.role` 是普通文本列（`src/core/db/schema.ts`），默认 `'user'`。本仓只用两个取值：

| 取值 | 含义 |
|---|---|
| `user` | 普通用户，只能进自己的个人中心 |
| `admin` | 管理员，额外可见「管理」分组与管理台 |

判定是**精确匹配**：`assertAdminRole` 只认 `'admin'`，未登录或字段缺失一律拒绝（用 404 而非 403，
不向非管理员泄漏这个页面存在）。

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

`/admin/users`，入口在个人中心侧边栏的「管理」分组；`/admin/revenue` 是营收总览。
两者都受**双重**约束：`features.enableAdmin` 开关与 `admin` 角色都满足才可见、可进。

- **列表**：服务端直接查 D1（`fetchAdminUsers`），支持按邮箱搜索、按角色与状态筛选、offset 翻页，
  每页 20 条。
- **改角色**：`authClient.admin.setRole({ userId, role })`。
- **封禁**：`authClient.admin.banUser({ userId, banReason, banExpiresIn })`。`banExpiresIn` 的单位是
  **秒**，界面上按天输入后换算；留空即永久。封禁**立即生效**：被禁用户登录被拒
  （`BANNED_USER`，HTTP 403），已有会话也失效。
- **解封**：`authClient.admin.unbanUser({ userId })`。
- **删除**：`authClient.admin.removeUser({ userId })`，连带删掉其会话，不可撤销。
- **模拟登录**：`authClient.admin.impersonateUser({ userId })`，可查看并吊销该用户的会话。

> 关闭 `features.enableAdmin` 会让 `/api/auth/admin/*` 这组 HTTP 端点整体 404，但**角色判定不在
> 路由层**：非 admin 调用插件端点由插件自己返回 403。UI 门禁与 API 门禁两者缺一不可。

## `role` 与 `ADMIN_EMAILS` 是两套机制

`role: 'admin'` **不会**自动获得 `/api/email` 的发信权限。那里是**双重邮箱白名单**：收件人与调用者
邮箱都必须出现在 `ADMIN_EMAILS` 环境变量里（`src/routes/api/email/$.ts`）。`role` 管管理台，
`ADMIN_EMAILS` 管发信路由，各管各的。

## 验证

登录管理台账号后打开 `/admin/users`，应能看到用户列表；把 `features.enableAdmin` 关掉，
侧栏入口消失，同一地址 404。
