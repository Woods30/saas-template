---
title: 支付
description: Stripe 结账、定价页映射、账单页与 Webhook
locale: zh
order: 14
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

失败返回 502；409 时停留在定价页并用 toast 提示去管理已有的订阅；配置缺失或网络
错误时退回注册引导。

结账结果（成功 / 取消 / 重复订阅）统一走 toast，而不是页面里的一行字：这三条都在
**跳转或点击之后**出现，行内提示很容易落在视口外。成功回跳落在账单页
（`?checkout=success`），取消回跳落在定价页（`?checkout=cancelled`），两处都在展示
后立刻用 `replace` 清掉查询参数，避免刷新时重复弹同一条。

## 账单页

`/dashboard/billing` 分两个区块：

- **当前订阅**——一行一张订阅卡，而不是表格行：套餐名（Price id 反查映射）、状态、
  价格与计费周期、下次续费的具体时刻都在卡内一屏看完，管理入口也在卡上。这份数据
  一页通常只有一条，横向四列对不上表头，用表格没有信息密度收益。
- **交易记录**——表格（保留表头）。第一列标示这笔钱的性质（订阅扣款 / 一次性
  购买），第二列日期，第三列状态徽章加金额。

状态词表两套，不能互用：「当前订阅」走订阅状态（生效中 / 逾期 / 试用中 / 已取消），
「交易记录」走付款状态（已支付 / 已退款）。两者的取值域不同——`payments.status` 只有
`paid` 与 `refunded`，复用订阅文案会让每笔付款都显示成「生效中」。

计费周期同理：只有 `one_time` 才显示「终身」。`checkout.session.completed` 先插入订阅
行（此时 `interval` 尚未写入），周期要等 `customer.subscription.created` 才补齐；空值
**只显示金额、不显示周期**，不冒充买断版。曾在这里渲染过「周期待同步」，但那是 webhook
时序的后端细节，用户读不懂也无从行动，不如不说。

「管理订阅」按钮 → `DELETE /api/payment` → Stripe Billing Portal（新标签页打开）。

服务端从数据库反查当前用户的 `customerId`（不接受客户端传入），因此不存在越权打开
他人账单门户的问题。订阅与流水的查询都按 `userId` 走索引。

## 免费档按钮的去向

定价页免费档没有 Price，按钮去向按**会话状态**分叉：

| 状态 | 去向 |
|---|---|
| 未登录 | `/auth/register`，带上 `?plan=free` |
| 已登录 | `/dashboard`（自身再重定向到 `/dashboard/profile`） |

已登录用户点「免费开始」曾一路被送去注册页——他们已经有账号，再注册只会拿到「该
邮箱已注册」的错误。会话在路由的 `loader` 里用 `fetchSession()`（server function）读，
而不是客户端的 `useSession()`：后者在 SSR 首帧是 pending，按钮文字会先渲染「免费开始」
再在水合后跳成「进入工作台」，用户看到一次闪烁。

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
