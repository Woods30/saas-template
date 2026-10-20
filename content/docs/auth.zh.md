---
title: 身份认证
description: 邮箱密码与 Google 登录、邮件流程、会话守卫与表单约定
locale: zh
order: 10
group: features
updated: 2026-10-15
---

邮箱密码 + Google OAuth，基于 Better Auth v1.7.7 与 Drizzle adapter（D1 / SQLite）。
页面在 `/{locale}/auth/*`，API 在 `/api/auth/*`，工作台在 `/{locale}/dashboard/*`。

## 启用

`websiteConfig.auth` 两个字段，加上三个环境变量：

```ts
// src/config/website.ts
auth: { enabled: true, requireEmailVerification: false },
```

| 配置 / 变量 | 何时需要 | 作用 |
|---|---|---|
| `auth.enabled` | — | 同时门禁页面与 API。关闭时页面经 `assertPageEnabled('auth')` 404，`/api/auth/*` 在进入 Better Auth 前返回 `404 { error: 'MODULE_DISABLED' }` |
| `auth.requireEmailVerification` | 接上邮件后应设为 `true` | 未验证邮箱能否登录，见[下文](#requireemailverification-是安全控制不是邮件开关) |
| `BETTER_AUTH_SECRET` | 生产必需 | 签名会话与邮件 token，≥ 32 字符；由 `check:env:prod` 强制校验 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 启用 Google 登录时 | OAuth 凭据，两者缺一不可 |

本地开发未设 `BETTER_AUTH_SECRET` 时，Better Auth 退回自带的开发密钥，`auth` 仍报
`configured`——门禁不会把本地开发挡在 503 之外。

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
| 邮箱验证 | 注册时，以及未验证用户登录时 | `verifyEmail` |
| 重置密码 | 「忘记密码」 | `forgotPassword` |
| 欢迎邮件 | `databaseHooks.user.create.after` | `welcome` |

`src/auth/emails.ts` 是 Better Auth 回调与 mail registry 之间唯一的桥梁，两条防御必须保留：

- **绝不抛出。** Better Auth 经 `runInBackgroundOrAwait` 调用回调，抛错会让**注册或登录
  失败**。所有异常收敛为 `{ ok: false, error }` 并记 `console.warn`。
- **邮件关闭即静默跳过。** `mail.enabled: false` 或发件人未配置时直接返回，不尝试发送。

收件人语言从回调的第二个参数 `Request` 解析（URL 前缀 → cookie → `Accept-Language` →
默认语言），中文访客收到中文邮件，无需额外接线。

### 验证链接

邮件链接指向 `/api/auth/verify-email?token=…&callbackURL=/{locale}/auth/verify-email`。
这是 Better Auth 侧的 **GET** 端点：校验后重定向，失败追加 `?error=<code>`，落地页据此
渲染「链接无效或已过期」。落地页自身不调任何客户端 SDK。

### 重置链接

`requestPasswordReset` 无论邮箱是否存在都返回成功，以防账号枚举。`redirectTo` 带当前语言
前缀，重置页因此回到同一语言。

## `requireEmailVerification` 是安全控制，不是邮件开关

该字段（默认 `false`）决定用户能否在不证明拥有该邮箱的情况下登录。它**刻意不**从
`mail.enabled` 推导：邮箱在下游是身份依据——`src/routes/api/payment/$.ts` 把
`session.user.email` 作为 `customerEmail` 传给 Stripe，`/api/email` 按 `ADMIN_EMAILS`
成员身份授权。让「还没配 SMTP」这一运维状态悄悄变成「任何人都能用别人的邮箱注册」，
就是权限提升。

默认 `false` 只因模板未接邮件：若默认要求验证，Better Auth 会拒绝一切未验证用户登录、
注册也不再自动登录，整条邮箱密码路径开箱即不可用。**接上邮件是两步改动**——先配好
`mail`，再把这里改成 `true`。

安全侧统一读 `src/auth/flow.ts` 的 `requiresEmailVerification()`，服务端与 UI 不会分歧。
同一模块的 `signUpOutcome()` 决定注册成功后落在哪里：`false` 时 Better Auth **会自动登录**
新用户，页面必须跳首页；把已登录用户叫去查收邮件，等于让他等一封永远不会发出的信。

`requireEmailVerification: true` + 邮件未配齐是**矛盾配置**，会被 `getServiceStatuses()`
报为 incomplete 并让 `check:env:prod` 失败——要求验证却发不出信，新用户将永远无法登录。

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

login 与 register 在表单卡片**下方**渲染一行「点击继续，即表示你同意我们的服务条款与隐私政策」，
指向 `/marketing/legal/terms` 与 `/marketing/legal/privacy`，随当前语言切换。写法参照 shadcn 的
`login-03` 块：声明是卡片的同级元素，放进卡片里会被读成表单的一部分。

它由 `AuthLayout` 的 `legalNotice` prop 控制，**默认关闭**。只有「用户此刻正在同意」的页面才传：
`verify-email` 是终态且没有提交按钮，`reset-password` / `forgot-password` 用户也不在创建账号，
`error` 更没有任何可同意的动作。register 的两个 `AuthLayout` 调用点里，只有表单那一支传——
「请查收验证邮件」那支出现时账号已创建、同意已发生过。

> **注意事项**：服务条款与隐私政策的正文在 `content/legal/` 下，**是带占位提示的模板**。
   上线前必须把其中标注「部署前填写」的条目换成真实情况，至少包括：数据保留期限、子处理商
   名单（含各自 DPA）、退款窗口、责任上限、管辖法律与争议解决地、联系邮箱，以及本部署实际
   设置了哪些 Cookie。占位以 `> **注意事项**` 书写，会被渲染成醒目的 Alert；全部替换掉之后
   再考虑删掉文档开头那条「本文档是模板占位内容」的提示。

## 生产环境

### `BETTER_AUTH_SECRET`

生产用 `wrangler secret put`，不要写进 `.env`：

```bash
printf '%s' "$BETTER_AUTH_SECRET" | pnpm exec wrangler secret put BETTER_AUTH_SECRET
```

`BETTER_AUTH_SECRET` 需 ≥ 32 字符，可用 `openssl rand -base64 32` 生成。生产环境下缺失或
过短会被 `validateProdServerEnv` 拒绝，`pnpm deploy` 第一步就失败。

> **注意事项**：`.env.production` 里也有一份同名值，但那**只为让生产校验通过**——运行时读的是
> Worker secret。两者必须是同一个值。详见[环境变量](./environment)。

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
