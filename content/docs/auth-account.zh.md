---
title: 个人中心
description: 受保护路由的会话守卫，以及资料 / 安全 / 登录设备 / 通知偏好四个板块
locale: zh
order: 12
group: features
updated: 2026-10-15
---

登录后的账号管理区域，位于 `/{locale}/settings/*`。从导航栏用户菜单的「个人中心」进入。

## 路由结构

`settings.tsx` 是 pathless layout 路由（与 `docs` 同一手法）：它只做守卫与外壳，不含页面
内容，因此 `/settings` 自身不是内容页。

```
src/routes/{-$locale}/_layout/settings.tsx              # 守卫 + 会话 + 外壳 + <Outlet/>
src/routes/{-$locale}/_layout/settings/index.tsx        # /settings → 重定向到 profile
src/routes/{-$locale}/_layout/settings/profile.tsx      # 资料
src/routes/{-$locale}/_layout/settings/security.tsx     # 安全
src/routes/{-$locale}/_layout/settings/sessions.tsx     # 登录设备
src/routes/{-$locale}/_layout/settings/notifications.tsx # 通知偏好（依赖 newsletter）
```

新增板块时：在 `src/config/settings.ts` 加一条导航项、在 `settings/` 下加一个页面、
在 `getSettingsSectionMeta` 补一段标题文案即可，外壳会自动渲染。

## 会话守卫

`settings.tsx` 的 `beforeLoad` 做两件事：

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

`fetchSession()`（`src/auth/session.ts`）是 **server function**，用
`getAuth(env).api.getSession({ headers: getRequestHeaders() })` 读会话。必须如此，因为：

- 会话 cookie 是 httpOnly 的，客户端读不到；
- `getAuth` 需要每请求 env（D1 binding），客户端没有。

server function 在 SSR 阶段就地执行（无网络往返），客户端导航时降级为一次 RPC，两条路径
都拿到真实会话。这与 `fetchAuthProviderAvailability` 的理由相同。

返回值**只取页面要用的字段**（`id` / `name` / `email` / `emailVerified` / `image`），不回传整个
session。子页经 `Route.useRouteContext()` 取到它。

## 四个板块

| 板块 | better-auth 调用 | 用到的组件 |
|---|---|---|
| **资料** | `updateUser({ name })`；未验证时可 `sendVerificationEmail({ email, callbackURL })` | `Field` / `Input` / `Button` / `Badge` |
| **安全** | `changePassword({ currentPassword, newPassword })`、`changeEmail({ newEmail, callbackURL })`、`deleteUser()` | `Field` / `AlertDialog` |
| **登录设备** | `listSessions()`、`revokeSession({ token })`、`revokeOtherSessions()` | `Table` / `Button` / `Spinner` |
| **通知偏好** | `GET` / `POST` / `DELETE` `/api/newsletter`（见 [邮件订阅](./newsletter)） | `Switch` / `Field` |

几个约定：

- **破坏性操作**用 `AlertDialog` 二次确认，不要用 `window.confirm`。注销账号后整页跳转，
  因为会话已失效。
- **状态标记**用 `Badge`（如邮箱验证状态），不要手写带背景色的 `<span>`。
- **空态与加载态**用 `Spinner`，不要手写占位。
- **通知偏好**整块受 `newsletter` 模块门禁：`beforeLoad` 调 `assertPageEnabled('newsletter')`，
  模块关闭时页面 404、菜单项也自动消失（`filterMenuItems` 按 `visibility.module` 过滤）。
- 改密码的**当前密码只判必填**，不套用 `MIN_PASSWORD_LENGTH`——老密码可能短于当前下限，
  卡长度会让用户永远改不了密码。新密码才用长度下限。

## 侧边栏

外壳（`src/components/settings/SettingsLayout.tsx`）**直接用 shadcn 的 `sidebar`（Base UI 版）**，
不自己实现折叠、cookie 持久化或移动端抽屉——`SidebarProvider` 与 `Sidebar` 已提供这些，
窄屏自动切为 `Sheet`。这里只做组装。

与 `DocsLayout` 自建的侧栏**不共用**：docs 侧栏有自己的 cookie 与折叠语义，强行合并只会
互相牵制。

侧栏自底向上分三段：

| 段 | 内容 |
|---|---|
| `SidebarHeader` | 站点 logo，点击回首页；深色主题下加白底片（与营销站 Navbar 同一处理） |
| `SidebarContent` | 上文所述的板块菜单，文案来自 `getSettingsSections` |
| `SidebarFooter` | 用户卡片（`SettingsUserCard`）：头像 + 名字 + 邮箱，展开后登出 |

用户卡片是个人中心内**唯一**的登出入口——`settings` 是 `_layout` 路由，不渲染营销导航栏，
`UserMenu` 在这里不可见。头像取 `SessionInfo.user.image`（`users.image` 列，Google 登录
会写入）；为空时回退到 `name` 或邮箱的首字母。

顶栏（`SidebarInset` 内的 `header`）放三样东西，从左到右：

1. `SidebarTrigger`——折叠按钮，点击把侧栏收成图标窄条，再点展开；宽窄屏都常驻，
   窄屏下侧栏是 `Sheet` 抽屉，同样靠它打开。
2. 三级面包屑——`首页 › 个人中心 › 当前板块`，前两级是 `BreadcrumbLink`，末级是
   `BreadcrumbPage`（带 `aria-current="page"`）。
3. `ThemeToggle`——右上角。放侧栏头会和 logo 抢位（折叠后侧栏只剩约 3rem），
   且营销站 Navbar 就在这个位置，用户预期一致。

顶栏**没有** `<h1>`：面包屑末级已是页面标题，再放一个会让同一个词在屏幕与无障碍树里
各出现一次。也**没有**「返回站点」链接——logo 就是回站点入口。

## 页面元数据

每个子页的 `head()` 走 `seo()` 生成 meta 与 canonical，并追加 `robots: noindex`——
个人页不应被搜索引擎索引。

## 参考资料

- [Better Auth 配置选项](https://www.better-auth.com/docs/reference/options)——账户相关字段与会话配置
- [TanStack Start 认证指南](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)——`beforeLoad` 守卫与整页跳转的取舍

## 下一步

- [身份认证](./auth)——登录、注册与邮件流程
- [表单约定](./forms)——这些表单用的 TanStack Form 写法
- [邮件订阅](./newsletter)——通知偏好背后的订阅接口
