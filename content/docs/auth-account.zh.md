---
title: 个人中心
description: 登录后的账号设置区：资料、安全、设备与各板块入口
locale: zh
order: 10
group: auth
updated: 2026-11-03
---

个人中心是登录后的账号设置区，地址在 `/{locale}/settings/*`，入口在导航栏的用户菜单里。
未登录访问会被重定向到 `/{locale}/auth/login`。

![个人中心 · 资料页](/docs/screenshots/settings-profile.png "个人中心 · 资料：昵称与邮箱，邮箱未验证时提供验证入口")

## 路由与板块

| 路径 | 板块 | 做什么 |
|---|---|---|
| `/settings/profile` | 资料 | 改昵称、看邮箱验证状态，未验证时可重发验证邮件 |
| `/settings/security` | 安全 | 改密码、换邮箱、注销账号 |
| `/settings/sessions` | 登录设备 | 看已登录设备，单个吊销或一次性注销其它设备 |
| `/settings/notifications` | 通知偏好 | 订阅与退订邮件，需 `newsletter` 模块 |
| `/settings/billing` | 账单 | 订阅状态、续费日期与交易记录，需 `payment` 模块 |
| `/settings/api-keys` | API 密钥 | 创建与删除密钥，需 `features.enableApiKeys`，见 [API 密钥](./api-keys) |
| `/admin/users` | 用户管理 | 改角色、封禁、删除、模拟登录，需 `admin` 角色且 `features.enableAdmin` 打开，见 [用户与管理员](./user-management) |
| `/admin/revenue` | 营收 | 收入与订阅总览，门禁同「用户管理」 |

`/settings` 本身不是内容页，进入后直接落到「资料」。

## 会话守卫

`src/routes/{-$locale}/_layout/settings.tsx` 的 `beforeLoad` 做两件事：先 `assertPageEnabled('auth')`
确认认证模块开着，再 `fetchSession()` 读会话；没有会话就重定向到登录页。

会话 cookie 是 httpOnly，客户端读不到，所以只能由 server function 在服务端读：

```ts
// src/core/auth/session.ts
const session = await getAuth(env).api.getSession({ headers: getRequestHeaders() })
```

返回给页面的只有页面要用的字段（`id` / `name` / `email` / `emailVerified` / `image` / `role`），
子页用 `Route.useRouteContext()` 取。

## 加一个自己的板块

1. 在 `src/config/settings.ts` 的 `getSettingsSections()` 里加一条导航项，写明 `id`、标题、图标与目标路由。
2. 在 `src/routes/{-$locale}/_layout/settings/` 下加页面文件，文件路径与导航项的 `id` 一致。
3. 在 `src/config/settings.ts` 的 `getSettingsSectionMeta()` 里补这个板块的标题与说明。

外壳会按 `id` 自动渲染侧栏项与面包屑，不用改布局组件。

## 验证

登录后打开 `/{locale}/settings/profile`，应看到昵称与邮箱；未登录打开同一地址会跳到登录页。
