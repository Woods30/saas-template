---
title: 功能集成概览
description: 六个服务模块的门禁语义、端点与接线方式
locale: zh
order: 5
group: features
updated: 2026-10-14
---

六个服务模块（`mail` / `contact` / `newsletter` / `payment` / `notification` / `analytics`）默认全部关闭。每个模块的接线由三部分组成：

1. **开关**——`src/config/website.ts` 里的 `enabled`；
2. **provider 注册表**——`src/{mail,newsletter,notification,payment}/index.ts`，在 `src/server.ts` 的请求入口按当前 env 构建，存入 AsyncLocalStorage；
3. **运行时门禁**——`src/lib/module-access.server.ts`，在 API 处理的最前处拦截。

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

> **注意事项**：Stripe webhook（`/api/webhooks/stripe`）**不受** `payment.enabled` 门禁，以便模块关闭后仍能处理存量订阅的合法事件。

## 各模块文档

| 模块 | 文档 |
|---|---|
| 邮件（含联系表单） | [邮件](./email) |
| 邮件订阅 | [邮件订阅](./newsletter) |
| 支付 | [支付](./payment) |
| 通知 | [通知](./notifications) |
| 分析 | [分析](./analytics) |

## 配置状态诊断

`getServiceStatuses({ config, publicEnv, serverEnv, bindings })` 是纯函数，不发起网络请求、不读取 env、不回显凭据，返回逐模块的 `disabled` / `incomplete` / `configured`。

> **注意事项**：`configured` **不等于** delivered / paid / collected——它只表示开关与必要字段齐备。`pnpm check` 会打印逐模块状态与部署核对项；`pnpm check:env:prod` 在已启用模块缺字段时直接失败。

## 下一步

- [网站配置](./configuration)——模块开关与默认值全表
- [环境变量](./environment)——各模块所需的 env 字段与两层校验
