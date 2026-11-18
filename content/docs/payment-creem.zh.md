---
title: Creem
description: Creem 商品映射、沙箱联调与 webhook 接入
locale: zh
order: 15
group: payment
updated: 2026-11-03
---

Creem 是 Merchant of Record：以自己名义收款、处理税费与退款，站点拿到的是净额。订阅与一次性付款都支持。

## 步骤

1. 在 Creem 后台建商品：订阅用 recurring 商品（按月 / 按年各建一个），买断用 one-time 商品。
2. 在后台「系统设置 → 支付」里选渠道 `creem`，并在 Creem 分组填 API key、Webhook secret 与商品映射：

   ```text
   pro_monthly=prod_xxx,pro_yearly=prod_yyy,lifetime=prod_zzz
   ```

   左边是 `src/config/products.ts` 里 `prices` 的右侧引用，右边是 Creem 的商品 ID（`prod_*`），
   逗号分隔。同一个引用只能映射一个商品 ID。密钥加密入库，保存即生效。

3. 在 Creem 后台添加 webhook 端点 `<站点域名>/api/webhooks/creem`，签名密钥填回后台的
   Webhook secret 字段，并订阅下面这些事件。

端点只在当前渠道是 Creem 时才响应：站点选的是别的渠道时该地址返回 404，Creem 会停止重试。

## 事件

| 事件 | 作用 |
|---|---|
| `checkout.completed` | 结账完成；一次性付款的订单在这里记录 |
| `subscription.paid` | **订阅付款的权威事件**，首笔与每次续费都会发 |
| `subscription.*` | 订阅生命周期，`scheduled_cancel` 归一化为「有效但期末取消」 |

请求头 `creem-signature` 是请求原文的 HMAC-SHA256 十六进制串，签名不合法返回 400。归属写在 checkout 的 `metadata.userId` / `productId` / `offerId` 上，订阅自带 metadata 时优先用它；两者都缺失时写入失败并让 Creem 重试，不会把付款记到猜出来的用户身上。

## 沙箱联调

`CREEM_DEBUG=true` 时请求打到沙箱地址 `test-api.creem.io`（生产是 `api.creem.io`）。联调用沙箱的 API key（`creem_test_` 开头）与沙箱商品 ID；上线前改回 `false`，换成生产 key 与生产商品 ID。

## 与 Stripe 的差异

| 维度 | Creem | Stripe |
|---|---|---|
| 商品与价格 | 商品即价格，没有 lookup key，结账传 `product_id` | Price 与 Product 分开，靠 `lookup_key` 关联 |
| 取价 | 逐个 `GET /v1/products/{id}` 读取 | 按 lookup key 批量查 Prices |
| 取消回跳 | 没有 `cancel_url`，取消只能回 Creem 自己的页面 | 有 `cancel_url`，回到发起购买的页面 |
| 金额 | 税前价，结账页会加税，展示价与实付可能不同 | 展示价即实付 |
| 订阅状态 | `expired` 记为 `past_due`（仍可恢复），未知状态记为 `incomplete`，暂不授予权益 | 状态直接取自 Stripe |
| 取消 | `POST /v1/subscriptions/{id}/cancel`，`mode: scheduled` 期末生效 | `cancel_at_period_end: true` |
| 退款 | 后台订单页可退，`POST /v1/refunds` 按交易号，**只支持全额** | 后台订单页可退，按 PaymentIntent，支持部分退款 |

已有的订阅不会随渠道切换迁移：换渠道等于换收款主体，存量要自己处理。

## 验证

- 后台保存后，服务状态里 `payment` 一项显示 `configured`。
- Creem 后台的 webhook 记录里能看到本站发起的投递（返回 `200` 即签名校验通过）。
