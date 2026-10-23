# ADR-0003: 产品配置与互斥判定

- **状态**：Accepted
- **日期**：2026-10-22

## 背景

定价页原先把每个 Price 当成一个「方案」（`pro_monthly` / `pro_yearly` / `lifetime`），
价格锚点（`lookup_key`）放在 env 的 `VITE_STRIPE_LOOKUP_*` 里。这带来三个问题：

1. **「同一产品的不同周期」与「不同产品」无法区分。** `pro_monthly` 与 `pro_yearly`
   是两个方案，`lifetime` 也是第三个，代码里没有任何地方表达「前两个是同一个东西」。
2. **价格锚点漂移。** env 与代码各存一份 lookup key，改价时只改一处就会出现页面上
   显示的价格与 Stripe 实际扣款不符。
3. **没有互斥概念。** 用户先订月付、再买终身版，两条记录并存、两边同时扣款，账单页
   只显示其中一条。

另一个方向的错误同样存在：如果把「已经拥有」当作通用拦截条件，实物类一次性商品就
再也买不了第二件。

## 决策

### 1. 产品是一等概念，付费方式是它的属性

`src/config/products.ts` 声明产品与付费方式：

```ts
const PRODUCT_OPTIONS: Record<string, ProductOption[]> = {
  free: [],
  pro: [
    { kind: 'subscription', interval: 'month', lookupKey: 'pro_monthly' },
    { kind: 'subscription', interval: 'year', lookupKey: 'pro_yearly' },
  ],
  lifetime: [{ kind: 'one_time', interval: 'one_time', lookupKey: 'lifetime' }],
}
```

一个产品对应 Stripe 的一个 **Product**，一个付费方式对应它下面的一个 **Price**。
定价页按产品分卡，切换器在卡内。

### 2. `lookup_key` 写进产品配置，从 env 移除

删掉 `VITE_STRIPE_LOOKUP_*` 与 `websiteConfig.payment.lookupKeyMap`。理由是 env 描述
部署环境，而「这个产品怎么卖」属于产品定义；两处各存一份必然漂移。

### 3. 互斥显式声明，Stripe Product 兜底

```ts
const PRODUCT_EXCLUSIVITY: Record<string, string[]> = {
  lifetime: ['pro'],
}
```

判定优先级（`src/payment/plan-state.ts`）：

1. 同一个 `productId` → 互斥（买断是同一产品的更高档位）；
2. 配置声明了 `exclusiveWith` → 按声明；
3. 否则按 `stripeProductId` 兜底：同一个 Stripe Product 即同一个东西。

没声明即并存——跨产品的两个订阅同时存在是正常业务。

### 4. 唯一性只约束订阅

一次性购买可以有多笔（实物商品买三件就是三单）。结账守卫只在
`mode === 'subscription'` 时生效。

### 5. 买断接管旧订阅

`checkout.session.completed` 与 `customer.subscription.created` 两个方向都判：发现
互斥买断后立即在 Stripe 取消订阅（`prorate: true, invoice_now: true`，按未使用时间
折算退款）。

### 6. 不接 Stripe 权益（Entitlements）

Stripe 的 Entitlements 模型回答的是「这个用户有没有某个功能的权限」。本仓要回答的是
「用户买的是什么」「买的东西之间谁接管谁」——这是**归属**问题，不是权限问题。而功能
门禁恰恰是最不该写进模板的部分：它是每个项目自己的业务规则，预设了反而要花力气拆掉。

因此不接：没有 `entitlements` 表，不订阅
`entitlements.active_entitlement_summary.updated`，`PaymentProvider` 接口上也不暴露
权益查询。需要门禁时直接查本站 `subscriptions` / `payments` 的 `product_id`——语义更
直接，也不给同一件事留第二个数据源。

## 后果

- ✅ 「月付 / 年付 / 终身」的语义在代码里可表达，定价页与账单页都按产品组织
- ✅ 改价只动 Stripe 与产品配置，不碰 env，也不需要重新部署前端逻辑
- ✅ 实物类一次性商品可以正常多单购买
- ✅ 配置写错（重复 lookup key、互斥指向不存在的产品）会被
  `getServiceStatuses()` 在自检里报出来
- ✅ 只有一处事实来源：归属看本站表，不与 Stripe 的 feature 体系对账
- ⚠️ 跨产品的互斥需要人工声明；漏写时按 Stripe Product 兜底，两个不同的 Stripe
  Product 就真的并存
- ⚠️ 买断接管订阅会**立即**取消并退款，属于不可逆动作。判据保守（缺 productId 且缺
  stripeProductId 时不接管），但一旦判定成立就立即执行

## 相关

- `src/config/products.ts`——产品与互斥声明
- `src/payment/plan-state.ts`——判定规则（纯函数）
- `src/routes/api/webhooks/stripe.ts`——接管动作的执行
- `content/docs/payment.zh.md`——面向使用者的说明
