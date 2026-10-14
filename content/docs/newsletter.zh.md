---
title: 邮件订阅
description: Resend / Beehiiv 订阅的接线与限流
locale: zh
order: 7
group: features
updated: 2026-10-14
---

| provider | 必要配置 |
|---|---|
| `resend` | `RESEND_API_KEY`、`RESEND_AUDIENCE_ID` |
| `beehiiv` | `BEEHIIV_API_KEY`、`BEEHIIV_PUBLICATION_ID` |

`BEEHIIV_SEND_WELCOME_EMAIL` 控制 Beehiiv 是否发送欢迎邮件，取值 `'true'` / `'false'`，默认 `'false'`。

订阅状态查询经 KV 缓存（`CACHE_TTL.newsletterStatus`），订阅 / 退订后会主动失效对应缓存键。

```ts
newsletter: { enabled: true, provider: 'resend' },
```

> **注意事项**：`/api/newsletter` 有独立限流，每 IP 每分钟 5 次。

## 下一步

- [支付](./payment)——Stripe 结账与 Price 白名单
- [分析](./analytics)——GA / Plausible / Umami / Clarity 的启用
