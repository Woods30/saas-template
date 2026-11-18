---
title: 分析
description: 统计脚本的启用、CSP 放行与业务事件
locale: zh
order: 21
group: analytics
updated: 2026-11-19
---

分析模块在生产构建里注入统计脚本并上报页面浏览与业务事件。可以同时开多个 provider，
每个 provider 各自上报，互不影响。

## 步骤

1. **选渠道并填标识。** 打开后台「系统设置 → 分析」：

   - 勾选要用的一或多个渠道（GA / Plausible / Umami / Clarity）；
   - 在同一页填各渠道的公开标识（见下表）；
   - 保存即生效，不用发版。

   配置存在数据库里（`analytics.providers` 与 `analytics.config.*`），随页面下发浏览器。

   | provider | 配置字段 | 说明 |
   |---|---|---|
   | `ga` | `analytics.gaId` | Google Analytics 的 Measurement ID（`G-…`） |
   | `plausible` | `analytics.plausibleDomain` | 站点域名 |
   | `umami` | `analytics.umamiWebsiteId` + `analytics.umamiScriptUrl` | 脚本地址必须是无凭据的 HTTPS URL |
   | `clarity` | `analytics.clarityProjectId` | Microsoft Clarity 项目 ID |

   选中但缺 ID 的渠道不会注册，也不会注入脚本；状态页会把它标成 `incomplete` 并列出缺的字段。

2. **确认 CSP 会自动放行。** 放行名单按当前生效配置逐请求推导（见下一节），
   不需要手工改代码。

## CSP 放行

统计脚本是运行时插入的外部 `<script>`，CSP 的 nonce 覆盖不到它们，所以 `script-src` 必须显式
放行对应域名（`src/lib/security.ts`）：

| provider | 放行的 `script-src` |
|---|---|
| `ga` | `https://www.googletagmanager.com` |
| `plausible` | `https://plausible.io` |
| `clarity` | `https://www.clarity.ms` |
| `umami` | `analytics.umamiScriptUrl` 的 origin（自托管，逐请求推导） |

数据上报走 `connect-src`，其中已包含 GA4 的 `*.google-analytics.com` 与
`*.analytics.google.com`——少了这两条，脚本能加载但事件收不到。

统计脚本只在**生产构建 + 渠道启用**时注入，本地开发不会污染真实账号数据。

## 业务事件

事件名集中声明在 `src/lib/analytics/events.ts`，是分析平台的数据结构契约，调用处不写字面量。

| 事件 | 含义 | 状态 |
|---|---|---|
| `sign_up` | 注册成功 | 已在注册流程上报 |
| `login` | 登录成功 | 已在登录流程上报 |
| `begin_checkout` | 用户点了购买、开始结账 | 有上报函数 `trackBeginCheckout()`，尚未接入调用点 |
| `purchase` | 托管结账完成、访客回到本站 | 有上报函数 `trackPurchase()`，尚未接入调用点 |

`begin_checkout` 与 `purchase` 需要你在自己的结账入口与支付成功回调处调用对应的上报函数。
事件参数只放非 PII 值（商品 ID、金额、币种、模式）；邮箱与姓名不进参数——分析数据落在第三方，
带 PII 会同时违反 GDPR 与平台服务条款。

## 验证

统计只在**浏览器 + 生产构建 + `analytics.enabled`** 三者同时成立时初始化，开发环境一律不上报
（避免污染真实数据）。要本地验证注入链路，跑生产产物：

```bash
pnpm build && pnpm preview
```

打开页面后在浏览器 Network 面板确认对应统计域名的请求发出即可。

## 注意事项

- 页面浏览由 `AnalyticsProvider` 在首屏与路由切换时各上报一次。
- CSP 里没有 `unsafe-inline` / `unsafe-eval`，nonce 是内联脚本的唯一放行路径。

配好后可以接着看 [支付总览](./payment)——`begin_checkout` 与 `purchase` 的参数来自结账链路。
