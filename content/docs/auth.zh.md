---
title: 身份认证
description: 邮箱密码与 Google 登录、邮件流程、会话守卫与表单约定
locale: zh
order: 10
group: features
updated: 2026-10-29
---

邮箱密码 + Google OAuth，基于 Better Auth v1.7.10 与 Drizzle adapter（D1 / SQLite）。
页面在 `/{locale}/auth/*`，API 在 `/api/auth/*`，工作台在 `/{locale}/dashboard/*`。

## 启用

![登录页](/docs/screenshots/auth-login.png "登录页：邮箱密码登录，配置 Google 凭据后自动出现第三方登录按钮")

当前默认启用认证、Resend 邮件和邮箱验证：

```ts
// src/config/website.ts
auth: { enabled: true, requireEmailVerification: true },
mail: { enabled: true, provider: 'resend', supportEmail: 'service@jerbix.site' },
```

`supportEmail` 已配置为 `service@jerbix.site`；它是支持收件邮箱，与发件地址 `MAIL_FROM` 分开配置，见[邮件](./email)。

| 配置 / 变量 | 何时需要 | 作用 |
|---|---|---|
| `auth.enabled` | — | 同时门禁页面与 API。关闭时页面经 `assertPageEnabled('auth')` 404，`/api/auth/*` 在进入 Better Auth 前返回 `404 { error: 'MODULE_DISABLED' }` |
| `auth.requireEmailVerification` | 当前默认 `true` | 未验证邮箱不能密码登录，见[下文](#requireemailverification-是安全控制不是邮件开关) |
| `RESEND_API_KEY` / `MAIL_FROM` | 当前 Resend 配置必需 | API key 与已验证域名下的纯发件邮箱地址 |
| `BETTER_AUTH_URL` | 邮件验证 / Google 登录必需 | 本地为 `http://localhost:3000`；生产为实际 HTTPS origin |
| `BETTER_AUTH_SECRET` | 生产必需 | 签名会话与邮件 token，≥ 32 字符；由 `check:env:prod` 强制校验 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 启用 Google 登录时 | OAuth 凭据，两者缺一不可 |

本地开发未设 `BETTER_AUTH_SECRET` 时，Better Auth 可退回自带的开发密钥；但当前要求邮箱验证，
仍须在 `.env` 配齐邮件配置。缺少 `RESEND_API_KEY` / `MAIL_FROM` 或关闭邮件时，`auth` 状态为
`incomplete`，`/api/auth/*` 返回 503，`pnpm check:env:prod` 失败，不会隐式降级为免验证登录。

## Google 登录

凭据必须**成对**配置。`getAuthProviderAvailability` 仅在 ID 与 secret 都存在时返回
`google: true`，登录页也只在此时渲染按钮；只配 client ID 时 Better Auth 同样不会注册该
provider，显示按钮只会把用户导向必然失败的流程。

凭据是服务端 secret，客户端 bundle 读不到。登录页 `beforeLoad` 调
`fetchAuthProviderAvailability`（server function）：SSR 就地求值，客户端导航降级为一次
RPC。若改用普通函数，从导航栏点进登录页时按钮会静默消失。

## 邮件流程

三个模板由 [邮件](./email) 所述的 mail provider 渲染：

| 流程 | 触发点 | 模板 |
|---|---|---|
| 邮箱验证 | 注册时（`sendOnSignUp: true`）；未验证用户以正确密码登录时（`sendOnSignIn: true`）重发 | `verifyEmail` |
| 重置密码 | 「忘记密码」 | `forgotPassword` |
| 欢迎邮件 | 邮箱验证成功后的 `emailVerification.afterEmailVerification` | `welcome` |

当前注册会创建用户并发送验证邮件，**不创建 session**。未验证用户以正确密码登录时重发验证邮件，
返回 **403 `EMAIL_NOT_VERIFIED`**，同样不创建 session。验证成功后，
`autoSignInAfterVerification: true` 自动建立会话，并触发欢迎邮件；创建用户时不再发送欢迎邮件。

`src/auth/emails.ts` 是 Better Auth 回调与 mail registry 之间唯一的桥梁，两条防御必须保留：

- **绝不抛出。** Better Auth 经 `runInBackgroundOrAwait` 调用回调，抛错会让**注册或登录
  失败**。所有异常收敛为 `{ ok: false, error }` 并记 `console.warn`。
- **邮件关闭或缺少发件人时不尝试发送。** 桥接函数返回 `{ ok: false, error }`，调用方记录警告。
  这不改变认证门禁：要求验证而邮件未配齐时，认证 API 在进入 Better Auth 前已返回 503。

收件人语言从回调的第二个参数 `Request` 解析（URL 前缀 → cookie → `Accept-Language` →
默认语言），中文访客收到中文邮件，无需额外接线。

### 验证链接

邮件链接指向 `/api/auth/verify-email?token=…&callbackURL=…`，其中 `callbackURL` 是编码后的
`/{locale}/auth/verify-email?redirect=<站内目标>`。注册和密码登录都保留安全的站内购买目标；
`safeInternalPath()` 拒绝外域、`//`、反斜杠和控制字符，不合法或缺失时回落 `/`。

这是 Better Auth 侧的 **GET** 端点：校验后重定向到验证结果页，失败追加 `error=<code>`。
结果页将任何 `error` 参数视为失败并提供保留 `redirect` 的登录链接，避免未知错误被误报成功。
成功时显示「继续」链接，`href` 使用 `resolveRedirectTarget(redirect)`，以整页导航前往安全站内目标
并刷新 session。结果页自身不调客户端 SDK；保留购买目标不代表验证成功后自动发起结账。

### 重置链接

`requestPasswordReset` 无论邮箱是否存在都返回成功，以防账号枚举。`redirectTo` 带当前语言
前缀，重置页因此回到同一语言。

## `requireEmailVerification` 是安全控制，不是邮件开关

该字段当前默认 `true`，决定用户能否在不证明拥有该邮箱的情况下密码登录。它**刻意不**从
`mail.enabled` 推导：邮箱在下游是身份依据——支付把 `session.user.email` 交给 Stripe，
`/api/email` 按 `ADMIN_EMAILS` 成员身份授权。缺少邮件配置不能悄悄放宽身份验证。

安全侧统一读 `src/auth/flow.ts` 的 `requiresEmailVerification()`，服务端与 UI 不会分歧。
同一模块的 `signUpOutcome()` 决定注册成功后的页面：当前要求验证，显示查收邮件提示；
只有显式改成 `false` 时，Better Auth 才会在注册后自动登录，页面再跳转到安全站内目标。

`requireEmailVerification: true` + 邮件未配齐是**矛盾配置**，`getServiceStatuses()` 会将
`auth` 报为 `incomplete`，认证 API 返回 503，`check:env:prod` 失败。补齐邮件配置即可恢复，
系统不会自动关闭验证。

## 会话与登出

导航栏账号区（`src/components/layout/UserMenu.tsx`）用 `authClient.useSession()` 读真实会话：

- **待定**：渲染访客入口，与未登录一致。此时若渲染骨架，服务端 HTML 里将完全没有登录
  入口，访客要等客户端拿到会话才看到它。
- **未登录**：登录链接。
- **已登录**：账号菜单，含「个人中心」与「退出登录」。登出失败时留在原页而不跳转，
  避免用户误以为会话已结束。

受保护路由（个人中心）的守卫见 [个人中心](./auth-account)。

## 水合前的表单提交

认证表单的提交按钮在服务端 HTML 里就是**禁用**的，水合后才可点
（`useHydrated` + `SubmitButton`）。没有这道防线时，React 接管前的点击会退化为浏览器
原生表单提交：字段被拼进 query string 以 **GET** 发出，**密码进入地址栏、浏览器历史与
`Referer` 头**，而页面只是刷新一下。禁用期间按钮仍可见，不会布局跳动。

表单本身统一用 TanStack Form + Zod，见 [表单约定](./forms)。

## 登录 / 注册页的法律声明

login 与 register 在表单卡片**内部的 `CardFooter`** 渲染一行「点击继续，即表示你同意我们的
服务条款与隐私政策」，指向 `/marketing/legal/terms` 与 `/marketing/legal/privacy`，随当前语言切换。
「返回首页」链接位于卡片外部。

它由 `AuthLayout` 的 `legalNotice` prop 控制，**默认关闭**。只有「用户此刻正在同意」的页面才传：
`verify-email` 是终态且没有提交按钮，`reset-password` / `forgot-password` 用户也不在创建账号，
`error` 更没有任何可同意的动作。register 的两个 `AuthLayout` 调用点里，只有表单那一支传——
「请查收验证邮件」那支出现时账号已创建、同意已发生过。

服务条款与隐私政策位于 `content/legal/`，当前按 Jerbix、`https://www.jerbix.site` 及
`service@jerbix.site` 编写，涵盖一次性源码购买、MIT 授权、退款和实际数据处理。页面不指定专属
司法辖区；这不免除实际经营地或目标市场可能要求的经营者身份与地址披露。复用到其他站点时，
应按自己的运营方式、服务商与适用规则更新正文。

## 生产环境

### Resend 与运行时配置

在 Resend 验证自己的发信域名，将 `MAIL_FROM` 设为该域名下的纯邮箱地址（不带显示名或尖括号）。
本地 `.env` 配置 `RESEND_API_KEY`、`MAIL_FROM` 和 `BETTER_AUTH_URL`；生产 GitHub
`production` Environment 中设置 Secret `RESEND_API_KEY` 和 Variable `MAIL_FROM`，均**不加 `VITE_` 前缀**。
工作流也兼容 Secret `MAIL_FROM`，Variable 优先，并通过 `--secrets-file` 白名单同步到 Worker。
手工部署时，生产校验用的 `.env.production` 与 Worker 运行时绑定也必须一致，见[邮件](./email)和
[Cloudflare](./cloudflare)。

### `BETTER_AUTH_SECRET`

手工生产部署用 `wrangler secret put` 上传运行时 secret，不要将真实值提交到仓库：

```bash
printf '%s' "$BETTER_AUTH_SECRET" | pnpm exec wrangler secret put BETTER_AUTH_SECRET
```

`BETTER_AUTH_SECRET` 需 ≥ 32 字符，可用 `openssl rand -base64 32` 生成。生产环境下缺失或
过短会被 `validateProdServerEnv` 拒绝，`pnpm deploy` 第一步就失败。

> **注意事项**：`.env.production` 里也有一份同名值，但那**只为让生产校验通过**——运行时读的是
> Worker secret。两者必须是同一个值。自动 Release 部署使用 GitHub 配置并同步运行时绑定，
> 无需手工重复上传。详见[环境变量](./environment)。

### `BETTER_AUTH_URL`

用于生成回调与重定向的**绝对** URL。留空时 better-auth 从请求 origin 推断，单域名部署下
等价，但会打印警告：

```
WARN [Better Auth]: Base URL is not set. Set the baseURL option or BETTER_AUTH_URL env...
Without it the origin is derived from the incoming request, and callbacks and redirects
may not work correctly.
```

**接 Google OAuth 或邮件验证时必须显式设置**——否则推断出的 origin 随请求变化，回调地址
会跟着漂移，OAuth 回跳与邮件里的验证链接都可能指向错误的域名。生产环境填真实 HTTPS 域名，
与 `VITE_BASE_URL` 保持一致。

### Google OAuth 的回调地址

在 Google Cloud Console 的 OAuth 客户端里，授权来源与重定向 URI 都要填生产域名：

| 字段 | 值 |
|---|---|
| 授权的 JavaScript 来源 | `https://your-domain.com` |
| 授权的重定向 URI | `https://your-domain.com/api/auth/callback/google` |

本地开发另加 `http://localhost:3000` 与 `http://localhost:3000/api/auth/callback/google`。
同一个 OAuth 客户端可以同时登记本地与生产两组。

未接 Google 登录时，`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 留空即可——两个都不填时
Better Auth 不注册该 provider，登录页也不渲染按钮。

当前生产配置为 `https://www.jerbix.site`，因此重定向 URI 需填
`https://www.jerbix.site/api/auth/callback/google`。凭据在 GitHub `production` Environment 中
配置：`GOOGLE_CLIENT_ID` 与 `GOOGLE_CLIENT_SECRET`。工作流两者都接受 Variable 或 Secret，
但 **Secret 更稳妥**（client secret 绝不能进客户端 bundle）。

**Google 登录不受 `requireEmailVerification` 拦截**：Google 会返回 `email_verified`，
Better Auth 据此把账号标记为已验证。只有邮箱密码路径会在未验证时返回 403。

## 改动时的关键不变量

改认证相关代码前逐条核对：

- `requireEmailVerification` **不跟随** `mail.enabled`；`true` + 邮件未配齐会被
  `check:env:prod` 拦下。
- 注册页去向由 `signUpOutcome()` 决定，**不要**无条件提示「请查收邮件」。
- 社交凭据可见性必须走 server function（`fetchAuthProviderAvailability`）。
- 提交按钮水合前必须禁用。
- 认证表单的 `<form>` 必须带 `noValidate`：`<Input type="email">` 会触发浏览器原生约束
  校验，值非法时原生校验直接拦下 `submit`，schema 校验与错误文案就永远不会出现。
- 邮件回调绝不抛出；抛错会连带注册 / 登录失败。
- 受保护路由在 `beforeLoad` 里用 `fetchSession()` 判会话，未登录 `redirect` 到登录页。
- `session.cookieCache` 开启后，**跨设备撤销**会话不会让被踢设备立刻失效：缓存 cookie 是
  带过期时间的签名 JWT，只有 D1 记录被删除。`maxAge` 就是这个窗口，当前取 30 秒。
  登出、改密码、删号会连带清除本机缓存 cookie，不受此限制。若站点规模或敏感度提高，
  应调小 `maxAge` 或关闭缓存。

## 参考资料

- [Better Auth 配置选项](https://www.better-auth.com/docs/reference/options)——`BETTER_AUTH_SECRET` 等配置项说明
- [Better Auth Google provider](https://www.better-auth.com/docs/authentication/google)——Google 登录的凭据申请与配置
- [Google OAuth 2.0 Web Server](https://developers.google.com/identity/protocols/oauth2/web-server)——授权码流程的完整说明
- [TanStack Start 认证指南](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)——会话、受保护路由与服务端函数

## 下一步

- [个人中心](./auth-account)——受保护路由、会话守卫与四个板块
- [表单约定](./forms)——TanStack Form + Zod + `Field` 的最小可复制写法
- [邮件](./email)——邮件 provider 与联系表单
- [环境变量](./environment)——全部变量及其读取层级
- [Cloudflare](./cloudflare)——部署与运行时 secret 的配置
