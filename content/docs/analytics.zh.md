---
title: 分析
description: GA / Plausible / Umami / Clarity 的启用与脚本注入
locale: zh
order: 10
group: features
updated: 2026-10-15
---

| provider | 必要配置 |
|---|---|
| `ga` | `VITE_GA_ID` |
| `plausible` | `VITE_PLAUSIBLE_DOMAIN` |
| `umami` | `VITE_UMAMI_WEBSITE_ID`（或兼容字段 `VITE_UMAMI_ID`）+ `VITE_UMAMI_SCRIPT_URL` |
| `clarity` | `VITE_CLARITY_PROJECT_ID`（或兼容字段 `VITE_CLARITY_ID`） |

`initAnalytics()` 只在浏览器环境且 `analytics.enabled` 为 `true` 时注册配置中选中的适配器。

```ts
analytics: { enabled: true, providers: ['ga', 'plausible'] },
```

> **注意事项**：选中但缺少 ID 的 provider 不注册也不注入脚本；`track()` / `page()` 在无 provider 时为空操作。Umami 额外要求脚本地址为无凭据的 HTTPS URL。本模块只负责启用过滤与脚本注入，**不**代表采集端点已可用。

## 参考资料

- [Google Analytics Measurement ID](https://support.google.com/analytics/answer/12270356?hl=en)——`VITE_GA_ID` 的获取位置
- [Plausible tracking script](https://plausible.io/docs/plausible-script)——`VITE_PLAUSIBLE_DOMAIN` 与脚本注入
- [Umami Collect data](https://docs.umami.is/docs/collect-data)——`VITE_UMAMI_WEBSITE_ID` 与 `VITE_UMAMI_SCRIPT_URL`
- [Microsoft Clarity Setup](https://learn.microsoft.com/en-us/clarity/setup-and-installation/)——`VITE_CLARITY_PROJECT_ID` 的获取位置

## 下一步

- [邮件](./email)——事务邮件与联系表单的投递
- [功能集成概览](./integrations)——六个服务模块的门禁语义与端点
