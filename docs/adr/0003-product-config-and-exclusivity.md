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

### 3. 产品有等级，等级推导互斥

```ts
const PRODUCT_TIERS: Record<string, number> = {
  free: 0,
  pro: 1,
  lifetime: 2,
}
```

**等级是权限高低，与「怎么付钱」无关**：月付与年付都是 `pro`（同一档位、两种周期），
`lifetime` 是更高的一档。

**不同等级 → 互斥；同等级 → 并存。** 于是 `lifetime` 与 `pro` 自动互斥，不必再显式
声明一次——同一个事实写两遍，加新产品时必然漏改一处。

显式的 `PRODUCT_EXCLUSIVITY` 只留给**没有等级**的产品：实物商品这类「不参与等级
比较」的东西，只能靠声明表达「不能与某个订阅同时持有」。

```ts
const PRODUCT_EXCLUSIVITY: Record<string, string[]> = {
  merch: ['pro'],
}
```

判定优先级（`src/payment/plan-state.ts`）：

1. 同一个 `productId` → 同一档位，取更晚的一份；
2. 等级高 → 取代低；
3. 等级不可比 → 配置显式声明；
4. 否则按 `stripeProductId` 兜底：同一个 Stripe Product 即同一个东西。

没声明即并存——同等级的两个订阅同时存在是正常业务。

### 4. 唯一性只约束订阅

一次性购买可以有多笔（实物商品买三件就是三单）。结账守卫只在
`mode === 'subscription'` 时生效。

### 5. 买断接管旧订阅

`checkout.session.completed` 与 `customer.subscription.created` 两个方向都判：发现
互斥买断后立即在 Stripe 取消订阅（`prorate: true, invoice_now: true`，按未使用时间
折算退款）。

### 6. 等级的三条规则

等级一条规则解决三件事（`src/payment/plan-state.ts` 里的纯函数）：

1. **当前方案唯一**——持有物里等级最高的那个就是「当前生效的方案」
   （`resolveCurrentPlan`）；同级并列时返回 `null`，因为没有唯一答案。
   账单页因此只标**一个**「当前生效」。
2. **高级别替换低级别**——买更高级的会让低级的失效：旧订阅被停掉并按比例退款
   （`isSubscriptionSuperseded` / `findSupersededSubscriptions`）。判定与账单页
   显示的「已被取代」用同一个函数，不会出现「页面说已取代、Stripe 上还在扣款」。
3. **降级被挡**——已持有更高等级时再买低级别的直接拒绝，并给出具体原因
   （`purchaseBlockedBy` → `ALREADY_OWNED_HIGHER_TIER`）。守卫还会区分同产品重复
   （`ALREADY_SUBSCRIBED`）、显式互斥（`ALREADY_OWNED_EXCLUSIVE_PRODUCT`）与查不出
   归属的老数据（`ALREADY_OWNED_UNKNOWN_PRODUCT`，保守挡住）。

一次性购买仍可有多笔（实物买三件就是三单），唯一性只约束订阅。

### 7. 不接 Stripe 权益（Entitlements）

Stripe 的 Entitlements 模型回答的是「这个用户有没有某个功能的权限」。本仓要回答的是
「用户买的是什么」「买的东西之间谁接管谁」——这是**归属**问题，不是权限问题。而功能
门禁恰恰是最不该写进模板的部分：它是每个项目自己的业务规则，预设了反而要花力气拆掉。

因此不接：没有 `entitlements` 表，不订阅
`entitlements.active_entitlement_summary.updated`，`PaymentProvider` 接口上也不暴露
权益查询。需要门禁时直接查本站 `subscriptions` / `payments` 的 `product_id`——语义更
直接，也不给同一件事留第二个数据源。

### 8. 账号级唯一订阅与站内切换

唯一性的作用域从「产品」提升到「**账号**」：**一个账号最多一份活跃订阅**。

这是从「同一产品的不同周期算几份」这个问题出发的：月付与年付是同一份订阅的两个
价，若按产品判定，一份订阅在不同周期下会被算成两份，用户可以在月付与年付之间反复
横跳，两边同时扣款。提升到账号级后，这个歧义消失：换档位、换周期都**不新开订阅**，
而是改**现有那份**订阅的价格（Stripe 的 `subscriptions.update`，替换订阅项的
`price`）。

关键细节：换价**必须带 `items[0].id`**。漏了它，Stripe 会**新增**一个订阅项而不是替换
——旧价与新价同时生效、两份都扣款。这是切换路径最容易踩的坑，所以 provider 在
`itemId` 为空时直接抛错，不猜；订阅项 id 本地不存，切换时先读一次 Stripe。

结账守卫相应改成：**已有任何活跃订阅 → 409**（载荷带上切换方向），页面把人引到账单
页的「切换方案」区块。买断不占订阅名额，它与订阅的冲突仍由 `purchaseBlockedBy` 单独
判定（尤其是「持有更高档买断时不能再切订阅」——否则切换后 webhook 会立刻把这条
订阅接管掉，用户会看到「刚切完就没了」）。

唯一性**不建数据库索引**：webhook 的 INSERT（新建活跃行）先于把旧行改成 `canceled`
的 UPDATE，索引存在时 INSERT 直接违反约束 → webhook 抛错 → Stripe 无限重投 → 正常
流程被卡死。唯一性只在应用层保证。

代价：「我的方案」看不到切换历史——切换就地覆盖订阅行，不新建行也不取消旧行；历史
只留在交易记录里。

### 9. 降级的周期末语义

降级**期末生效**：本期仍享受高档权益，到期后按低档续费。Stripe 侧用
`proration_behavior: 'none'` 实现——本期已付金额不变，新价从下一张账单起算。

代价是 Stripe 上的价格**立刻**变成新价，而用户此刻仍在按旧价扣款。若照单全收
`customer.subscription.updated`，本地行会显示新（低）价，账单页就会说谎。因此
`subscriptions` 表另记 7 个 `pending_*` 列，约定：**当前列 = 用户此刻正在付的价**，
pending 列 = 周期末要切到的。晋升有两条入口（续费发票付清、周期翻页），互为兜底，
事件顺序无关。

还有一个折算基准的陷阱：降级请求后 Stripe 上的价格已经是低价，若此时直接升级，
`always_invoice` 会拿低价做基准算差额 → 少收钱。因此「降级后立刻升级」必须**先恢复**
（把 Stripe 价格拉回用户实付的档位，`none`，不动钱）**再应用**目标价
（`always_invoice`）。两步之间 Stripe 连发两个事件，而投递顺序不保证，所以 webhook
在「事件带来的价与本地不符」时会先读一次 Stripe，以它上面的当前状态为准。

## 后果

- ✅ 「月付 / 年付 / 终身」的语义在代码里可表达，定价页与账单页都按产品组织
- ✅ 改价只动 Stripe 与产品配置，不碰 env，也不需要重新部署前端逻辑
- ✅ 实物类一次性商品可以正常多单购买
- ✅ 配置写错（重复 lookup key、互斥指向不存在的产品、等级指向不存在的产品）会被
  `getServiceStatuses()` 在自检里报出来
- ✅ 只有一处事实来源：归属看本站表，不与 Stripe 的 feature 体系对账
- ⚠️ 跨产品的互斥由等级自动推导；**没有等级**的产品（实物商品）仍需人工声明，漏写
  时按 Stripe Product 兜底，两个不同的 Stripe Product 就真的并存
- ✅ 一个账号最多一份活跃订阅，换档位 / 换周期在站内完成，不会重复扣款
- ⚠️ Stripe 后台的「一个客户一个订阅」是**全局**设置。现在站内切换走
  `subscriptions.update`、不经 Checkout，它挡不到升级，却会挡掉「客户在别处本来就有
  订阅」的情形——**建议关掉**，唯一性由应用层守卫负责
- ⚠️ 降级期间 Stripe 后台显示的是**新价**，本站显示的是**旧价**（用户真正在付的）。
  两者不一致是有意的：降级期末生效，账单页必须说用户此刻在付什么
- ⚠️ 「先恢复再应用」之后立刻升级会多一次 Stripe 调用，且期间会连发两个事件；
  webhook 靠「读一次 Stripe 核对」来抵御乱序投递
- ⚠️ 买断接管订阅会**立即**取消并退款，属于不可逆动作。判据保守（缺 productId 且缺
  stripeProductId 时不接管），但一旦判定成立就立即执行

## 相关

- `src/config/products.ts`——产品、等级与互斥声明
- `src/payment/plan-state.ts`——判定规则（纯函数）
- `src/routes/api/payment/switch.ts`——切换端点（改现有订阅的价格）
- `src/routes/api/webhooks/stripe.ts`——接管动作的执行与待生效变更的晋升
- `content/docs/payment.zh.md`——面向使用者的说明
