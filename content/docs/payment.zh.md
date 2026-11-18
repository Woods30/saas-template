---
title: 支付总览
description: 套餐声明、买家流程、取消退款与账单页
locale: zh
order: 13
group: payment
updated: 2026-11-19
---

套餐在 `src/config/products.ts` 声明一次，provider（Stripe 或 Creem）决定怎么收款。站内不存金额：展示价与扣款价都读 provider 的价格目录。

## 套餐配置

只改 `src/config/products.ts` 的 `getProducts()`：

```ts
{
  id: 'pro',
  name: m.pricing_pro_name(),
  description: m.pricing_pro_description(),
  features: [m.pricing_pro_feature_1()],
  recommended: true,
  prices: { monthly: 'pro_monthly', yearly: 'pro_yearly' },
  // 成功付款后发放的积分；键与 prices 一致。
  credits: {
    monthly: { amount: 1000, durationDays: 31 },
    yearly: { amount: 12_000, durationDays: 366 },
  },
}
```

- `id` 是本站套餐标识。
- `prices` 的键是**本站购买选项 ID**（如 `monthly`），值是**销售引用**，由 provider 解释：

| provider | 销售引用的含义 |
|---|---|
| Stripe | Price 的 `lookup_key` |
| Creem | 本站自定义引用，用 `CREEM_PRODUCTS` 映射到 `prod_*` 商品 ID |

- `prices` 为空表示免费套餐：卡片仍渲染按钮，但走注册或进控制台，不进结账。
- `credits` 声明每种付费方式成功后发放多少积分、有效期多少天（不写则永不过期）。
  订阅每次续费都按同一份配置再发一次；退款时按比例反扣。
- `recommended` 可选；数组顺序就是展示顺序。
- 文案在函数调用时求值，不在模块顶层调用 `m.*()`。

provider 在后台「系统设置 → 支付」里选（`stripe` / `creem`），保存即生效，不用重新部署。

## 买家流程

1. 买家在首页 `#pricing` 区块看到价格与购买按钮；该区块卖的是 `websiteConfig.landingOffer` 指向的那个商品与购买方式。想卖多套餐，改 `src/config/products.ts` 的套餐列表，并用 `src/blocks/pricing.tsx` 的 `Pricing` 组件渲染卡片（每个套餐内切换月付 / 年付 / 买断），把 `renderCta` 接到 `startCheckout` 上。
2. 未登录会先跳登录页，登录后回到价格区再点一次购买。
3. 客户端提交 `productId`、`offerId` 与回跳地址；服务端鉴权、限流、校验回跳地址同源，再按 provider 建托管结账会话。
4. 浏览器跳到 provider 的付款页；付款完成回到 `/settings/billing?checkout=success`，取消回到发起购买的那一页。
5. 积分由 provider 的 webhook 确认付款后发放——回跳页本身不发积分。

一个账号最多保留一份**未终止**的订阅（`active`、`trialing`、`past_due`、`unpaid`、`paused`、`incomplete` 都算）。已安排期末取消的订阅在到期前仍占名额。一次性商品可以重复买，也能与订阅并存，不会取消或接管已有订阅。

## 账单页

`/settings/billing` 显示：

- 当前订阅：套餐名、状态、金额与周期、续费或结束日期；
- 历史订阅；
- 支付记录：日期、套餐、金额、状态，部分退款单独标出。

「管理订阅」按钮把用户送到 provider 的自助 Portal（换支付方式、发票都在那边）。客户 ID
由服务端按登录用户查，客户端不能指定别人的。

「取消订阅」按钮走站内接口，**期末生效**：本计费周期内仍可正常使用，到期不再续费。
Stripe 用 `cancel_at_period_end`，Creem 用 `mode: scheduled`。核销型收款没有渠道订阅，
不显示该按钮。

## 退款与反扣

后台「订单」页可以对已支付订单发起**全额退款**（权限点 `payments.refund`，默认
`admin` 角色持有）：

1. 先用条件状态转移把订单抢成 `refunding`，并发重复点击只会有一个成功；
2. 调 provider 退款：Stripe 按 PaymentIntent，Creem 按交易号（Creem 只支持全额）；
3. 成功后写 `refunded` / `partially_refunded`，并反扣**该订单开出的积分批次**；
4. 渠道失败时订单恢复原状态，可以重试；每次成功都写审计日志。

反扣只扣到 0 为止：积分已经被消费时不会把余额打成负数，流水里记录应扣、实际扣减与
差额。渠道侧的最终到账以 webhook 为准，后台先按「已受理」落库。

接着读：[Stripe](./payment-stripe) 或 [Creem](./payment-creem)。
