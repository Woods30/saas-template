# ADR-0003: 套餐配置与账号级订阅

- **状态**：Accepted（2026-10-28 替代原等级互斥与站内切换决策）
- **日期**：2026-10-28

## 背景

原实现把产品选项、文案、等级和互斥分散声明，叠加买断接管、差价结算、降级待生效和补偿机制。新增套餐需要理解多套规则，不适合“配置套餐和价格即可购买”的 SaaS 模板目标。

## 决策

1. `src/config/products.ts` 每个套餐只声明一次：`id`、展示文案、可选 `recommended`、`prices`。
2. `prices` 映射本站购买选项到当前 provider 的销售引用。Stripe 使用 lookup key；其他 provider 自行解释，不把 Stripe API 模型泄露给页面。
3. 金额、币种、类型和实际周期由 provider 返回；免费套餐使用空 prices。
4. 站点只选择一个 provider；当前实现 Stripe，新增 provider 必须完成 API、验签和事件归一化。
5. 账号全局最多一份未终止订阅，重复或并发购买通过订阅守卫、持久化 Checkout 预留和服务商幂等键处理。
6. 独立一次性商品可另买或重复买，不接管订阅。
7. 删除等级互斥、自动取消、站内切换及全部 pending 机制。管理行为通过服务商 Portal，具体功能以其配置和能力为准。
8. 服务商适配器转换归一化事件，共用 `payment/events.ts` 落库。Webhook 决定付款和订阅状态，成功回跳不授予权益。
9. 订阅按真实价格归属，旧 metadata 不能覆盖 Portal 切换后的产品。交易和事件按 provider 作用域幂等。

## 后果

- 新增套餐只修改一处声明；无需提供等级、互斥和 CTA。
- 省去模板内差价计算和降级状态机。
- Portal 能力不能跨服务商保证一致，接入时必须明确其限制。
- 尚未完成的订阅 Checkout 会复用，不能在原会话有效期内另开不同套餐。
- 不提供历史数据转换或服务商迁移，不操作生产数据库。
- 应用项目自行定义购买后业务权益；本模板不预设等级或 Entitlements。

## 相关

- `content/docs/payment.zh.md`
- `docs/superpowers/specs/2026-10-28-payment-simplification-design.md`
