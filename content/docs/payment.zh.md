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
   → body 校验 → Price ID 白名单 → **已有订阅检查** → 创建 Checkout Session
4. 成功后整页跳转到 Stripe Checkout
5. 完成后回到 `/dashboard/billing?checkout=success`，账单页显示订阅与流水

### 月付 / 年付怎么选

`pro_monthly` 一个 plan 下挂两个 Price：`VITE_STRIPE_PRICE_PRO_MONTHLY`（月付）与
`VITE_STRIPE_PRICE_PRO_YEARLY`（年付）。只配其中一个时，定价页的周期切换器只列出
配好的那个周期——不会出现一个点了就 502 的「按年付」选项。`lifetime` 是
`one_time` Price，没有周期可选。

### 已有订阅不能再买

本模板的定价模型是「一个用户一份订阅」：重复购买会得到两条并存的订阅、两边同时
扣款，而账单页只能显示一份。这条约束由**两层**共同保证：

**第一层：Stripe 后台**（推荐开启）。在 Stripe 控制台的 `Settings` →
`Checkout and Payment Links` → `Subscriptions` 打开
`Limit customers to 1 subscription`，并把 `Direct customers to manage their
subscription on` 设为 `Your website`、地址填站点的账单页（如
`https://YOUR-DOMAIN.com/dashboard/billing`）。

Stripe 按 **Customer 对象（Session 里带了的那个）或邮箱**匹配已有订阅，因此它挡得住
绕过本站、直接用 Checkout 链接的情况。它判定为「已有订阅」的状态是 `active` /
`past_due` / `unpaid` / `paused`。注意这条设置依赖客户门户的登录链接处于启用状态
（`Billing` → `Customer portal`）：关掉登录链接，限制也会一起失效。

**第二层：应用侧守卫**（本仓实现）。`mode: 'subscription'` 的结账在创建 session
之前按**当前登录用户**查一次库，命中下列任一状态即返回 `409 ALREADY_SUBSCRIBED`：

| 状态 | 为什么挡住 |
|---|---|
| `active` | 正常生效中 |
| `trialing` | 试用期也在占用名额 |
| `past_due` | 扣款失败但订阅仍在——最不该再买一份的时刻 |
| `unpaid` | 重试耗尽仍未付款，订阅未结束 |
| `paused` | 暂停中，恢复后继续扣款 |

`canceled` 与 `incomplete_expired` **不**挡：它们已经结束，用户可以正常重新订阅。

两层都要：Stripe 那层按邮箱 / Customer 匹配，改邮箱就绕过了；应用这层按本站
`userId` 判定，且能给出明确的 409 文案让页面停在定价页解释原因。

换方案走 Stripe Billing Portal（账户页的「管理订阅」），它会把旧订阅折算迁移，不会
多出一份。一次性支付（终身版）不受此限制，买断没有「已有即重复」的概念。

失败返回 502；409 时停留在定价页并提示去管理已有的订阅；配置缺失或网络错误时
退回注册引导。

## 账单页

`/dashboard/billing` 显示：

- 当前订阅（套餐、状态、续费日期与时间、金额、计费周期）
- 付款流水（日期、金额、状态）
- 「管理订阅」按钮 → `DELETE /api/payment` → Stripe Billing Portal（新标签页打开）

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
