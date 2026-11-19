---
title: Stripe
description: Stripe 商品、结账与 webhook 接入
locale: zh
order: 14
group: payment
updated: 2026-11-19
---

Stripe 侧的金额、订阅与付款页面都在 Stripe 平台上，站内只声明套餐并保留 `lookup_key`。

## 步骤

1. 在 Stripe 后台建商品与价格。订阅建 recurring 价格，买断建一次性价格；**每个价格填一个 `lookup_key`**，值与 `src/config/products.ts` 里 `prices` 的右侧一致（`pro_monthly`、`pro_yearly` 等）。
2. 在后台「系统设置 → 支付」里选渠道 `stripe`，并在 Stripe 分组填 Secret key 与 Webhook secret。
   两个密钥加密入库，只回显末四位；保存即生效。
3. 在 Stripe Dashboard → Developers → Webhooks 添加端点 `<站点域名>/api/webhooks/stripe`，
   把 Signing secret 填回后台的 Webhook secret 字段。
4. 在端点的事件列表里勾选下面这些事件。

## 必须订阅的事件

漏勾任何一个，对应的记录就永远写不进来。

| 事件 | 作用 |
|---|---|
| `checkout.session.completed` | 结账上下文，一次性付款的归属信息在这里 |
| `checkout.session.async_payment_succeeded` | 延迟付款方式的实际到账 |
| `customer.subscription.created` / `updated` / `deleted` | 订阅生命周期 |
| `invoice.paid` | **支付成功的权威事件** |
| `invoice.payment_failed` | 扣款失败，不授予权益 |
| `charge.refunded` | 退款 |

`invoice.paid` 是权威来源：Stripe 不保证事件顺序，端点也可能只投递 `invoice.*`，所以付款记录不能只依赖 `checkout.session.completed`。一次性支付同样会开票，归属写在发票的 metadata 上，发票事件单独到达时据此定位用户。

端点在 `STRIPE_SECRET_KEY` 或 `STRIPE_WEBHOOK_SECRET` 缺失时返回 503；签名不合法返回 400，签名合法但处理失败返回 500，Stripe 会重投。

## 买家入口

- 付款：首页 `#pricing` 的购买按钮 → 服务端建 Checkout Session → 跳转 Stripe 托管的付款页 → 付款完成回到 `/settings/billing`。
- 管理：账单页的「管理订阅」按钮 → Stripe Customer Portal，换支付方式、下发票都在那里。Portal 里能不能切换套餐由 Stripe 后台配置决定。
- 取消：站内「取消订阅」按钮调 `subscriptions.update(id, { cancel_at_period_end: true })`，**期末生效**，本周期内仍有效。
- 退款：后台「付款」页（`/admin/payments`）对 Stripe 行按 PaymentIntent 发起全额退款（`refunds.create({ payment_intent })`，带幂等键），`charge.refunded` 回传后对账。

## 价格目录与改价

展示价来自 Stripe 的 Price，按 `lookup_key` 批量查，只取 `active` 的价格；结果在服务端缓存 60 秒，缓存键带 provider 与引用集合，改 env 后自动失效。

改价不用改代码：在 Stripe 后台新建一个价格，把 `lookup_key` 迁到新价格上（旧价格停用），页面与代码都不用动。

## 验证

- 后台保存后，服务状态里 `payment` 一项显示 `configured`。
- Stripe Dashboard 的 Webhooks 页能看到端点投递记录（`200` 即签名校验通过）。
