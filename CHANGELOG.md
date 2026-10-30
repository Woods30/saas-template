# 更新日志

## 0.8.0 (2026-10-30)

### 特性与调整

- 价格收敛为单一事实源：金额只存在于 Stripe 的价格目录，首页展示、`llms.txt` 与结账收款读同一份目录，代码与配置不再存第二份金额。改价只需在 Stripe 后台操作，不必发版。
- 首页价格取不到时降级为「价格暂不可用」，不再因取价失败让整页失败。
- 结账 400 区分错误来源：只有价格不可用才提示「该方案暂未开放购买」，参数非法或回跳地址不被信任时显示通用错误，避免把请求问题误导成价格问题。

## 0.7.0 (2026-10-30)

### 特性与调整

- 新增面向 AI 抓取器的站点索引与全文包，中英各一套：`/llms.txt`、`/llms.zh.txt`（定位、技术栈、包含什么、价格与文档清单），`/llms-full.txt`、`/llms-full.zh.txt`（全部文档正文，纯 Markdown）。
- llms 文案集中在 `src/config/llms.ts`，正文取自 `content/`；改配置或加文档自动生效，价格读 `websiteConfig.template.priceUsd`，链接按语言前缀拼绝对 URL。
- `robots.txt` 显式放行 GPTBot、OAI-SearchBot、ChatGPT-User、ClaudeBot、Claude-User、Claude-SearchBot、PerplexityBot、Google-Extended、Bytespider、CCBot，检索与训练都收录。
- `sitemap.xml` 增加 `lastmod`：文档取 frontmatter `updated`，博客取 `date`；无日期来源的静态页不输出，不编造。

### 安全

- llms 文件不收录未发布的博客，站点私有的模板占位符按类型脱敏后输出。

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
- 结账预留释放前核对服务商会话与订阅状态，避免 Webhook 延迟造成重复订阅，并支持订阅终止后重新购买；响应丢失时复用原请求、幂等键与过期时间。
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
