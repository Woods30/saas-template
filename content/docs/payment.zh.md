---
title: 支付
description: Stripe 结账、Price 白名单与 Webhook
locale: zh
order: 8
group: features
updated: 2026-10-14
---

当前仅支持 **Stripe**。provider 注册需要 `STRIPE_SECRET_KEY` 与 `STRIPE_WEBHOOK_SECRET` 同时存在，否则不注册。

`allowedPriceIds` 是服务端白名单：非空时 `/api/payment` 拒绝不在列表内的 `priceId`；为空时不做白名单校验。

```ts
payment: {
  enabled: true,
  provider: 'stripe',
  allowedPriceIds: [env.VITE_STRIPE_PRICE_PRO_MONTHLY ?? ''].filter(Boolean),
},
```

结账流程（`POST /api/payment`）：门禁 → 会话鉴权 → 限流（每 IP 每分钟 10 次）→ body 校验 → Price ID 白名单 → 创建 Checkout Session。失败返回 502。

> **注意事项**：Webhook 具备幂等与重投保护——验签失败返回 400 且不写库；事件 ID 经 `webhook_events` 表去重，重复事件直接返回 200；业务处理抛错返回 500 让 Stripe 重投。生产环境应填写实际 Price ID，示例内容不代表你的产品已配置商业套餐。

## 下一步

- [通知](./notifications)——Discord / 飞书 Webhook 的接线
- [功能集成概览](./integrations)——六个服务模块的门禁语义与端点
