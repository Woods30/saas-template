---
title: 用户管理
description: 管理员角色、CLI 提权与管理台
locale: zh
order: 18
group: features
updated: 2026-10-16
---

用户管理基于 better-auth 的 admin 插件。管理员在个人中心的管理台查看全部用户，并执行
改角色、封禁、删除等操作；首个管理员由 CLI 脚本产生。

## 角色

`users.role` 是普通文本列（`src/db/schema.ts`），默认 `'user'`。本仓只用两个取值：

| 取值 | 含义 |
| --- | --- |
| `user` | 普通用户，只能进自己的个人中心 |
| `admin` | 管理员，额外可见「管理」分组与管理台 |

判定是**精确匹配**：`assertAdminRole` 只认 `'admin'`，不做大小写或前缀模糊匹配，
`undefined`（未登录或字段缺失）一律拒绝。插件侧的 `adminRoles` 保持默认 `['admin']`，
与之一致，因此无需传 `options`。

## 提权：CLI

首个管理员无法由 UI 产生——管理台本身要 admin 才能进。用脚本：

```bash
pnpm db:admin:local  you@example.com   # 本地 D1
pnpm db:admin:remote you@example.com   # 线上 D1
```

脚本只做一件事：`UPDATE users SET role = 'admin' WHERE email = ?`。`role` 是普通列，
直接改库即可，用户下次取会话时带上新角色。也可用 `pnpm db:studio:local` 在图形界面里改。

> **注意事项**：两个命令都**必须显式指定目标库**（`--local` / `--remote`），缺参数时脚本
> 打印用法并退出，避免误改生产。邮箱会先经正则校验、再转义 SQL 单引号，命令以参数数组
> 传给 wrangler（不经 shell），因此恶意邮箱无法注入命令。

## 管理台

`/dashboard/admin/users`（`src/routes/{-$locale}/_layout/dashboard/admin/users.tsx`）。
入口在个人中心侧边栏的「管理」分组，受功能开关 `features.enableAdmin` 与角色**双重**
约束——两者都满足才可见、可进。

- **列表**：`authClient.admin.listUsers({ query: { limit, offset, searchValue, searchField: 'email' } })`
  → `{ users, total, limit, offset }`。每页 20 条，用 offset/limit 翻页。
- **搜索**：按邮箱，输入后 300 ms 防抖，并重置到第一页。
- **改角色**：`authClient.admin.setRole({ userId, role })`。
- **封禁**：`authClient.admin.banUser({ userId, banReason, banExpiresIn })`。`banExpiresIn`
  的单位是**秒**，界面上按天输入后换算；留空即永久。
- **解封**：`authClient.admin.unbanUser({ userId })`。
- **删除**：`authClient.admin.removeUser({ userId })`。

封禁**立即生效**：被禁用户再次登录会被拒绝（`BANNED_USER`，HTTP 403），已有会话也会被
拒。解封后恢复。

> **注意事项**：管理台的三重门禁必须一致——侧栏可见性（`src/config/settings.ts` 的
> `visibility`）、页面门禁（`beforeLoad` 里的 `assertFeatureEnabled` + `assertAdminRole`）、
> API 门禁（`src/routes/api/auth/$.ts` 对 `/api/auth/admin/*` 前缀的 flag 判定）。关闭
> `features.enableAdmin` 会让这一组 HTTP 端点整体 404，但**角色判定不在路由层**：非 admin
> 调用插件端点由插件自身返回 403，因此 UI 门禁与 API 门禁缺一不可。
>
> 删除用户会连带删除其会话，操作不可撤销，管理台上以确认弹窗拦截。

## `role` 与 `ADMIN_EMAILS` 是两回事

`role: 'admin'` **不会**自动获得 `/api/email` 的发信权限。那里是**双重邮箱白名单**：收件人
和调用者邮箱都必须出现在 `ADMIN_EMAILS` 环境变量里（`src/routes/api/email/$.ts`）。两套
机制各管各的——`role` 管管理台，`ADMIN_EMAILS` 管发信路由。若你希望管理员能发信，需在
`ADMIN_EMAILS` 里另行列出其邮箱。

## 参考资料

- [better-auth Admin 插件](https://www.better-auth.com/docs/plugins/admin)——角色、封禁、impersonate 与权限模型
- [better-auth Access Control](https://www.better-auth.com/docs/concepts/access-control)——自定义角色与权限

## 下一步

- [身份认证](./auth)——会话与邮箱密码路径
- [配置](./configuration)——`features.enableAdmin` 开关
