---
title: 支付
description: Stripe 结账、定价页映射、账单页与 Webhook
locale: zh
order: 8
group: features
updated: 2026-10-19
---

当前唯一内置的 provider 是 **Stripe**，但支付链路以 `PaymentProvider` 接口为边界
（`src/payment/types.ts`），新增 Creem / Waffo 时只需实现该接口并在
`buildPaymentProviderRegistry` 注册——页面、API 路由与数据表都不需要改。

provider 注册需要 `STRIPE_SECRET_KEY` 与 `STRIPE_WEBHOOK_SECRET` 同时存在，否则不注册。

## 配置

```ts
// src/config/website.ts
payment: {
  enabled: true,
  provider: 'stripe',
  // 由 VITE_STRIPE_PRICE_* 派生，不需要手写
  allowedPriceIds: collectPriceIds(buildPriceMap(env)),
  priceMap: buildPriceMap(env),
},
```

`priceMap` 把定价页的 plan id 映射到 Stripe Price ID：

| 环境变量 | plan id | 计费周期 |
|---|---|---|
| `VITE_STRIPE_PRICE_PRO_MONTHLY` | `pro_monthly` | 月付 |
| `VITE_STRIPE_PRICE_PRO_YEARLY` | `pro_monthly` | 年付 |
| `VITE_STRIPE_PRICE_LIFETIME` | `lifetime` | 一次性 |

`allowedPriceIds` 与 `priceMap` **同源**（都从同一份 env 汇总），避免出现「白名单里
有、映射里没有」这种会让结账 502 的配置。白名单为空时 `/api/payment` 不做校验，
因此真实部署必须配 Price——`getServiceStatuses()` 会把它报为 `incomplete`。

未配置 Price 时定价页仍然可看，付费方案的按钮退化为「先注册」，不会给用户一个
点了就 502 的按钮。

## 结账流程

1. 定价页点击方案 → `startCheckout()`（`src/payment/checkout-client.ts`）
2. 未登录 → 跳登录页并带 `?redirect=/pricing`，登录后回到定价页继续
3. 已登录 → `POST /api/payment`：门禁 → 会话鉴权 → 限流（每 IP 每分钟 10 次）
   → body 校验 → Price ID 白名单 → 创建 Checkout Session
4. 成功后整页跳转到 Stripe Checkout
5. 完成后回到 `/dashboard/billing?checkout=success`，账单页显示订阅与流水

失败返回 502；配置缺失或网络错误时退回注册引导。

## 账单页

`/dashboard/billing` 显示：

- 当前订阅（状态、续费日期、金额）
- 付款流水（日期、金额、状态）
- 「管理订阅」按钮 → `DELETE /api/payment` → Stripe Billing Portal

服务端从数据库反查当前用户的 `customerId`（不接受客户端传入），因此不存在越权打开
他人账单门户的问题。订阅与流水的查询都按 `userId` 走索引。

## Webhook

端点：`POST /api/webhooks/stripe`

- 验签失败 → 400（不写库）
- 事件 ID 经 `webhook_events` 表去重，重复事件直接 200
- 业务处理抛错 → 删除事件行并返回 500，让 Stripe 重投
- 成功后写入 `processedAt`

处理的事件：

| 事件 | 落库 |
|---|---|
| `checkout.session.completed` | 订阅写 `subscriptions`；一次性支付写 `payments` |
| `invoice.paid` | 写 `payments`（含 `invoiceId` / `chargeId`） |
| `customer.subscription.created` / `updated` | 更新状态、价格与周期 |
| `customer.subscription.deleted` | 标记 `canceled` |
| `charge.refunded` | 按 `chargeId` 标记退款 |

> **Stripe API 版本注意**：本仓锁定 `stripe@23`（API `2025-09-30.clover`）。该版本
> 有两处破坏性字段迁移，webhook 已按新结构读取：
> - `Invoice.subscription` → `Invoice.parent.subscription_details.subscription`
> - `Invoice.charge` → `Invoice.payments.data[].payment.charge`
> - `Subscription.current_period_start/end` → `Subscription.items.data[].current_period_*`
>
> 按旧字段读取不会抛错（值是 `undefined`），结果是 `chargeId` 恒为 `null`、
> 周期写成 `Invalid Date`——webhook 返回 200，数据库里却是错数据。

## 数据表

`subscriptions` 与 `payments` 的列名保持**供应商中立**（`provider`、`invoiceId`、
`chargeId`，而不是 `stripeInvoiceId`）。这是为了接入第二个 provider 时不必改表：
同一语义在两个渠道下是同一列，按用户查全部流水不需要按 provider 分支。

## 参考资料

- [Stripe API keys](https://docs.stripe.com/keys)——密钥类型、webhook 签名密钥与轮换
- [Stripe Checkout](https://docs.stripe.com/payments/checkout)——会话创建与 success/cancel URL
- [Stripe Billing Portal](https://docs.stripe.com/customer-management/integrate-customer-portal)——管理订阅入口

## 下一步

- [通知](./notifications)——支付成功事件的运营通知
- [功能集成概览](./integrations)——六个服务模块的门禁语义与端点
