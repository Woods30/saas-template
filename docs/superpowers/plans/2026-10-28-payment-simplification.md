# 支付与套餐配置精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 用扁平套餐配置和托管购买/管理链路替代等级互斥、自动接管与站内切换。

**Architecture:** products.ts 是套餐和销售引用的唯一声明。支付适配器处理外部 API 与事件转换，共用持久化逻辑维护账号级订阅和支付记录，页面仅展示归一化数据。

**Tech Stack:** TanStack Start、React、TypeScript、Paraglide、Drizzle/D1、Stripe、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-28-payment-simplification-design.md`

## Global Constraints

- 一个账号全局最多一份有效订阅；独立一次性商品允许另外购买及重复购买。
- 站点统一选择一个支付服务商，本次仅实现 Stripe，不新增依赖。
- 不处理历史数据兼容，不清空数据库，不操作生产，不自动提交。
- 不在模块顶层调用 m.*()；不修改 src/components/ui 上游原件。
- 配置采用 id/name/description/features/recommended/prices，金额与实际周期来自服务商。

## Review Focus

- 重复点击及并发购买应复用同一未完成订阅 Checkout，不能产生两份订阅。
- 异步支付尚未付款不得记 paid，重试事件不可重复入账。
- Portal 改价后以真实价格识别产品，旧 metadata 不可覆盖实际归属。
- 仅一次性用户也可管理账单，用户不可指定别人的 customerId。
- 取价失败应禁购，混合月年与一次性选项必须准确提交用户所选 offerId。

---

### Task 1: 扁平配置与服务商价格目录

**Files:** Modify src/config/products.ts, src/types/pricing.ts, src/payment/types.ts, src/payment/provider/stripe.ts, src/payment/index.ts, src/payment/price-catalog.ts, src/payment/price-catalog.server.ts, src/config/service-status.ts; Test tests/unit/payment-price-map.test.ts。

**Interfaces:** getProducts(): ProductDefinition[]；resolvePriceReference(productId, offerId): string | undefined；collectPriceReferences(): string[]；ProviderPrice 包含 reference/id/amount/currency/mode/interval/intervalCount；PaymentProvider.listPrices(references): Promise<ProviderPrice[]>；CatalogPrice 按 reference 索引；mergePricingProducts 输出含 offerId 的 options。

- [x] 写配置与合并失败测试：pro.prices 精确等于月年引用、free 空表、重复引用可检出、实际周期取 provider、混合支付选项都有 offerId。
- [x] 跑 `pnpm exec vitest run --project unit tests/unit/payment-price-map.test.ts` 确认失败。
- [x] 实现单一配置与目录，去等级互斥辅助函数，更新 provider 返回和自检。
- [x] 重跑上述测试通过。

### Task 2: 购买与事件持久化

**Files:** Modify src/db/schema.ts, src/payment/types.ts, src/payment/provider/stripe.ts, src/routes/api/payment/$.ts, src/routes/api/webhooks/stripe.ts, src/payment/plan-state.ts; Create src/payment/events.ts, src/payment/checkout.ts, src/db/migrations/0008_payment_simplification.sql; Test tests/unit/payment.test.ts, tests/unit/payment-plan-state.test.ts。

**Interfaces:** CheckoutParams 包含 productId/offerId/priceId/idempotencyKey/customerId；ProviderSubscription 包含真实价格/客户/metadata与当前周期，无 itemId；NormalizedPaymentEvent 包含 event id、created、归一化 subscription/payment/refund；applyPaymentEvent(db,event)；订阅占位状态常量统一。checkout_reservations 按账号唯一预留订阅创建并复用有效 session，provider 幂等 key 稳定。

- [x] 写失败测试：有效订阅拒绝、终止可新购、一次性可重复、并发预留不重复、按会话用户访问 Portal、签名失败、重复支付与退款幂等、未付款不入账、旧事件不覆盖状态。
- [x] 跑相关 unit 测试确认失败。
- [x] schema 加 provider/offerId/退款与事件版本字段，删 pending/互斥专用字段，添加预留表；新增增量迁移，不操作数据库。保持现有迁移文件不变。
- [x] 精简 Checkout 与 Portal 路由，共用购买预留，Stripe 使用幂等键与已有 customer；provider 转换事件，共用事件落库，不再接管任何订阅。
- [x] 删除 switch API/client、pending 测试和专用切换测试；重写计划状态为占位判断。
- [x] 重跑 unit 测试至通过。

### Task 3: Pricing 和账单 UI

**Files:** Modify src/components/sections/Pricing.tsx, src/components/marketing/LandingPage.tsx, src/routes/{-$locale}/pricing.tsx, src/payment/checkout-client.ts, src/payment/billing.ts, src/payment/billing-query.ts, src/routes/{-$locale}/_layout/dashboard/billing.tsx, messages/en.json, messages/zh.json; Test tests/components/pricing.test.tsx, tests/unit/billing-query.test.ts, e2e/payment.spec.ts, scripts/e2e-seed-subscription.ts。

**Interfaces:** startCheckout({productId,offerId,locale})；BillingOverview 为 subscriptions/payments/canManage，currentSubscription 由展示函数推导；Portal 从已验证本地记录取 customer，普通用户无法自行指定；Pricing options 提交 offerId。

- [x] 写失败测试：月年和一次性正确选项、价格不可用不注册、有效订阅管理入口、无等级账单分组、部分退款展示。
- [x] 跑对应 unit/components 测试确认失败。
- [x] 修改 Pricing/首页共用数据和统一 CTA；登录回跳恢复 offer；删切换提示与卡片，简化账单，保留必要历史与交易。
- [x] 更新中英文消息、seed 和 E2E，验证取价失败与账号归属。
- [x] 重跑对应测试通过。

### Task 4: 文档与完整验证

**Files:** Modify content/docs/payment.zh.md, content/docs/payment.md, content/docs/configuration.zh.md, content/docs/configuration.md, docs/adr/0003-product-config-and-exclusivity.md, CONTEXT.md, AGENTS.md（仅当目录/约定变化）, 其他受影响测试。

- [x] 更新配置与provider边界、Portal限制、本地迁移说明、旧规则废弃记录，不声明未实测能力。
- [x] 运行 `pnpm locale:sort`、`pnpm check`、`pnpm exec vitest run --project unit`、`pnpm exec vitest run --project components`。
- [x] 运行 `pnpm build`、`pnpm check:client-bundle` 和相关本地 payment E2E；若环境缺前置如实记录。
- [x] 检查 diff 和残留 tier/exclusivity/switch/pending 引用，确认无无关变更、无 secret。
- [x] 将已完成的计划复选框勾选，汇报测试与真实支付验证边界。用户授权后才提交。
