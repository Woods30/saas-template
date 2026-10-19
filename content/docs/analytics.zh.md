---
title: 分析
description: GA / Plausible / Umami / Clarity 的启用、CSP 与业务事件
locale: zh
order: 10
group: features
updated: 2026-10-19
---

| provider | 必要配置 |
|---|---|
| `ga` | `VITE_GA_ID` |
| `plausible` | `VITE_PLAUSIBLE_DOMAIN` |
| `umami` | `VITE_UMAMI_WEBSITE_ID`（或兼容字段 `VITE_UMAMI_ID`）+ `VITE_UMAMI_SCRIPT_URL` |
| `clarity` | `VITE_CLARITY_PROJECT_ID`（或兼容字段 `VITE_CLARITY_ID`） |

```ts
analytics: { enabled: true, providers: ['ga', 'plausible'] },
```

## 启用条件

`initAnalytics()` 只在**浏览器 + 生产构建 + `analytics.enabled`** 三者同时成立时
注册 provider 并注入脚本。开发环境一律不上报——本地调试会污染真实账号的数据。

要在本地验证注入链路，用 `pnpm build && pnpm preview` 跑生产产物。

选中但缺少 ID / domain 的 provider 不注册也不注入；Umami 额外要求脚本地址为无凭据
的 HTTPS URL。

## CSP（重要）

分析脚本是**外部脚本**（`<script src>`），由 `injectScript()` 在运行时创建。CSP 的
nonce 只覆盖服务端序列化进 HTML 的内联脚本，覆盖不到这些运行时插入的标签，因此
`src/lib/security.ts` 的 `script-src` 必须显式放行脚本 origin：

- GA / Plausible / Clarity 的 origin 是固定的，始终在 `script-src` 里；
- Umami 是自托管的，origin 从 `VITE_UMAMI_SCRIPT_URL` 逐请求推导
  （`getAnalyticsScriptOrigins()`）。

未启用任何 provider 时 `connect-src` 仍保留常见分析域名（用于数据上报），但
`script-src` 不会因此放宽到 `unsafe-inline`。

> 早期实现只把分析 origin 放进 `connect-src`，生产环境下所有分析脚本都被浏览器
> 拦截，而测试只断言了 `connect-src`，因此全绿但功能不可用。

## 业务事件

页面浏览由 `AnalyticsProvider` 在首屏与路由切换时显式上报一次。业务事件在
`src/lib/analytics/events.ts` 集中声明：

| 事件 | 触发点 |
|---|---|
| `sign_up` | 注册成功（含「等待邮箱验证」分支） |
| `login` | 邮箱密码登录成功 |
| `begin_checkout` | 定价页发起结账、跳转 Stripe 之前 |
| `purchase` | 从 Stripe Checkout 返回账单页时 |

事件参数只放非 PII 值（plan id、金额、币种、模式）。邮箱 / 姓名不进参数：分析平台
的原始数据落在第三方，传 PII 会同时触碰 GDPR 与平台服务条款。

新增事件时改 `ANALYTICS_EVENTS`，不要在调用处写字符串——事件名是对外契约，散落成
字面量后 `sign_up` / `signup` 两套写法会让报表对不上。

## 参考资料

- [Google Analytics Measurement ID](https://support.google.com/analytics/answer/12270356?hl=en)——`VITE_GA_ID` 的获取位置
- [Plausible tracking script](https://plausible.io/docs/plausible-script)——`VITE_PLAUSIBLE_DOMAIN` 与脚本注入
- [Umami Collect data](https://docs.umami.is/docs/collect-data)——`VITE_UMAMI_WEBSITE_ID` 与 `VITE_UMAMI_SCRIPT_URL`
- [Microsoft Clarity Setup](https://learn.microsoft.com/en-us/clarity/setup-and-installation/)——`VITE_CLARITY_PROJECT_ID` 的获取位置

## 下一步

- [邮件](./email)——事务邮件与联系表单的投递
- [功能集成概览](./integrations)——六个服务模块的门禁语义与端点
