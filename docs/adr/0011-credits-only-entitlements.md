# ADR-0011: 权益模型收敛为 credits-only，并补齐计费运营闭环

- **状态**：Accepted（2026-11-18）
- **日期**：2026-11-18

## 背景

本仓的权益是三层：`credits`（余额）、`entitlements`（套餐级功能开关与额度）、`usage`
（用量计量）。其中 entitlements 没有任何外部调用方，usage 连一条路由都没有；plan 级
功能开关从未被产品使用，却带来四张表与两套后台概念。

同时运营侧缺三件事：后台不能退款、用户不能自助取消订阅、购买成功不发放任何额度。
对一个要卖给开发者做 SaaS 的模板来说，这三件比「套餐级功能开关」重要得多。

ShipAny 的做法是只用 credits：功能开关是实例级全局，套餐之间只差积分数量与有效期。

## 决策

1. **删除 `modules/entitlements` 与 `modules/usage`**，连同 5 张表（`entitlements`、
   `plans`、`plan_entitlements`、`user_entitlements`、`usage_records`）、catalog 与 seed。
   套餐差异只用积分数量与有效期表达；功能开关回到实例级的 modules / features。
2. **购买与续期自动发放积分**：数量与有效期写在 `src/config/products.ts` 的 offer 上，
   与产品定义同源；发放幂等键按订单号或计费周期生成。
3. **provider 接口增加 `cancelSubscription` 与 `refundPayment`**（必选方法，两家 provider
   都实现），Portal 仅作为账单入口保留。
4. **用户取消期末生效**：Stripe 用 `cancel_at_period_end`，Creem 对应到期不续费。
   这一点与 ShipAny 不同——它直接 `subscriptions.cancel(id)` 立即终止；已付费用满期
   才是用户的合理预期。
5. **后台退款是独立操作**：`payments.refund` 权限码 + 审计日志；用 `refunding` 状态做
   一次性 claim（条件状态转移 `paid/partially_refunded → refunding`，抢不到即冲突），
   防止并发重复退款。
6. **退款反扣扣到 0 为止**：优先扣该订单发放的批次，余额不足时只扣到 0，并在流水里记录
   应扣与实际扣减的差额。退款永远不因积分不足而失败，也不允许把余额打成负数。

## 考虑过的替代

- **保留 entitlements 做 plan 级开关**：模板没有这个产品需求，留着就是四张表和一套无人
  维护的后台概念。
- **保留 usage 只删 entitlements**：usage 依赖 entitlements 的配额扣减，且自身没有调用方。
- **立即取消**（ShipAny 做法）：实现最省事，但用户点一下就失去本期剩余权益。
- **余额不足拒绝退款**：账不亏，但把问题推给客服，退款被卡住比少扣点积分更糟。
- **允许负余额**：账最严格，但负余额会在所有余额展示与扣减路径上引入边界情况。

## 后果

- 已 seed 的 plans / entitlements 数据作废，随表一起删除。
- 模板不再提供「pro 才能用某功能」；需要的人应在 modules / features 之上自行扩展。
- 退款成为唯一会让用户积分减少的后台操作，必须留审计痕迹。
- 续期发积分依赖支付渠道的续期事件，Webhook 漏投时额度会少发——这是已知的单点依赖，
  与 ShipAny 相同，不在本次解决。
