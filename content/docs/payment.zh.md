---
title: 支付
description: 套餐配置、托管购买与账单管理
locale: zh
order: 14
group: features
updated: 2026-10-28
---

站点通过 `websiteConfig.payment.provider` 选择一个支付服务商。当前内置 Stripe，用户无需在付款时选择服务商。

## 配置套餐

只编辑 `src/config/products.ts` 的 `getProducts()`：

```ts
{
  id: 'pro',
  name: m.pricing_pro_name(),
  description: m.pricing_pro_description(),
  features: [m.pricing_pro_feature_1()],
  recommended: true,
  prices: {
    monthly: 'pro_monthly',
    yearly: 'pro_yearly',
  },
}
```

- `id` 是本站套餐标识，`prices` 左侧是本站购买选项 ID。
- Stripe 下右侧填写 Price 的 `lookup_key`。不同套餐创建不同 Product，同套餐不同周期使用多个 Price。
- 金额、币种和实际计费周期从服务商读取并缓存；选项名称不会决定扣款周期。
- 空 `prices` 表示免费套餐，按钮进入注册或工作台。
- `recommended` 可省略，数组顺序就是展示顺序；无需设置 CTA、等级或互斥。
- 文案在函数调用时求值，不在模块顶层调用 `m.*()`。

重复产品 ID、重复或空销售引用由配置自检报告。无法取到价格时不允许购买，不会把用户误送到注册页。价格缓存按 provider 和引用集合隔离，默认 10 分钟；Stripe 改价可把原 lookup key 迁移到新 Price。

## 购买与订阅规则

客户端只提交 `productId` 和 `offerId`；服务端鉴权、限流、校验回跳同源并解析真实价格，再创建 Stripe 托管 Checkout。登录后回定价页恢复选项，用户再次点击购买。

一个账号全局最多一份尚未终止的订阅：`active`、`trialing`、`past_due`、`unpaid`、`paused`、`incomplete` 占用名额。取消续费但尚未到期仍占用；`canceled`、`incomplete_expired` 允许重新购买。已有订阅时引导到账单页管理。

订阅结账使用本地预留和稳定幂等键；重复请求复用尚未完成的 Checkout，避免多标签页创建两份订阅。有效 Checkout 存在时同一选项继续该会话；改选其他选项返回明确冲突提示，需返回原选项或等会话失效。历史订阅事件不会释放新预留。释放前先查询服务商会话状态：已完成会话同步真实订阅，确认终止后才允许重购；本地过期不能直接视为未付款。远端状态不可用时保留预留，避免重复购买。创建响应丢失时使用原请求、幂等键和固定过期时间恢复。

独立一次性商品可以另外购买、重复购买，不接管、不取消已有订阅。默认示例中的一次性商品没有“比订阅等级更高”的含义。

## 账单与 Portal

`/dashboard/billing` 显示有效订阅、价格周期、状态、续费或结束日期、历史订阅与交易记录。部分退款独立显示退款金额。

管理入口由服务端根据当前用户的订阅或支付记录确定客户 ID；客户端不能指定其他客户。仅购买过一次性商品也可进入 Portal。

取消续费、支付方式和发票交给服务商 Portal。站内不实现套餐切换、补差价、降级调度或买断接管。Stripe Portal 可在后台开放套餐切换，具体能力以后台配置为准；Webhook 会按实际价格同步归属。接入其他服务商时，不应假设 Portal 能力完全一致。

## Webhook

Stripe 端点是 `/api/webhooks/stripe`。保留原始 body 并异步验签，适配器转换为通用 `PaymentEvent`，`src/payment/events.ts` 负责落库。

需要处理 Checkout 完成和异步付款成功、订阅生命周期、`invoice.paid`、`invoice.payment_failed`、`charge.refunded`。尚未支付的异步订单不会提前记为已付；订阅创建、更新或发票事件会读取最新订阅状态抵御乱序。支付回跳页不授予权益。

事件按 provider + event ID 去重，交易按 provider + 业务交易 ID 幂等。处理失败返回 500 供服务商重投；退款事件若早于付款同步到达，也等待重投。部分退款保留原付款金额及累计退款金额。多笔发票付款按实际金额分别记录，退款关联到对应付款。订阅快照用版本比较写入；并发冲突重新读取服务商状态。启用通知后，首次付款成功保留运营通知。

付款成功回跳只显示提示，不依据查询参数发送收入统计；需要分析收入时应使用已验证交易作为来源。

## 扩展支付服务商

新增服务商需要实现 `src/payment/types.ts` 的 `PaymentProvider`，注册 provider、补齐 env 校验并提供自己的 Webhook 路由。适配器解释 `prices` 引用，归一化价格、订阅快照和支付事件，共用页面与落库逻辑。

例如 Creem 可把引用解释为 Product ID，而 Stripe 把它解释为 lookup key。本模板仅实现 Stripe，未内置 Creem，也不提供现有订阅跨服务商迁移。

## 数据库调整

`0008_payment_simplification.sql` 移除站内切换专用字段并增加结账预留。先审查迁移；生产应用需要另行授权。本次不转换历史支付数据、不自动清库。新增模板实例应从空数据库完整应用迁移；历史生产数据库不在此次兼容范围。
