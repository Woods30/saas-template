---
title: 支付
description: 产品配置、Stripe 结账、账单页与 Webhook
locale: zh
order: 14
group: features
updated: 2026-10-22
---

当前唯一内置的 provider 是 **Stripe**，但支付链路以 `PaymentProvider` 接口为边界
（`src/payment/types.ts`），新增 Creem / Waffo 时只需实现该接口并在
`buildPaymentProviderRegistry` 注册——**结账与门户的页面、API 路由、数据表都不需要改**。

不过 **webhook 的业务处理不在接口内**：事件落库的那段逻辑写在 Stripe 专用的
`src/routes/api/webhooks/stripe.ts` 里（`handleCheckoutCompleted` / `handleInvoicePaid` /
`handleSubscriptionUpsert`），换 provider 要另写一份自己的 webhook 路由，并把这段
落库逻辑按 provider 抽出去。

provider 注册只需要 `STRIPE_SECRET_KEY`：`STRIPE_WEBHOOK_SECRET` 是**验签**用的，
取价（列表、创建 Checkout）不需要它。webhook 端点自己守卫这两个变量。

## 先分清「产品」与「付费方式」

本仓把「卖什么」与「怎么卖」分成两层，对齐 Stripe 的模型：

| 本站概念 | Stripe 概念 | 例子 |
|---|---|---|
| **产品**（`productId`） | Product | 专业版、终身版 |
| **付费方式**（`options`） | Price | 月付、年付、一次性买断 |

于是「专业版的月付和年付」是**同一个产品的两种付费方式**，不是两个方案；「终身版」
是另一个产品，天然与专业版不同。定价页按产品分卡，卡内切换该产品自己的付费方式。

这个区分是后面所有判定（谁接管谁、买什么算同一件事）的基础。

## 产品配置

产品在 `src/config/products.ts` 里配。它是「页面 ↔ 价格」的唯一锚点：

```ts
const PRODUCT_OPTIONS: Record<string, ProductOption[]> = {
  free: [], // 免费档不卖：按钮走注册而不是结账
  pro: [
    { kind: 'subscription', interval: 'month', lookupKey: 'pro_monthly' },
    { kind: 'subscription', interval: 'year', lookupKey: 'pro_yearly' },
  ],
  lifetime: [{ kind: 'one_time', interval: 'one_time', lookupKey: 'lifetime' }],
}

// 等级：权限高低，数字越大越高。lifetime > pro > free。
const PRODUCT_TIERS: Record<string, number> = {
  free: 0,
  pro: 1,
  lifetime: 2,
}

// 显式互斥：只留给**没有等级**的产品（实物商品之类）。
const PRODUCT_EXCLUSIVITY: Record<string, string[]> = {}
```

配置分两层：

- **结构层**（`PRODUCT_OPTIONS` / `PRODUCT_TIERS` / `PRODUCT_EXCLUSIVITY`）不依赖语言，
  诊断脚本、服务端任务与单测都能直接读；
- **文案层**（`getProducts()`）在渲染时求值，随请求语言变化。写成模块级常量会把首次
  请求的语言固化给后续请求（SSR 下表现为整页语言不对 + hydration mismatch）。

### 为什么 lookup_key 不放 env

`lookup_key` 是 Price 的稳定对外名，改价时把 key 迁到新 Price 上
（`transfer_lookup_key=true`），页面与代码都不用动；Price ID 一换就得改代码重新部署，
且极易与后台配置漂移。Stripe 官方对这件事有明确建议：

> If these prices are hard-coded and you want to change them, the process is often
> manual and requires you to deploy new code. To better manage these scenarios, you can
> use the `lookup_key` attribute on the Price object.
>
> —— [Manage prices](https://docs.stripe.com/products-prices/manage-prices)

它**曾经**放在 env（`VITE_STRIPE_LOOKUP_*`），现在收进产品配置：env 与代码两处各存
一份必然漂移——改价时只改了一处，页面上就会出现对不上的价格。而 env 是「部署环境」的
概念，价格锚点是「这个产品怎么卖」的概念，后者属于产品配置。

取值链路：

```text
src/config/products.ts  →  lookup_key  →  Prices API（服务端，KV 缓存 10 分钟）
                                                ├→ 定价页展示价
                                                └→ /api/payment 解析出的 Price id
```

官方也提醒取价要加缓存层（"To improve performance, you might want to add a caching
layer to only reload the price occasionally"），否则每次渲染都打一次 Stripe API。
缓存 key 里带 lookup key 列表，改配置后自动失效。

先在 Stripe 后台给每个 Price 填上 `lookup_key`（Dashboard → Products → 对应 Price →
Advanced → Lookup key），再把同样的值写进 `src/config/products.ts`。两边对不上时定价页
取不到价，`getServiceStatuses()` 也会把它报为 `incomplete`。

未配置 key 时定价页仍然可看，付费产品的按钮退化为「先注册」，不会给用户一个点了就
502 的按钮。

## 结账流程

1. 定价页点击产品 → `startCheckout()`（`src/payment/checkout-client.ts`）
2. 未登录 → 跳登录页并带 `?redirect=/pricing`，登录后回到定价页继续
3. 已登录 → `POST /api/payment`：门禁 → 会话鉴权 → 限流（每 IP 每分钟 10 次）
   → body 校验 → **按产品 + 周期解析价格** → **回跳地址同源校验** → **重复订阅检查**
   → 创建 Checkout Session
4. 成功后整页跳转到 Stripe Checkout
5. 完成后回到 `/dashboard/billing?checkout=success`，账单页显示方案与流水

客户端只传 `productId` + `interval`，**不传 Price id**：服务端按 lookup key 解析出
Price，客户端既改不了价格，也选不了别的 Price——比「白名单校验 priceId」更难绕过。

### 回跳地址必须同源

客户端传的 `successUrl` / `cancelUrl`（以及门户的 `returnUrl`）会被**原样交给
Stripe**——Stripe 结账结束后就是把用户送到这个地址。不校验等于把「付款后跳到
哪里」的决定权交给客户端，是开放重定向：攻击者可以让受害者付完款后落在仿冒页上
继续骗取信息。

服务端因此用 `safeSameOriginUrl`（`src/lib/urls.ts`）把关，只放行**与站点同源的绝对
地址**：origin 必须等于 `VITE_BASE_URL` 的 origin。相对路径也不接受——Stripe 会把它
解析到自己账号配置的域名下，本站控制不了解析结果。

白名单**只来自配置**，不把请求自身的 origin 算进来：`request.url` 的 host 取自 Host
头，客户端可以自造。攻击者带上 `Host: evil.com` 就能让外域 URL 通过校验，再把
对应的 Checkout 链接发给受害者——受害者在 Stripe 上付完款就被送到钓鱼页。要放行
别的域名，得显式写进配置，不能靠请求头。

同一个模块里的 `safeInternalPath` 管的是另一类输入（登录回跳等站内相对路径），两者
分工不同，不要混用。

### 月付 / 年付怎么选

专业版下挂两个 Price：`pro_monthly`（月付）与 `pro_yearly`（年付）。只配其中一个时，
定价页的周期切换器只列出配好的那个周期——不会出现一个点了就 502 的「按年付」选项。
终身版是 `one_time` Price，没有周期可选，切换器也不出现（只有一种付费方式时，切换器
没有意义）。

计费模式（订阅 / 一次性）**以 Stripe 上的 Price 为准**：有 `recurring` 是订阅，
没有是一次性支付。配置只管「卖哪个周期」，管不了「Stripe 上那个 Price 到底是不是
周期价」。

## 等级：lifetime > pro > free

**等级是权限高低**，不是付费方式。月付与年付都是 `pro`（同一档位、两种周期）；
`lifetime` 是更高的一档。

```ts
const PRODUCT_TIERS: Record<string, number> = {
  free: 0,
  pro: 1,
  lifetime: 2,
}
```

等级一条规则解决三件事：

1. **当前方案唯一**——用户持有的东西里，等级最高的那个就是「当前生效的方案」。
   买了终身版之后，专业版不再是当前；账单页只有**一个**「当前生效」标记。
2. **高级别替换低级别**——买更高级的会让低级的失效：旧订阅被停掉并按比例退款，
   用户不会为同一份东西付两次钱。
3. **降级被挡**——已经持有更高等级时再买低级别的直接拒绝，并说清楚原因。

判据以**产品配置**为准（等级），判不出来时退回 **Stripe Product** 判定：同一个
Stripe Product 下的价格是同一个东西的不同价位（月付 / 年付 / 终身）。

**等级不同 → 互斥；等级相同 → 并存。** 所以 `lifetime` 与 `pro` 自动互斥，不必显式
声明——写两遍就是两处说法，加一个新产品时必然漏改一处。

显式的 `PRODUCT_EXCLUSIVITY` 只留给**没有等级**的产品：实物商品这类「不参与等级
比较」的东西，要表达「不能与某个订阅同时持有」只能靠声明。

```ts
const PRODUCT_EXCLUSIVITY: Record<string, string[]> = {
  merch: ['pro'], // 实物商品：显式声明与订阅互斥（也可以写 []，即不与任何东西互斥）
}
```

判定逻辑在 `src/payment/plan-state.ts`（纯函数，无副作用）：

| 函数 | 作用 |
|---|---|
| `comparePlanTiers` | 比较两个持有物的等级；有一方没配等级时**不可比** |
| `doesSupersede` | 新持有物是否取代旧持有物（同产品 / 等级更高） |
| `purchaseBlockedBy` | 这次购买是否被已有持有物挡住，以及**为什么** |
| `isSubscriptionSuperseded` | 某条订阅是否已被取代（取代 = 应当停掉并退款） |
| `resolveProductHoldings` | 按产品归集持有物，算出每个产品「当前生效的那一份」 |
| `resolveCurrentPlan` | 全局当前方案：等级最高的那个；同级并列时返回 `null` |

### 一次性购买可以有多笔

**唯一性只约束订阅，不约束一次性购买。** 实物商品买三件就是三笔订单，彼此独立、各自
生效，不能因为「已经买过」就拦下第二单。所以结账守卫只在 `mode: 'subscription'` 时
生效；一次性支付完全不受「已有即重复」的限制。

### 已有订阅时的守卫

`mode: 'subscription'` 的结账在创建 session 之前按**当前登录用户**查一次库，看他
已经持有什么，再决定放不放行。查的是两样：

- **仍在生效的订阅**：状态命中 `active` / `trialing` / `past_due` / `unpaid` /
  `paused` 才算占用名额（`canceled` 与 `incomplete_expired` 不算，用户可以重新订）；
- **已支付的买断订单**。

挡住时给出**具体原因**，页面才能说清该干什么：

| 情况 | 错误码 | 页面提示 |
|---|---|---|
| 已有**任何**活跃订阅 | `ALREADY_SUBSCRIBED`（载荷带 `switch.direction`） | 去「账单与订阅」页的「切换方案」 |
| 持有更高等级的**买断** | `ALREADY_OWNED_HIGHER_TIER` | 不必再买低等级的 |
| 显式声明与已有方案互斥 | `ALREADY_OWNED_EXCLUSIVE_PRODUCT` | 两者不能同时持有 |
| 已有方案**查不出属于哪个产品** | `ALREADY_OWNED_UNKNOWN_PRODUCT` | 保守挡住，去「管理订阅」处理 |
| 判不出「当前那一份」（多份活跃订阅） | `MULTIPLE_ACTIVE_SUBSCRIPTIONS` | 去「管理订阅」处理 |

最后一条是给老数据兜底的：判不出是否重复时，宁可挡住，也不要让用户开出第二份
订阅。应用侧会按 Price id 反查一次产品归属，反查不出才落到这条。

**允许**的情况：

- 没有活跃订阅——正常开一份；
- 一次性支付——不受上述限制（实物商品买三件就是三单）。

守卫不再按「目标等级更高就放行」处理升级：账号级唯一性下**升级只能走切换**（见
「账号级唯一订阅与站内切换」），再开一份就是两份扣款。降级同理：低档位只能通过切换
到达，所以「更高等级的买断 vs 订阅」这一对仍由 `purchaseBlockedBy` 单独判定。

Stripe 后台的 `Limit customers to 1 subscription`（`Settings` → `Checkout and
Payment Links` → `Subscriptions`）能挡住绕过本站、直接用 Checkout 链接的情况。它是
**全局**限制，一个客户只能有一份订阅。本模板现在**建议关掉**：站内切换走
`subscriptions.update`，根本不经 Checkout，这条设置挡不到升级；而它会把「客户在别处
本来就有订阅」也一起挡掉。唯一性由应用层守卫负责——它更精确，还能给出可读的原因。
注意这条设置依赖客户门户的登录链接处于启用状态（`Billing` → `Customer portal`）：
关掉登录链接，限制也会一起失效。

换方案在站内完成：账单页的「切换方案」区块（见下）。Stripe Billing Portal
（账户页的「管理订阅」）仍然保留，作为「取消续费 / 改发票抬头」的入口。

失败返回 502；409 时停留在定价页并用 toast 提示去管理已有的订阅；配置缺失或网络
错误时退回注册引导。

结账结果（成功 / 取消 / 重复订阅）统一走 toast，而不是页面里的一行字：这三条都在
**跳转或点击之后**出现，行内提示很容易落在视口外。成功回跳落在账单页
（`?checkout=success`），取消回跳落在定价页（`?checkout=cancelled`），两处都在展示
后立刻用 `replace` 清掉查询参数，避免刷新时重复弹同一条。

## 账号级唯一订阅与站内切换

**一个账号最多一份活跃订阅。** 唯一性的作用域是**账号**，不是产品：月付与年付是同一
份订阅的两个价，`pro` 与 `pro_plus`（若配置了）也只能二选一。同一时间有两份订阅就是
两份扣款，账单页也只能标一份「当前生效」。

因此换档位、换周期**不新开订阅**，而是改**现有那份**订阅的价格：

```ts
// Stripe：替换订阅项的 price
await stripe.subscriptions.update(subscriptionId, {
  items: [{ id: itemId, price: priceId }],
  proration_behavior: 'always_invoice', // 升级：立刻按差额扣款
})
```

**`items[0].id` 必须带。** 漏了它，Stripe 会**新增**一个订阅项而不是替换——旧价与新价
同时生效、两份都扣款。这是切换路径最容易踩的坑，所以 provider 在 `itemId` 为空时直接
抛错，不猜。订阅项 id 本地没存，切换时先读一次 Stripe（`subscriptions.retrieve`，展开
`items.data.price`）。

### 切换方向

| 方向 | 判定 | 生效 | 折算 |
|---|---|---|---|
| 升级 | 档位更高 | 立即 | `always_invoice`：立刻按差额扣款 |
| 降级 | 档位更低 | **期末** | `none`：本期已付金额不变，新价从下一张账单起算 |
| 换周期 | 同一档位换周期 | 立即 | `always_invoice` |

同档换周期**不算降级**：权益没变，让用户等一个月才拿到年付价是荒唐的。

方向由服务端算（`resolveSwitchDirection`），客户端不重复判定——两处各判一次迟早漂移，
最怕的是客户端说「升级」而服务端按「降级」处理，用户被少扣钱。

### 降级的周期末语义

降级用 `proration_behavior: 'none'`：Stripe 上的价格**立刻**变成新价，而本期已付金额
不变——用户此刻仍在按旧价扣款。若照单全收 Stripe 的 `customer.subscription.updated`，
本地行会显示新（低）价，账单页就会说谎。

所以 `subscriptions` 表另记一份「待生效」：

| 列 | 含义 |
|---|---|
| `pending_price_id` / `pending_product_id` / `pending_stripe_product_id` | 周期末要切到的目标 |
| `pending_interval` / `pending_amount` / `pending_currency` | 目标的价格与周期 |
| `pending_effective_at` | 生效时刻 = 当前周期的结束时刻 |

约定：**当前列 = 用户此刻正在付的价**，pending 列 = 周期末要切到的。晋升（把 pending
写成当前并清空 pending）有两条入口，互为兜底，**事件顺序无关**：

- `invoice.paid`：发票的价 == pending 的价（续费按新价开票）→ 立即晋升；
- `customer.subscription.updated`：事件的周期起点 ≥ 生效时刻 → 周期已翻，晋升。

### 切换端点

`POST /api/payment/switch`，请求体只给**产品 + 周期**（客户端不传 Price id，与结账同一
原则——价格由服务端按 `lookup_key` 解析）：

```json
{ "productId": "pro", "interval": "year" }
```

成功返回 `{ status: 'switched' | 'scheduled' | 'unchanged', direction, ... }`：降级是
`scheduled`（附带 `effectiveAt`），升级与换周期是 `switched`，无变化是 `unchanged`。

错误码：`401` / `400 PRICE_NOT_CONFIGURED | NOT_A_SUBSCRIPTION` / `409
NO_ACTIVE_SUBSCRIPTION | MULTIPLE_ACTIVE_SUBSCRIPTIONS | ALREADY_OWNED_HIGHER_TIER |
ALREADY_OWNED_UNKNOWN_PRODUCT` / `429` / `502 STRIPE_ERROR`（**本地状态不变**）。

**幂等三档**：目标价 == 当前价且无 pending → `unchanged`，**不调 Stripe**；目标价 ==
pending 价 → `scheduled`，不调 Stripe；目标价 == 当前价但有 pending → **取消已安排的
降级**（恢复 Stripe 上的价格 + 清 pending）。

**降级先写 pending 再调 Stripe**：写的是「意图」，Stripe 失败就清掉 pending（补偿）
并返回 502。不补偿的话，本地会留下一个「已安排但其实没安排」的变更，用户到期突然被
降级。

### 「先恢复再应用」的折算基准

降级请求后，**Stripe 上的价格已经是低价**，而用户本周期实付的是高价。此时直接升级，
`always_invoice` 会拿低价做基准算差额 → 少收钱。

处理：存在 pending 且新方向不是降级时，**先恢复**（把 Stripe 价格拉回用户实付的档位，
`proration_behavior: 'none'`，不动钱），**再应用**目标价（`always_invoice`）。第二步
失败 → 补偿清 pending → 502。

恢复与应用连发两个事件，而 Stripe **不保证投递顺序**：迟到的旧事件会把本地价格改回
旧价。因此 webhook 在「事件带来的价与本地不符」时先读一次 Stripe，以它上面的当前
状态为准。

### 切换不建新行

切换**就地更新**订阅行（价格与产品 id 被覆盖），不新建行、不取消旧行。代价：「我的
方案」看不到切换历史，只有交易记录（`payments`）留痕——折算发票以
`payments.type = 'proration'` 记账，金额保留**带符号**（负数 = 抵扣）。

## 买断接管旧订阅

买了更高等级产品的买断后，原订阅**立即取消并按比例退款**：

1. `checkout.session.completed` 写入买断行（`payments.type = 'one_time'`）
2. 查出被它取代的、且仍在生效的订阅（同产品，或等级低于它的）
3. 在 Stripe 上取消该订阅（`prorate: true, invoice_now: true`）——折算额进入客户
   余额，即「没用掉的时间退给客户」
4. 改本地状态为 `canceled`

顺序不能反：本地先标「已取消」而 Stripe 上还在扣款，页面就会骗用户。取消失败直接
抛出去——webhook 会返回 500 并让 Stripe 重投，重投时这笔买断行已经在了（幂等插入），
不会重复记账。

**两个方向都判**：`checkout.session.completed` 先到时由它取消旧订阅；
`customer.subscription.created` 后到时（Stripe 不保证事件顺序）由它发现「已有更高
等级的买断」并立刻停掉新订阅。否则会出现「买断在先、订阅后到、两边都留着」的漏网
情况——用户同时付着两份钱。

订阅之间同理：新订阅落地时会接管同产品的旧订阅与低等级的旧订阅，判定规则与账单页
显示的「已被取代」完全一致（`isSubscriptionSuperseded`），不会出现「页面说已取代、
Stripe 上还在扣款」。

## 账单页

`/dashboard/billing` 分两个区块：

- **我的方案**——买断卡与订阅卡各自成卡，按等级从高到低排。**只有一份**带「当前
  生效」徽章——那就是等级最高的那个（`lifetime > pro > free`）；被取代的订阅仍会
  列出，但标出「已被更高等级的方案取代」，用户不会以为自己还被扣着钱。区块标题下
  有一行「当前等级：<产品名>」，直接回答「我现在是什么档位」。
- **切换方案**——只在该账号有活跃订阅时出现。每个「档位 × 周期」一张卡：当前那一份
  按钮禁用并标「当前方案」；其余按服务端算好的方向标注（升级 / 降级 / 换周期）与生效
  方式（立即生效并按比例结算 / 本期不变、下期起按新价续费 / 立即生效）。降级成功后
  订阅卡里出现「已安排变更为 <目标>，将于 <周期末> 生效」与「取消变更」按钮——取消的
  实现是「切回当前档位」，服务端会恢复 Stripe 上的价格并清掉待生效的变更。
- **交易记录**——表格（保留表头）。第一列标示这笔钱的性质（订阅扣款 / 一次性
  购买 / 方案变更折算），第二列日期，第三列状态徽章加金额。交易记录**不限量**：买过
  几次就是几行，它是流水，不是状态。

状态词表两套，不能互用：「我的方案」走订阅状态（生效中 / 逾期 / 试用中 / 已取消），
「交易记录」走付款状态（已支付 / 已退款）。两者的取值域不同——`payments.status` 只有
`paid` 与 `refunded`，复用订阅文案会让每笔付款都显示成「生效中」。

计费周期同理：只有 `one_time` 才显示「终身」。`checkout.session.completed` 先插入订阅
行（此时 `interval` 尚未写入），周期要等 `customer.subscription.created` 才补齐；空值
**只显示金额、不显示周期**，不冒充买断版。曾在这里渲染过「周期待同步」，但那是 webhook
时序的后端细节，用户读不懂也无从行动，不如不说。

「管理订阅」按钮 → `DELETE /api/payment` → Stripe Billing Portal（新标签页打开）。

服务端从数据库反查当前用户的 `customerId`（不接受客户端传入），因此不存在越权打开
他人账单门户的问题。订阅与流水的查询都按 `userId` 走索引。

## 为什么不用 Stripe 权益（Entitlements）

Stripe 有官方的 Entitlements 模型：产品挂上 feature，客户购买或订阅后，Stripe 自动维护
一条 Active Entitlement，用来回答「**这个用户有没有这个权限**」。

本仓**不接**它。原因是本仓要回答的问题不是权限，而是**归属**：

- 「用户买的是什么」——产品配置 + `plan-state` 负责；
- 「买的东西之间谁接管谁」——等级判定负责；
- 「用户有没有某个功能」——**自己写**门禁逻辑即可。

Entitlements 解决的是第三件事，而第三件事在模板里恰恰是最不该预设的：功能门禁是每个
项目自己的业务规则，写死在模板里反而要花力气拆掉。 Entitlements 还要多建一张
`entitlements` 表、多接一个 `entitlements.active_entitlement_summary.updated` 事件，
换来的却是本仓用不上的第二份数据源——同一件事要查两个地方，迟早对不上。

需要权限门禁时，直接查本站的 `subscriptions` / `payments` 表（按 `product_id` 判定即可），
语义清晰且不额外依赖 Stripe 的 feature 体系。

## 配置自检

`getServiceStatuses()`（`src/config/service-status.ts`）会检查支付模块是否可用，
并额外校验产品配置的**结构性**问题——这些不是「字段缺失」，而是「配置写错了」：

| 问题 | 后果 |
|---|---|
| 同一个 `lookup_key` 挂到多个产品上 | Price → 产品的反查有歧义，归属会漂 |
| 互斥声明指向不存在的产品 | 互斥**静默失效**——用户同时付两份钱却看不到提示 |
| 等级指向不存在的产品 | 该产品永远不参与等级比较，「高级别替换低级别」静默失效 |

三种错配类型系统都守不住，必须在自检里挑出来。

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
| `invoice.paid` | 写 `payments`（含 `invoiceId` / `chargeId`）；折算发票记为 `proration`；发票价命中待生效价时晋升 |
| `customer.subscription.created` / `updated` | 更新状态、价格与周期；**存在待生效变更时不覆盖当前价**；发现被更高等级的方案取代则停掉订阅 |
| `customer.subscription.deleted` | 标记 `canceled` |
| `charge.refunded` | 按 `chargeId` 标记退款 |

### 本地联调

**Stripe 的 webhook 不会自己打到本地**。不配转发，付款在 Stripe 侧成功，但本地
`webhook_events` / `payments` 表始终是空的——账单页自然看不到付款记录与订阅信息。
这是新手最容易踩的坑：支付成功了，页面却像什么都没发生。

用 Stripe CLI 把事件转发到本地：

```bash
# 1. 登录（一次性）
stripe login

# 2. 转发到本地 webhook 端点
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

`stripe listen` 启动后会打印一行 **Signing secret**（`whsec_...`）和一行
**Ready! You are now listening for events**。把前者写进 `.env`：

```
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
```

改完 `.env` 要重启 dev server（`vite` 不会热重载 env）。

注意这个 `whsec_` 与 Stripe Dashboard 上给 endpoint 生成的 secret **不是同一个**，
混用会一直验签失败（返回 400 且不写库）。

**CLI 版本必须是 v1.43.3 及以上**（当前 v1.54.1）。老版本会永远停在
`Getting ready...` —— 它用的是 Stripe 早已废弃的 WebSocket 订阅协议，事件根本
不会转发过来。现象很有迷惑性：支付成功、页面提示成功，但本地库一行都没进，
Stripe CLI 终端里也一条请求都没有。升级即可：

```bash
brew upgrade stripe
```

**要看请求，盯 CLI 终端，不是 Stripe Dashboard**。`stripe listen` 的转发是独立
通道，事件**不会**出现在 Dashboard 的 webhook 端点事件列表里——除非你另外在
Dashboard 配了端点，而那个端点的请求同样到不了 `localhost`。

还需要在 Dashboard 或 CLI 里开启这些事件类型，否则相应分支不会触发：

| 事件类型 | 用途 |
|---|---|
| `checkout.session.completed` | 建立订阅行 / 一次性支付行 |
| `customer.subscription.created` | 补齐价格与计费周期 |
| `customer.subscription.updated` | 状态变更（取消计划等） |
| `customer.subscription.deleted` | 标记 `canceled` |
| `invoice.paid` | 写交易记录（含 `invoiceId` / `chargeId`） |
| `charge.refunded` | 标记退款 |

CLI 默认转发全部事件，用 `--events` 可以只转发关心的几个：

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,charge.refunded
```

### 待生效变更的处理

降级请求后 Stripe 的价格立刻变成新价，而 `customer.subscription.updated` 紧接着就到。
设 pending 价 = `P`、生效时刻 = `E`、事件带来的价 = `Q`、事件里的周期起点 = `S`：

| 条件 | 动作 |
|---|---|
| `Q === P` 且 `S >= E` | **晋升**：pending 写成当前，清空 pending |
| `Q === P` 且 `S < E` | **只写状态类字段**：不写价格列、不清 pending |
| `Q !== P` | pending 被新切换取代 → 清 pending，按普通路径写 `Q` |

`invoice.paid` 是**第二个晋升入口**：发票的价 == pending 的价（续费按新价开票）→
立即晋升。两个入口互为兜底，**事件顺序无关**：`invoice.paid` 先到就按发票价晋升，
随后的 `subscription.updated` 走「周期已翻」分支再晋升一次（幂等）；反过来则先晋升，
`invoice.paid` 按已提升的订阅行写流水，归属取自新产品。

折算发票（`billing_reason = 'subscription_change'`）写 `payments.type = 'proration'`，
金额保留**带符号**（负数 = 抵扣）。

### 事件顺序不保证

Stripe 官方明确说明：**不保证事件按产生顺序投递**（"Stripe doesn't guarantee the
delivery of events in the order that they're generated"）。`customer.subscription.created`
完全可能早于 `checkout.session.completed` 到达。

因此 webhook 的每个 handler 都必须能处理「目标行还不存在」的情况：

- `customer.subscription.created` / `updated`：行不存在时用 `metadata.userId` 补建。
  注意这个 metadata 来自创建 session 时**显式写入**的 `subscription_data.metadata`
  ——Stripe **不会**自动把 Checkout Session 的 metadata 复制到 Subscription
  （实测订阅对象上的 metadata 是空的）。不显式写，这条订阅就无从知道属于谁。
- `invoice.paid`：反查不到归属时**抛错**而不是写入 `user_id = NULL` 的孤儿行——
  `payments.user_id` 允许为 NULL，写进去的记录用户在自己账单页永远查不到，等于
  静默丢钱。抛错会删除事件行并返回 500，Stripe 重投时订阅行往往已经写好。

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

产品归属靠两列：

| 列 | 含义 |
|---|---|
| `product_id` | 本站产品 id（`pro` / `lifetime`）。等级与互斥判定的权威依据 |
| `stripe_product_id` | Stripe Product id。配置判不出来时的兜底判据 |

`subscriptions` 与 `payments` 都有这两列；功能门禁直接按 `product_id` 判定，不需要
额外的权益表。

`subscriptions` 另有 7 个 `pending_*` 列，记「周期末要切到的方案」（降级）。约定：
**当前列 = 用户此刻正在付的价**，pending 列 = 周期末要切到的。

| 列 | 含义 |
|---|---|
| `pending_price_id` | 周期末要切到的 Price id |
| `pending_product_id` | 周期末要切到的产品 id |
| `pending_stripe_product_id` | 目标 Stripe Product id（兜底判据） |
| `pending_interval` | 目标的计费周期 |
| `pending_amount` / `pending_currency` | 目标的单价与币种 |
| `pending_effective_at` | 生效时刻 = 当前周期的结束时刻 |

唯一性**不建数据库索引**，只在应用层保证：webhook 的 INSERT（新建活跃行）先于把旧行
改成 `canceled` 的 UPDATE，索引存在时 INSERT 直接违反约束 → webhook 抛错 → Stripe
无限重投 → 正常流程被卡死。

## 参考资料

- [Manage prices](https://docs.stripe.com/products-prices/manage-prices)——`lookup_key` 与价格展示的官方建议
- [Stripe API keys](https://docs.stripe.com/keys)——密钥类型、webhook 签名密钥与轮换
- [Stripe Checkout](https://docs.stripe.com/payments/checkout)——会话创建与 success/cancel URL
- [Stripe Billing Portal](https://docs.stripe.com/customer-management/integrate-customer-portal)——管理订阅入口
- [Change a subscription's price](https://docs.stripe.com/billing/subscriptions/change-price)——换价必须带 `items[].id`
- [Prorations](https://docs.stripe.com/billing/subscriptions/prorations)——`proration_behavior` 三档语义

## 下一步

- [通知](./notifications)——支付成功事件的运营通知
- [功能集成概览](./integrations)——六个服务模块的门禁语义与端点
