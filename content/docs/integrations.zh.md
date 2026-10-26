---
title: 功能集成概览
description: 各服务模块的门禁语义、端点与接线方式
locale: zh
order: 9
group: features
updated: 2026-10-14
---

六个服务模块（`mail` / `contact` / `newsletter` / `payment` / `notification` / `analytics`）默认全部关闭。每个模块的接线由三部分组成：

1. **开关**——`src/config/website.ts` 里的 `enabled`；
2. **provider 注册表**——`src/{mail,newsletter,notification,payment}/index.ts`，在 `src/server.ts` 的请求入口按当前 env 构建，存入 AsyncLocalStorage；
3. **运行时门禁**——`src/lib/module-access.server.ts`，在 API 处理的最前处拦截。

[身份认证](./auth) 是第七个受门禁管辖的模块，默认开启。它没有 provider 注册表——接线由 Better Auth 自己持有——因此只适用第 1、3 步。它的邮件流程确实经由 `mail` 模块的 provider 发送，见下文。

## 门禁语义

`getModuleUnavailableResponse(module)` 必须早于 body 解析、鉴权、限流与 provider 调用。

| 条件 | 响应 |
|---|---|
| 模块 `enabled` 为 `false` | `404 { "error": "MODULE_DISABLED" }` |
| 已启用但必要配置缺失 | `503 { "error": "SERVICE_UNAVAILABLE" }` |
| 配置齐备 | `undefined`，调用方继续原有流程 |

响应只含稳定错误码，不回显缺失字段或凭据。

| 端点 | 方法 | 模块 |
|---|---|---|
| `/api/contact/*` | `POST` | `contact` |
| `/api/newsletter/*` | `POST` / `DELETE` | `newsletter` |
| `/api/payment/*` | `POST` / `DELETE` | `payment` |
| `/api/email/*` | `POST` | `mail` |
| `/api/auth/*` | `GET` / `POST` | `auth` |

> **注意事项**：Stripe webhook（`/api/webhooks/stripe`）**不受** `payment.enabled` 门禁，以便模块关闭后仍能处理存量订阅的合法事件。

`/api/auth/*` 下有两组前缀在 `auth` 之外还受**功能开关**约束，关闭时在进入 Better Auth
之前即返回 404（不只是 UI 消失）：

| 前缀 | 开关 | 关闭后 |
|---|---|---|
| `/api/auth/api-key/*` | `features.enableApiKeys` | 创建 / 列表 / 删除密钥的 HTTP 端点整体停用 |
| `/api/auth/admin/*` | `features.enableAdmin` | 用户管理的 HTTP 端点整体停用 |

门禁落在 `src/routes/api/auth/$.ts` 的路由层。**角色判定不在此处**：非 admin 调用 admin
端点由插件自身返回 403。服务端直接函数调用（如 `auth.api.verifyApiKey`）不经路由，不受
这两道开关影响。详见[API 密钥](./api-keys)与[用户管理](./user-management)。

`auth` 不声明任何**字段级**必要配置，`BETTER_AUTH_SECRET` 改由 `check:env:prod` 在部署前强制校验；本地开发时 Better Auth 会退回自带的开发密钥，在门禁处判失败只会无谓地挡住本地开发。

但它有一条**矛盾规则**会触发 503：`auth.requireEmailVerification` 为 `true` 而 `mail` 未配置完整时，`auth` 报告 `incomplete`。要求邮箱验证却发不出验证邮件，等于让新用户永远无法登录——这是部署事故，不是可接受的降级。详见[认证邮件](#认证邮件经由邮件模块发送)。

## 认证邮件经由邮件模块发送

认证模块的三个邮件流程（邮箱验证、重置密码、欢迎邮件）不是独立的 provider，而是经由 `mail.enabled` 选定的 provider 渲染：

```
Better Auth 回调  →  src/auth/emails.ts  →  src/mail/index.ts sendMail(provider)
```

`src/auth/emails.ts` 是唯一的桥梁，且绝不抛出：Better Auth 在注册、登录请求内部调用 `sendVerificationEmail` / `sendResetPassword`，回调抛错会让**注册本身失败**。失败一律收敛为 `{ ok: false, error }` 并记 `console.warn`。

这层依赖是单向且软性的：`mail.enabled: false` 时认证邮件静默跳过。但 `requireEmailVerification` **不**跟随该开关——它是显式安全控制（`auth.requireEmailVerification`），因为让「邮件没配好」静默放行未验证注册，等于允许任何人冒用不属于自己的邮箱。它出厂为 `false`，好让未接邮件的模板开箱可用；**接上邮件时应改为 `true`**。而「要求验证但邮件未配齐」这一矛盾组合会被 `getServiceStatuses()` 报出，并让 `pnpm check:env:prod` 失败。见[身份认证](./auth)。

## 各模块文档

| 模块 | 文档 |
|---|---|
| 邮件（含联系表单） | [邮件](./email) |
| 邮件订阅 | [邮件订阅](./newsletter) |
| 支付 | [支付](./payment) |
| 通知 | [通知](./notifications) |
| 分析 | [分析](./analytics) |
| 身份认证 | [身份认证](./auth) |

## 配置状态诊断

`getServiceStatuses({ config, publicEnv, serverEnv, bindings })` 是纯函数，不发起网络请求、不读取 env、不回显凭据，返回逐模块的 `disabled` / `incomplete` / `configured`。

> **注意事项**：`configured` **不等于** delivered / paid / collected——它只表示开关与必要字段齐备。`pnpm check` 会打印逐模块状态与部署核对项；`pnpm check:env:prod` 在已启用模块缺字段时直接失败。

## 下一步

- [网站配置](./configuration)——模块开关与默认值全表
- [环境变量](./environment)——各模块所需的 env 字段与两层校验
