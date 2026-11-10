---
title: 支付总览
description: 套餐声明、买家流程与账单页
locale: zh
order: 13
group: payment
updated: 2026-11-10
---

套餐在 `src/config/products.ts` 声明一次，收款方式二选一：托管 provider（Stripe 或 Creem）托管整个付款流程，或收款码核销（个人二维码 + 人工核验）。两条链路互斥，由 `VITE_CHECKOUT_MODE` 切换，站内不存渠道价格：托管链路的金额读 provider 的价格目录，核销链路的金额在商品配置的 `collectionPrices`。

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
}
```

- `id` 是本站套餐标识。
- `prices` 的键是**本站购买选项 ID**（如 `monthly`），值是**销售引用**，由 provider 解释：

| provider | 销售引用的含义 |
|---|---|
| Stripe | Price 的 `lookup_key` |
| Creem | 本站自定义引用，用 `CREEM_PRODUCTS` 映射到 `prod_*` 商品 ID |

- `prices` 为空表示免费套餐：卡片仍渲染按钮，但走注册或进控制台，不进结账。
- `recommended` 可选；数组顺序就是展示顺序。
- 文案在函数调用时求值，不在模块顶层调用 `m.*()`。

provider 由 `websiteConfig.payment.provider` 选，可用环境变量 `VITE_PAYMENT_PROVIDER` 在部署时切换，不用改代码。

## 买家流程

1. 买家在首页 `#pricing` 区块看到价格与购买按钮；该区块卖的是 `websiteConfig.landingOffer` 指向的那个商品与购买方式。想卖多套餐，改 `src/config/products.ts` 的套餐列表，并用 `src/components/sections/Pricing.tsx` 的 `Pricing` 组件渲染卡片（每个套餐内切换月付 / 年付 / 买断），把 `renderCta` 接到 `startCheckout` 上。
2. 未登录会先跳登录页，登录后回到价格区再点一次购买。
3. 客户端提交 `productId`、`offerId` 与回跳地址；服务端鉴权、限流、校验回跳地址同源，再按 provider 建托管结账会话。
4. 浏览器跳到 provider 的付款页；付款完成回到 `/dashboard/billing?checkout=success`，取消回到发起购买的那一页。
5. 权益由 provider 的 webhook 确认后写入——回跳页本身不发权益。

一个账号最多保留一份**未终止**的订阅（`active`、`trialing`、`past_due`、`unpaid`、`paused`、`incomplete` 都算）。已安排期末取消的订阅在到期前仍占名额。一次性商品可以重复买，也能与订阅并存，不会取消或接管已有订阅。

## 账单页

`/dashboard/billing` 显示：

- 当前订阅：套餐名、状态、金额与周期、续费或结束日期；
- 历史订阅；
- 支付记录：日期、套餐、金额、状态，部分退款单独标出。

「管理订阅」按钮把用户送到 provider 的自助 Portal（取消续费、换支付方式、发票都在那边）。客户 ID 由服务端按登录用户查，客户端不能指定别人的。

接着读：[Stripe](./payment-stripe)、[Creem](./payment-creem) 或 [收款码核销](./payment-collection)。
