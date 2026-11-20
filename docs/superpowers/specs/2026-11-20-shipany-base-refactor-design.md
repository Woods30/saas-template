# 以 shipany 引擎为基座重构 saas-template

日期：2026-11-20
状态：待评审
参考仓：`zyrliuwei-sys/shipany-tanstack-main`（下文简称 shipany）
本仓：`saas-template`（示例品牌 Jerbix）

## 1. 意图

本仓现在的配置体系太重：`src/config/` 12 个文件，`website.ts` 380 行，再叠
`core/config/registry` + `applySettingsToConfig` + `applyEnvOverrides` 的回填链。
使用者要改一个开关，得先读懂三层配置的合并顺序。

目标是让模板回到「clone → 跑三条命令 → 看到模板站 → 进后台改配置」这条路径：

- 启动只需要 5 个环境变量；
- 默认 SQLite + Node 部署，本地零外部依赖；
- 品牌、支付、邮件、存储、AI 等参数全部在管理后台配置，凭据加密存库；
- 使用者后续通过 Agent 对话迭代，工程规约与技能按 shipany 的组织方式提供。

直白说：**骨架换成 shipany 的，保留我们的核销支付、文档站模块和 Cloudflare 部署能力。**

## 2. 目标

1. 新仓库基座 = shipany 的 `src/`、`scripts/`、`messages/`、`.env.example`、Dockerfile、
   node:test 测试与 `.claude/skills`，整体搬入后按本仓需要做最小改动。
2. 启动路径与 shipany 一致：
   `pnpm install` → `cp .env.example .env.development` → 填 `AUTH_SECRET` →
   `pnpm db:push` → `pnpm rbac:init --admin-email ... --admin-password ...` → `pnpm dev`。
3. 默认数据库 SQLite（`file:data/local.db`），默认部署 Node（`pnpm build` / `pnpm start`）。
4. Cloudflare Workers 部署与 Node 并列：保留 `NITRO_PRESET=cloudflare_module` 构建、
   `wrangler.example.jsonc`、D1 方案与部署技能。
5. 核销支付并入 shipany 的订单/支付模型：只有一条订单链路，核销是其中一种支付方式。
6. 文档站模块保留，默认关闭，现有文档内容全部删除。
7. 工程文档与技能以 shipany 的结构为参考，但**重写为本仓自己的独立文档**；技能只保留必要项。
8. 不携带 shipany 的身份痕迹：品牌、占位密钥、上游同步机制、厂商专属集成全部去掉，
   本仓作为独立模板持续迭代、走自己的方向。

## 3. 非目标

- 不做营销站产品：不保留现有 Hero / Pricing / LandingPage 那套营销装配，页面用 shipany
  的极简示例页（`src/blocks/*` 与 `src/routes/index.tsx`）。
- 不做中文模板：英文单语，`project.inlang/settings.json` 只启用 `en`，路由无 locale 前缀，
  不做 `/zh` 跳转（单语言时 URL 本就没有 `/zh`）。
- 不保留旧配置层：`website.ts`、`core/config/registry.ts`、`applySettingsToConfig`、
  `applyEnvOverrides` 全部删除，不再另起一套。
- 不保留 Playwright / Vitest / Biome / 旧的 e2e 与 CI 工作流。
- 不做 shipany 的下游镜像：不保留 `sync-upstream`、`UPGRADING.md` 的
  `Template-sync` 机制，也不承诺与上游合并。本仓从分叉点开始独立演进。
- **官网仓不在本次范围内**：`Woods30/jerbix` 与已部署的 docs Worker 保持现状，
  不再跟随本模板；旧版本（v0.11.0）留在 tag 与 git 历史里。本仓不再提供
  「官网仓合并模板」的流程、目录兼容或双仓版本规则。

## 4. 反目标

以下任一情况即使「能跑」也算失败：

- clone 后仍需要手工改代码才能启动，或需要超过 5 个必需环境变量。
- 后台改完配置后，重启或换实例配置丢失，或客户端与服务端读到不同配置。
- 核销订单与渠道订单各自一套列表、各自一套结算逻辑，后台出现两个「订单」概念。
- 品牌/开关类配置仍分散在代码、env、数据库三处。
- 文档站默认就是开着的，或仍带着我们旧的中文文档内容。

## 5. 已定的决策（用户拍板）

| 主题         | 决定                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| 基线         | 以 shipany 为基线整体替换                                               |
| 语言         | 英文单语；以后要加语言时按 shipany AGENTS.md 的 Paraglide 流程扩        |
| 示例内容     | shipany 的极简示例页                                                    |
| 文档站       | 模块保留、默认关闭、现有内容删除                                        |
| 其余营销配件 | newsletter / contact / changelog 删除                                   |
| 核销支付     | 并入 shipany 支付模型（不是原样移植独立链路）；**只支持一次性商品**     |
| 核销默认     | 默认关闭；后台开关 + 上传收款码后启用；demo 商品补 CNY 标价，不预置账户 |
| 官网仓       | 干净切割：不在本次范围，文档 Worker 不动                                |
| 价格事实源   | `src/config/pricing.ts` 代码目录（金额、币种、积分、周期都在这里）      |
| 工程文档     | 不照搬，参考 shipany 的组织方式重写为本仓独立文档                       |
| 技能         | 只保留必要技能；删除 `sync-upstream`、`shipany-admin`                   |
| 身份痕迹     | 不携带 shipany 品牌/占位/上游机制/厂商专属集成                          |
| 测试         | 采用 shipany 的 node:test；删除 Playwright/Vitest/旧 CI                 |
| CI           | 保留 shipany 的 docker-build，并新增 tsc + node:test + build 的工作流   |
| 部署默认     | Node + SQLite 默认；Cloudflare 并列                                     |

**关于价格的决定有代价，需明确写进文档**：金额写进代码后，后台不能改价，改价 = 改代码 +
重新部署；Stripe 用 `price_data` 动态建价，而不是预先建 Price 对象。这取代了本仓原先
「金额只存在 Stripe 价格目录」的旧原则。

## 6. 新基座

### 6.1 保留 shipany 的部分

整个 `src/` 目录（core / modules / routes / server / config / blocks / components / hooks /
lib / content / router / server.ts / styles），以及：

- `scripts/db-setup.mjs`、`scripts/with-env.ts`、`scripts/init-rbac.ts` 等；
- `messages/en.json`、`project.inlang/`；
- `Dockerfile`、`.github/workflows/docker-build.yaml`、`.husky/`、`.prettierrc.json`；
- `wrangler.example.jsonc`、`vite.config.ts` 的 Cloudflare 分支；
- `src/config/db/schema.{sqlite,postgres,mysql}.ts` 三份迁移模板。

文档与技能不照搬：`AGENTS.md`、`CLAUDE.md`、`docs/`、`.claude/skills/` 按 §12 重写，
只保留必要技能。

**不搬的部分**（上游身份或厂商专属）：

- `.claude/skills/sync-upstream/`、`.claude/skills/shipany-admin/`
- `UPGRADING.md`（上游同步流程）
- `tools/seeapi-installer/`、`src/config/seeapi.ts`、`src/core/ai/seeapi.ts` 及其设置项
- `tools/indexnow-installer/`（IndexNow 功能保留，安装器不搬）
- `src/features/footer-badges/`、`src/modules/footer-badges/`、后台页与测试
  （上游推广徽章，不是我们的产品能力）
- `src/components/sandbox-preview-bridge.tsx`（上游预览沙箱的消息协议）
- 所有 "shipany" 字样的占位与常量（`AUTH_SECRET_PLACEHOLDER` 改成中性值、
  测试临时目录前缀、注释等）

### 6.2 本仓要做的适配

| 项                                                                                      | 处理                                                                                                               |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `package.json`                                                                          | 以 shipany 的为基线；`name` 改 `saas-template`；`version` 见 §14                                                   |
| `README.md`                                                                             | 重写：我们的定位（模板仓）、Node 默认 + CF 可选、核销支付、文档站开关                                              |
| `LICENSE`                                                                               | 保留本仓现有 MIT                                                                                                   |
| 品牌资产                                                                                | 用 shipany 的最小资产；品牌名走 `VITE_APP_NAME` / 后台配置                                                         |
| 旧 `src/config/*`                                                                       | 不迁入；需要的站点信息进 shipany 的 `src/config/index.ts` 或后台设置                                               |
| 旧 `content/`                                                                           | 删除；文档站内容清空，保留目录与加载逻辑                                                                           |
| 旧 `e2e/`、`tests/`、`test-results/`、`playwright-report/`                              | 删除，改用 shipany 的 `tests/`                                                                                     |
| 旧 `biome.json`、`vitest*.config.ts`、`playwright.config.ts`、`drizzle.config.local.ts` | 删除                                                                                                               |
| 旧 `wrangler.jsonc`                                                                     | 删除；改用 `wrangler.example.jsonc` + gitignored 工作副本                                                          |
| 旧 `docs/`、`CONTEXT.md`、`DESIGN.md`                                                   | 删除；只保留本设计文档所在的 `docs/superpowers/specs/`                                                             |
| 上游身份文件                                                                            | `UPGRADING.md`、`tools/seeapi-installer/`、`tools/indexnow-installer/`、footer-badges、sandbox-preview-bridge 不搬 |
| `src/blocks/*`                                                                          | 按 §6.3 统一命名；消除 `blocks/header                                                                              | footer`与`components/site-header | site-footer` 的重名/重复 |

### 6.3 组件与区块命名（以 shadcn 为准）

shipany 的 `src/blocks/` 是 kebab-case 文件名 + PascalCase 导出，这点对；但和 shadcn
的约定有两处偏差：营销区块的名字缺 `Section` 后缀，且 `Header` / `Footer` 在
`blocks/` 和 `components/` 各有一份，语义重叠。统一为：

| 位置     | 规则                                  | 例子                                                                           |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| 文件名   | kebab-case                            | `hero-section.tsx`                                                             |
| 组件导出 | PascalCase，营销区块以 `Section` 结尾 | `HeroSection`、`FeaturesSection`、`PricingSection`、`FaqSection`、`CtaSection` |
| 站点外壳 | 放 `components/`，用 `Site` 前缀      | `SiteHeader`、`SiteFooter`                                                     |
| 复用原件 | 放 `components/`，不带 `Section`      | `pricing-table`、`blog-card`、`data-table`                                     |
| barrel   | 不建                                  | 直接具名导入                                                                   |

落地时把 shipany 的 `hero.tsx` → `hero-section.tsx`、`features.tsx` →
`features-section.tsx`、`pricing.tsx` → `pricing-section.tsx`、`faq.tsx` →
`faq-section.tsx`、`cta.tsx` → `cta-section.tsx`、`blog.tsx` → `blog-section.tsx`；
`blocks/header.tsx` 与 `blocks/footer.tsx` 删除，页面直接用
`components/site-header` / `site-footer`。

## 7. 启动与配置模型

### 7.1 必需 env（与 shipany 一致）

```
VITE_APP_URL
VITE_APP_NAME
DATABASE_PROVIDER   # 默认 sqlite
DATABASE_URL        # 默认 file:data/local.db
AUTH_SECRET
```

可选：`VITE_APP_DESCRIPTION`、`VITE_APP_LOGO`、`VITE_DEFAULT_LOCALE`、
`CONFIG_ENCRYPTION_KEY`、`AUTH_TRUSTED_ORIGINS`、非 SQLite 的数据库变量。

### 7.2 三层，只有三层

1. **env**：只放启动必需项与服务端运行参数（`src/config/index.ts` 归一化）。
2. **后台设置**：`src/modules/config/settings.ts` 定义字段，值存 `config` 表；
   数据库覆盖 env（`getAllConfigs()`），秘密字段用 `CONFIG_ENCRYPTION_KEY` 加密。
3. **代码目录**：`src/config/pricing.ts`（价格、积分、周期）、`src/config/user-features.ts`
   （用户中心入口默认值）、`src/config/appearance.ts`（主题默认值）。

**不再有第四层。** 站点品牌、开关、渠道凭据一律进第 1/2 层；不要在 `src/config/` 里
再建 `website.ts` 之类的聚合配置。

### 7.3 后台设置的最小增补

- `general`：沿用 `app_name` / `app_description` / `app_url` / appearance。
- 新增 `docs` 分组：`docs_enabled`（switch，默认 false）。
- `payment`：沿用 `default_payment_provider`，选项加入 `manual_payments`；
  新增 `manual_payments_enabled`（switch）、`manual_payments_sla_hours`（number，默认 24）。
- 核销收款账户**不**放进 settings 的标量字段（需要图片与列表），见 §8。

### 7.4 配置安全基线

shipany 已经有三道闸，本仓沿用并补测试，确保公开接口读不到秘密：

1. **公开接口只读白名单**：`/api/config/public` 遍历一个手写的 `publicKeys`
   列表；`filterPublicConfigs` 对每个 key 再查一遍 `PROTECTED_CONFIG_KEYS` 与
   `isSecretConfigKey()`，命中的直接丢弃。白名单之外的东西（包括自定义配置）
   一律不下发。
2. **后台接口只给掩码**：`/api/admin/config` 返回 `getAdminConfigs()`，
   秘密字段显示 `••••••••`（长值保留末 4 位），`auth_secret` / `database_*`
   等受保护键直接移除；回传掩码值时视为「未修改」。
3. **静态加密**：秘密字段落库前用 AES-256-GCM 加密（`CONFIG_ENCRYPTION_KEY`），
   格式 `enc:v1:<iv|tag|ciphertext>`；`getAllConfigs()` 解密后只允许服务端模块使用，
   **绝不**返回给浏览器。

本仓要加的防线：

- `CONFIG_ENCRYPTION_KEY` 未设置时秘密是明文。本地开发允许留空；**生产部署
  （`pnpm deploy` / CF 部署）要求必须设置**，缺失则拒绝继续。
- 新增两条 node:test：
  - 公开接口：遍历 `publicKeys`，断言没有任何 key 通过 `isSecretConfigKey()`，
    且响应里不含受保护键；
  - 后台接口：断言每个秘密设置都返回掩码，受保护键不存在。
- 保留 `assertEndpointSecretsResupplied`：改 endpoint 必须重新输入对应 secret，
  防止把已保存的密钥导流到攻击者服务器。
- 删除 SeeAPI 后，仍保留 openai / anthropic / r2 / telegram / notify 的 endpoint
  与 secret 配对校验。

**边界说明**：加密保护的是「只拿到数据库」的场景（备份泄漏、SQL 注入导出）；
密钥在同一台机器的 env 里，防不了被攻破的应用服务器。这一点写进 README 与
`AGENTS.md`，不夸大。

## 8. 核销支付并入 shipany 支付模型

目标：全站只有一个「订单」概念（`order` 表），核销只是 `paymentProvider` 的一个取值。

### 8.1 范围：只做一次性商品

核销订单只接受 `pricingCatalog` 里 `type === ONE_TIME` 的商品。订阅商品在
核销入口直接拒绝（`INVALID_OFFER`），订阅必须走 Stripe / Creem / 支付宝等渠道。
因此本模块**不创建订阅**、不处理续费、不合成订阅 ID；退款只回滚积分与订单状态。

### 8.2 数据模型

新增两张表到三份 schema 模板（sqlite / postgres / mysql）：

**`manual_payment_account`（收款账户）**

- `id`、`channel`（当前只有 `alipay`）、`displayName`、`currency`（`cny`）、
  `qrImageKey`（storage key）、`enabled`、`sortOrder`、`createdAt`、`updatedAt`。
- 账户清单只存数据库，不再有「源码配置兜底」。后台增删改。

**`manual_payment_detail`（订单的核销细节，与 `order` 1:1）**

- `orderId`（PK，FK → order.id，cascade）
- `userId`（冗余副本，用于临界区唯一索引）
- `accountId`、`fingerprint`（1–99）、`baseAmount`、`payableAmount`、`currency`
- `status`：`pending_payment | pending_verification | settling | settled | expired |
canceled | rejected | requires_refund`
- `payerNote`、`receiptKey`、`submittedAt`、`observedAmount`、`externalReference`
- `reviewNote`、`reviewedBy`、`reviewedAt`、`expiresAt`、`settledAt`
- 索引照旧：`(status, expiresAt)`、`(userId, status)`、
  `(accountId, payableAmount)` 部分唯一（活跃状态）、`userId` 部分唯一（`settling`）。

**MySQL 的等价实现**：MySQL 没有部分索引，用生成列 + 唯一索引表达——
`active_amount_key`（活跃状态下为 `accountId:payableAmount`，否则 `NULL`）与
`settling_user_key`（`settling` 时为 `userId`，否则 `NULL`）。MySQL 唯一索引允许多个
`NULL`，语义与 SQLite/Postgres 的部分索引一致。schema.mysql.ts 需引入 `uniqueIndex`。

`order.status` 是给人看的投影，由 detail 状态驱动：

| detail.status                   | order.status                |
| ------------------------------- | --------------------------- |
| pending_payment                 | `created`                   |
| pending_verification / settling | `pending`                   |
| settled                         | `paid`                      |
| expired / canceled / rejected   | `failed`                    |
| requires_refund                 | `paid`（退款后 `refunded`） |

### 8.3 下单

`POST /api/payment/checkout` 增加分支：当 `payment_provider === 'manual_payments'`
（或后台把默认 provider 设为它）时，不走 `PaymentManager`：

1. 校验 `manual_payments_enabled`、商品存在于 `pricingCatalog` 且为一次性
   （`type === ONE_TIME`）、有 CNY 标价（`cnyPriceInCents`）。
2. 选一个启用的收款账户；分配 1–99 尾数，保证同一账户下活跃订单金额唯一；
   池耗尽返回 `AMOUNT_POOL_EXHAUSTED`。
3. 写 `order`（status `created`，paymentProvider `manual_payments`，amount =
   CNY 标价 + 尾数，currency `cny`）+ `manual_payment_detail`（TTL 15 分钟）。
4. 返回站内支付页地址（而非外部 checkoutUrl）：`/settings/payments/<orderNo>`。

### 8.4 付款与提交凭证

- 支付页展示收款码、应付金额（含尾数）、剩余时间、付款备注要求。
- 用户上传凭证（图片；类型与大小限制沿用现有 `manual-payments/files.ts` 的常量），
  可填付款备注；成功后 detail → `pending_verification`，order → `pending`。
- 凭证存**私有前缀**（`manual-receipts/<orderId>/<uuid>`），key 记在 detail。
  shipany 的 `StorageProvider` 只有公开 URL 与上传，没有私有读取，因此扩展：
  - 新增可选的 `getObject({ key, bucket }): Promise<{ body, contentType } | null>`；
    R2 / S3 实现之，本地回退写到 `data/uploads/`（不是 `public/`）；
  - 新增 `GET /api/payment/manual/receipt/<orderNo>`：登录 + 本人或管理员才能读，
    服务端从 storage 取流返回；
  - 收款码图片可以公开（本来就要给付款人看），不受此限制。
- 超过 `expiresAt` 不允许提交；可重新下单。

**过期但确实到账**：保留旧模块的异常通过路径。管理员可以对 `expired` / `rejected`
订单执行 `approve_exception`（必须写理由）；已过期的订单不再占用金额尾数，
若该金额已被新订单复用，管理员需按流水号人工区分。

### 8.5 后台核验

新增后台页 `/admin/manual-payments`，两个区块：

- **收款账户**：增删改、启停、上传二维码（storage）。
- **待核验订单**：按金额/尾数/备注匹配流水；管理员填写实收金额与外部流水号，
  确认或驳回（驳回需原因）。

确认后调用 **shipany 现有的结算路径**：构造一个合成 session
（`paymentStatus`、`paymentInfo.transactionId` = 外部流水号、`amount`、`currency`、
`paidAt`），交给 `settleCheckoutOrder(existingOrder, session, 'manual_payments')`。
积分发放、幂等与审计沿用同一条代码路径，不另写一套结算。

**原子性**：`settleCheckoutOrder` 在自己的 `atomic` 块里只写 `order`（以及积分/订阅），
无法同时更新 `manual_payment_detail`。给它加一个可选的 `onSettled(tx)` 钩子，
在同一个事务内执行；核销传入「detail → settled」的写入与审核字段。这样不会出现
「order 已 paid、detail 仍 pending_verification」的错位。

金额不一致 → `AMOUNT_MISMATCH`，不结算；用户可重新提交说明或管理员驳回。

### 8.6 退款

- 核销退款是线下退款。管理员在后台标记「已退款」并填写流水/备注。
- 走 shipany 的退款收尾逻辑（订单 → `refunded`、积分回滚），但对
  `manual_payments` 跳过渠道退款 API 调用；不涉及订阅取消（核销不卖订阅）。
- detail → `requires_refund` → 退款完成后 → `canceled`（或 `refunded` 由 order 表达）。

### 8.7 前端

- 定价页：核销可用时，支付方式里出现「Manual / 扫码转账」；选中后走站内支付页。
- 用户中心 `/settings/payments`：列表包含渠道订单与核销订单；核销订单有详情页，
  展示收款码、金额、状态、凭证、驳回原因。
- 后台订单列表沿用 `/admin/payments`，`paymentProvider` 显示 `manual_payments`，
  核验入口跳到 `/admin/manual-payments`。

### 8.8 测试

新增 node:test：

- 下单：尾数分配唯一、池耗尽、TTL、禁用时拒绝、订阅商品被拒绝。
- 提交凭证：状态机、过期拒绝、非本人拒绝。
- 核验：只结算一次（并发/重复点击）、金额不符拒绝、结算后积分只发一次、
  order 与 detail 在同一事务内一致。
- 过期异常通过：`expired` 订单可 `approve_exception`，金额尾数可被复用。
- 退款：积分回滚一次、订单状态与 detail 状态一致。

## 9. 文档站模块

- 从本仓移植 `src/modules/docs` 与 `src/components/docs`，去掉 locale 维度，路由改为
  `/docs` 与 `/docs/$slug`（与 shipany 的 locale-free 路由一致）。
- **只换加载层，不动渲染层**：现有文档正文由本仓自己的 `Mdx` 组件解析渲染
  （`content-collections` 只负责读文件、解析 frontmatter、做 locale transform，
  并不产出 HTML）。因此把加载层换成 `import.meta.glob` + 一个小的 frontmatter
  解析器即可，`Mdx`、TOC、搜索、翻页、样式全部原样保留。
- **保留语言维度**：即使当前只启用 `en`，加载器也继续按文件名后缀识别语言——
  `guide.md` / `guide.en.md` 为英文，`guide.zh.md` 为中文，fallback 到 base locale。
  文件约定、`resolveContentLocale`、`contentSlug` 的语义与现在一致；这样以后启用
  多语言时，文档不需要再改加载器。
- glob 路径用 `'/content/docs/**/*.md'`（允许分组子目录），
  `{ eager: true, query: '?raw', import: 'default' }`。
- frontmatter 字段沿用 `title`（必填）、`description`、`order`、`group`、`updated`；
  用一个 zod schema 在加载时校验，并加一条 node:test 遍历所有文件（含各语言版本），
  避免「构建期校验」随 `content-collections` 一起消失。
- 内容目录 `content/docs/` 保留但清空；模块在无内容时渲染空态。
- `docs_enabled` 默认 false：
  - 关闭时 `/docs` 返回 404，导航与页脚不显示入口；
  - 打开后按内容文件生成侧栏、TOC、上一页/下一页与搜索。
- 现有中文文档内容全部删除，不迁移。
- **多语言预留**：路由保持 locale-free（与全站一致），文档语言由当前 locale 决定；
  以后在 `project.inlang/settings.json` 增加语言、补 `messages/*.json` 后，
  文档只要新增 `*.zh.md` 等译本即可，缺失译本回退 base locale。

## 10. 部署

### 10.1 Node（默认）

`pnpm build` → `node .output/server/index.mjs`（`pnpm start`）；Docker 沿用 shipany 的
多阶段构建，`DATABASE_PROVIDER` 构建参数决定 schema 模板。

### 10.2 Cloudflare（并列）

- 保留 `wrangler.example.jsonc` 与 `pnpm cf:build` / `pnpm cf:deploy`。
- D1 作为 Workers 上的默认库；Postgres + Hyperdrive 作为可选项。
- 部署技能以 shipany 的 `/deploy-cloudflare` 为参考重写，品牌、路径、资源名全部换成本仓的。
- **`wrangler.jsonc` 不提交**（gitignore），由技能从 example 生成并填真实 ID。

### 10.3 演示内容

首页就是 shipany 的极简示例页（Hero / Features / Pricing / FAQ / Blog / CTA），
默认文案在 `messages/en.json`，使用者通过 `/quick-start` 或直接改 blocks 替换。

## 11. 测试与 CI

### 11.1 测试

- 保留 shipany 的 20 个 node:test 文件与 `test:*` 脚本。
- 新增核销测试（§8.8）与配置安全测试（§7.4）。
- 新增聚合脚本 `pnpm test`，按顺序跑全部 node:test；不依赖 Playwright。
- 测试自带临时 SQLite + `drizzle-kit push`，CI 无需外部服务。

**生成物前置**：`src/paraglide/` 是 gitignored，但 `tests/english-only.test.ts` 等会
`import '@/paraglide/messages.js'`。干净 clone 下直接跑 `tsc` / `pnpm test` 会失败。
因此新增 `pnpm paraglide:compile`（`@inlang/paraglide-js compile`），并在
`pretest`、`pretypecheck` 与 CI 中先执行。文档站改用 `import.meta.glob` 后不再需要
`content-collections` 的生成步骤。

### 11.2 CI

- `.github/workflows/docker-build.yaml`：原样保留。
- 新增 `.github/workflows/ci.yaml`（push / PR 到 `main`）：
  - Node 22，pnpm 10（与 Dockerfile 一致）；
  - `pnpm install --frozen-lockfile`；
  - `pnpm paraglide:compile`；
  - `pnpm exec tsc --noEmit`；
  - `pnpm test`；
  - `pnpm build`。
- 不再保留本仓旧的 e2e / locale / deploy 工作流。

## 12. 工程文档与技能

参考 shipany 的组织方式，**重写为本仓自己的文档**，不复制其身份：

- `AGENTS.md`：英文单语政策、技术栈、命令、首次启动、schema 变更流程、
  module/route/page 规约、核销支付与文档站的接入说明。不提上游仓、不做同步说明。
- `CLAUDE.md`：`@AGENTS.md`（保持多代理单一入口）。
- `docs/admin-agent.md`：保留 Admin Agent API 的说明，改为中性项目名。
- `.agents/`、`.codex/`、`.cursor/skills`：多代理入口保留。
- 本仓的 `docs/adr`、`docs/agents`、`docs/operations`、`CONTEXT.md`、`DESIGN.md` 删除。

**技能只保留必要项**：

| 保留                | 作用                          |
| ------------------- | ----------------------------- |
| `quick-start`       | 从 brief / 参考站生成完整项目 |
| `clone-website`     | 按参考站重建页面              |
| `new-page`          | 新增后台/用户中心页面并接 API |
| `new-module`        | 新增后端模块（service + API） |
| `new-static-page`   | 新增 MDX 静态页               |
| `design-theme`      | 改配色与字体                  |
| `deploy-cloudflare` | CF Workers + D1 部署          |
| `generate-image`    | 生成页面配图与演示素材        |
| `security-scan`     | 提交前扫描密钥与危险模式      |

删除：`sync-upstream`、`shipany-admin`、`launch-audit`。
技能正文里的 "shipany" 字样、上游路径与账号引用一并清掉。

唯一保留的 docs 子目录：`docs/superpowers/specs/`，作为设计/计划记录。

### 12.1 去身份化清单

落地时逐项检查：

- `package.json` 的 `name`、`description`、任何 `shipany` 字样；
- `README.md`、`AGENTS.md`、技能正文、`Dockerfile`、`.dockerignore`、`wrangler.example.jsonc`；
- `src/config/index.ts` 的 `AUTH_SECRET_PLACEHOLDER`（改成中性占位并保留「未配置即拒绝启动」的语义）；
- `tests/*` 的临时目录前缀与注释；
- 数据库默认名、Worker 名、镜像名；
- 移除 `UPGRADING.md` 与上游同步相关脚本/说明；
- 全仓 `rg -i shipany` 必须为零（`LICENSE` 与本设计文档除外）。

## 13. 迁移阶段

1. **基座替换**：新建分支 `refactor/shipany-base`，把 shipany 内容落到本仓，删除清单
   §6.2 中的旧物；调整 package/README/env/Docker；确认 `pnpm install` → `db:push` →
   `rbac:init` → `pnpm dev` 可跑。
2. **配置收敛**：接入后台设置（branding 已由 shipany 提供），确认无旧 config 依赖。
3. **核销支付**：schema（含 MySQL 生成列）→ service/order → 私有凭证读写 → API →
   用户页 → 后台核验 → 测试。
4. **文档站**：模块移植（glob 加载器）、默认关闭、内容清空、空态与 404 行为。
5. **部署**：Node 验收；CF 构建与 D1 文档/技能适配。
6. **CI 与测试**：聚合脚本、ci.yaml、全绿。
7. **文档与收尾**：AGENTS/README 校对、删除遗留、全量验收。

每一步单独提交，保证中途可回退。

## 14. 我（构建者）先定的点

这些不需要用户回答；用户可在读文档时推翻：

1. **版本号**：改 `1.0.0`，标记这是破坏性重构。旧版本 v0.11.0 的 tag 不动。
2. **包名**：`saas-template`；应用名默认 `My App`（后台可改）。
3. **核销 provider id**：`manual_payments`（沿用旧模块的字符串）。
4. **核销账户**：只存数据库，后台 `/admin/manual-payments` 管理；不再有源码兜底。
5. **尾数与 TTL**：1–99 尾数、15 分钟有效期，沿用旧模块。活跃状态
   （`pending_payment` / `pending_verification` / `settling`）占用金额槽；
   `expired` 释放但允许管理员异常通过。
6. **凭证限制**：图片类型与大小沿用旧模块常量；凭证存私有前缀，通过鉴权路由下载，
   不生成公开 URL。
7. **文档站实现**：改用 `import.meta.glob` + 现有 `Mdx` 渲染，不再引入
   `content-collections`；**保留语言维度**（文件名后缀、base locale 回退），
   以后启用多语言时只需加译本文件。
8. **CI**：`paraglide:compile` → tsc → node:test → build；不引入 Playwright。
9. **存储**：给 `StorageProvider` 增加可选的私有读取 `getObject`；R2/S3 实现，
   本地回退写 `data/uploads/`；收款码仍走公开上传。
10. **核销演示**：默认关闭；demo 商品补 `cnyPriceInCents`，不 seed 账户。
11. **旧仓库内容**：全部留在 git 历史与 `v0.11.0` tag 里，不迁入新树。

## 15. 验收标准

在一台干净机器（或临时目录的干净 clone）：

1. `pnpm install` 成功；`postinstall` 自动生成 `src/config/db/schema.ts`。
2. `cp .env.example .env.development`，只填 `AUTH_SECRET`；`pnpm db:push` 成功。
3. `pnpm rbac:init --admin-email=... --admin-password=...` 创建管理员。
4. `pnpm dev` → 打开首页是极简示例站；`/admin` 可登录；改 `app_name` 后刷新生效，
   重启后仍在。
5. `pnpm build` + `pnpm start` 正常；Docker 构建正常。
6. `pnpm paraglide:compile && pnpm exec tsc --noEmit` 在干净 clone 上通过。
7. `pnpm test` 全绿，包含核销的结算幂等、过期异常通过、退款用例与配置安全用例。
8. `docs_enabled` 默认关：`/docs` 404；打开后能渲染空态/内容。
9. 核销默认关；后台打开 + 建账户后，一次性商品的支付页可访问，凭证可上传与鉴权下载。
10. `pnpm cf:build`（有 `wrangler.jsonc` 时）通过；部署步骤在文档中可复现。
11. 全仓 grep 不到旧配置层的符号（`applySettingsToConfig`、`baseConfig`、
    `VITE_MANUAL_PAYMENT_ACCOUNTS` 等），也不到 `shipany`（`LICENSE` 与本设计文档除外）。
