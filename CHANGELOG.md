# 更新日志

## 0.2.0 (2026-10-29)

### 特性与调整

- 支付配置简化为产品与销售引用，站点选择一个支付服务商；当前内置 Stripe。
- 同一账号最多一份未终止订阅，一次性商品可重复购买，订阅管理交给服务商 Portal。
- 移除站内换档、等级互斥、买断接管与待生效降级调度，统一 Webhook 持久化与结账并发保护。
- 首页更新为 Jerbix 模板销售页，提供源码与界面联动循环演示、完整源码、永久支持与免费升级说明。
- 模板通过独立 `jerbix_template` 引用以 USD 99 一次性购买；登录、注册及邮箱验证保留购买回跳。
- 定价统一至首页 `#pricing`，旧 `/pricing` 跳转当前语言首页价格区。

### 修复

- 修复复用 Stripe 客户时的 Checkout 参数冲突。
- 同步首页中英文 E2E 断言，生产环境校验前先生成 locale，避免全新 checkout 部署失败。

### 升级说明

- 新增迁移 `0008_payment_simplification.sql`，要求空白支付表，不转换历史支付数据。生产迁移前必须备份并审查现有数据，不可直接应用到包含历史支付数据的生产库。
- 部署前配置生产支付凭据及 Webhook，并核对启用的通知与分析服务配置。此版本发布不会自动迁移生产数据库。

## 0.1.0 (2026-10-12)

首次公开版本。

### 特性

- TanStack Start + Cloudflare Workers 骨架
- Better Auth（邮箱密码 + Google OAuth，可选）
- Stripe Checkout + Customer Portal + Webhook
- Cloudflare D1 / KV / R2 / Email 集成
- 8 个营销 blocks
- 多语言（zh / en，URL 前缀）
- PWA + SEO（sitemap / robots / JSON-LD / 静态 OG 图）
- 多 analytics（GA / Plausible / Umami / Clarity）
- 自托管多 provider 注册表
- Playwright E2E + Vitest 单元 + 组件
- GitHub Actions CI
