# CONTEXT.md

本文件是工程 skill 在探查代码库前应优先消费的术语表与不变量清单。随各 sub-plan 落地
持续回填。

## 项目定位

`saas-template`（默认品牌 **Jerbix**）是一个构建在 **Cloudflare Workers** 上的
**TanStack Start** SaaS 起步模板。目标流程：`git clone` → `pnpm install` → `pnpm db:setup`
→ `pnpm db:seed` → 部署。
架构取舍见 `docs/adr/`。

## 术语表

- **core / modules / routes**：三层依赖关系。`core` 是基础设施（db、env、auth、payment、
  storage、email、cache、notify、i18n），可被依赖但不得依赖业务；`modules` 是业务能力，
  只依赖 core 与自身；`routes` 是页面与接口，可依赖前两层。方向由
  `scripts/check-boundaries.ts` 强制，见 ADR-0008。
- **模块公开入口**：`src/modules/<id>/service.ts`。模块根路径与内部文件都不算入口；
  跨模块与路由一律经由 `@/modules/<id>/service`。
- **credits（积分账本）**：`src/modules/credits/service.ts`。采用双表（批次 `credit_grants` +
  流水 `credit_transactions` + 分配明细 `credit_allocations` + 汇总 `credit_balances`）实现
  FIFO 优先扣减最早到期批次、过期作废与按原消费流水逆向退回（`refundCredits`）。
- **权益模型（credits-only）**：套餐之间只差**积分数量与有效期**，没有套餐级功能开关；
  功能开关是实例级的 modules / features。见 ADR-0011。
- **购买发积分**：每种付费方式成功后发放多少积分、有效期多少天，写在
  `src/config/products.ts` 的 offer 上；订阅每期续费再发一次。
- **退款反扣（clawback）**：退款时只扣该订单开出的批次，扣到 0 为止；应扣、实际扣减与
  差额写进流水，退款不因积分不足而失败。
- **期末取消（cancel at period end）**：用户自助取消后本计费周期内仍有效，到期不续费；
  不立即终止。
- **manual-payments（核销型收款）**：`src/modules/manual-payments/service.ts`。原 `collection` 模块，
  管理收款码账户、唯一尾数金额锁池、付款凭证上传与后台人工核销。
- **rbac（角色与权限点）**：`src/modules/rbac/service.ts` 与 `src/core/auth/rbac.ts`。基于 `roles`、
  `permissions`、`role_permissions`、`user_roles` 四张表，支持 `*` 与前缀通配及权限天花板保护。
- **ai-tasks（AI 任务原语）**：`src/modules/ai-tasks/service.ts` 与 `src/core/ai/index.ts`。封装
  AI 任务创建时预扣积分、异步状态轮询、失败或取消时幂等退回积分（revoke）。
- **audit（审计日志）**：`src/modules/audit/service.ts`。记录后台敏感写操作与认证/支付事件。
- **tickets / invite-codes / posts / changelog / taxonomy**：运营与数据库 CMS 模块，均通过各自
  `service.ts` 向后台路由提供读写能力。
- **websiteConfig**：`src/config/website.ts` 导出的站点集中配置，承载语言无关的元数据、
  UI 默认值、模块开关、provider 选择与社交链接；需随请求语言变化的文案不放在这里。
- **createWebsiteConfig(env)**：显式接收 `PublicEnv` 的配置工厂，使脚本与单测可构造独立
  配置，不依赖模块单例。
- **生效配置**：当前真正在用的站点配置 = 出厂配置（`baseConfig`）+ 数据库里的分组。
  全站读 `websiteConfig` 拿到的就是它（Proxy 转发），不需要在调用点区分来源。
- **配置注册表**：`src/core/config/registry.ts`，配置项的唯一事实来源。每个字段声明
  键（点号格式，如 `brand.name`）、类型、默认值与可选的 `envKey`；后台表单、种子、
  校验与 `settings` 表都从它派生。新增配置项只改这里与文案。
- **配置项 / 配置组 / 配置 tab**：配置项是注册表里的一个字段；一组字段构成后台的一张
  卡片（可带「测试连接」）；若干组构成一个 tab（general / modules / auth / payment /
  mail / analytics / notification）。
- **配置密钥加密**：`secret` 类型的字段以 AES-GCM 加密入库（`enc:v1:` 前缀），
  密钥由 `CONFIG_ENCRYPTION_KEY` 派生；后台只回显末四位，留空表示不修改。
  缺口令时拒绝保存含密钥的组，公开参数仍可写。
- **DATABASE_PROVIDER**：数据库形态（`sqlite` / `d1` / `postgres`），同时决定运行时连接
  与构建期生成哪份 schema。见 ADR-0009。
- **方言**：schema 与迁移 SQL 的形态（`sqlite` / `postgresql`）。D1 属于 sqlite 方言。
- **ServerEnv / ManagedEnv / RuntimeEnv**：`src/core/env/server.ts` 的三层形状。`ServerEnv`
  是启动必需项（zod 校验，只有 9 个键）；`ManagedEnv` 是由数据库配置派生的服务凭据形状
  （纯 interface，运行期没有来源）；`RuntimeEnv = ServerEnv & ManagedEnv`，是支付 / 邮件 /
  通知等消费方拿到的形状。`publicEnv` 只剩 `VITE_BASE_URL`，供客户端拼绝对地址。
- **locale**：受支持语言，当前为 `zh`、`en`，默认 `zh`；`zh` 为消息源语言。
- **message**：`messages/{zh,en}.json` 中的文案键值，经 Paraglide 编译为类型化访问器 `m.*()`。
- **seo()**：`src/lib/seo.ts` 的路由 `head()` helper，生成 canonical 与 OG/Twitter meta，
  并把同一 path 用于 hreflang alternates。
- **provider / providerRegistry**：可插拔外部服务抽象（mail / newsletter / notification /
  payment）。由 `src/server.ts` 在**每请求入口**按归一化 env 构建注册表并存入
  AsyncLocalStorage，业务代码经 `getServerContext()` 取用。
- **SiteModule / ServiceModule**：`src/config/website.ts` 的联合类型。`SiteModule` 含
  `docs` / `blog` / `changelog` 与全部服务模块；`ServiceModule` 仅服务模块，供 API 门禁使用。
  `auth` 也在 `ServiceModule` 内，但它**没有 provider 注册表**（接线由 Better Auth 自己持有），
  因此只适用开关与门禁两步。它的必要配置只有一条**矛盾规则**：`auth.requireEmailVerification`
  为 `true` 而 `mail` 未配置完整时，状态为 `incomplete`——要求验证却发不出验证邮件，等于
  让新用户永远无法登录。这是该模块唯一会触发 503 的情形。
- **模块门禁**：`assertPageEnabled`（页面，抛 `notFound()`）与 `getModuleUnavailableResponse`
  （API，404 `MODULE_DISABLED` / 503 `SERVICE_UNAVAILABLE`）。
- **管理台 / 个人中心 / 后台**：`/admin/*` 称**管理台**，`/settings/*` 称**个人中心**；
  **后台**是二者的合称，只在无法拆分时使用。不再使用「工作台」。
- **路由常量表**：`src/config/routes.ts` 的 `adminRoutes` / `settingsRoutes` 收敛了受保护
  区域的每条路径。菜单、面包屑、`head()`、页面内跳转与测试断言都引用这里；除路由文件
  自身的 `createFileRoute(...)` 外不写路径字面量。
- **列表页**：管理台与个人中心的表格页共用 `src/components/data-table`。数据只来自路由
  `loader`，搜索词 / 筛选 / 页码放 URL（默认值不写进 URL），写操作后
  `router.invalidate()` 重新取数，页面不自建缓存。
- **ServiceStatus**：`getServiceStatuses()` 的返回值，`disabled` / `incomplete` /
  `configured` 三态；只表示配置是否齐备，不代表外部服务已就绪。
- **menu item**：`src/config/navigation.ts` 的 `MenuItem` 联合（`link` / `group` /
  `separator`），经 `filterMenuItems` 按模块开关、登录状态与角色递归过滤。
- **contentSlug()**：`src/lib/content-locale.ts` 中把 `foo.zh.md` 与 `foo.md` 归一为同一
  语言无关 slug 的函数，是文档站与 legal 路由「切换语言不 404」的基础。
- **ServerContext**：`src/lib/server-context.ts` 的每请求上下文，含归一化 env、CSP nonce、
  主题与四个 provider 注册表。
- **fetchSession()**：`src/core/auth/session.ts` 的 server function，读当前请求会话并只返回页面
  需要的字段。受保护路由在 `beforeLoad` 用它判会话；必须是 server function，因为会话
  cookie 是 httpOnly 且 `getAuth` 需要每请求 env。
- **受保护路由**：`src/routes/{-$locale}/_layout/settings.tsx`（个人中心，`/settings/*`）与
  `_layout/admin.tsx`（管理台，`/admin/*`）两棵独立子树——pathless layout 的 `beforeLoad`
  先 `assertPageEnabled('auth')`，再用 `fetchSession()` 判会话，未登录 `redirect` 到登录页
  并带上 locale 参数；管理台在此之上再 `assertFeatureEnabled('enableAdmin')` +
  `assertAdminRole()`。外壳（侧栏、面包屑、页面标题）由 `components/dashboard/DashboardShell`
  统一渲染，页面自己不再写标题块。
- **AuthFormMessages**：`src/core/auth/validation.ts` 的校验文案契约。schema 工厂接收文案而非
  自己调 `m.*()`，使校验逻辑不依赖 Paraglide 运行时、可脱离组件单测；页面用
  `authFormMessages()` 求值。
- **blocks 层**：`src/blocks/` 存放页面区块与营销装配——通用区块（`hero`、`pricing`、`faq`…）、
  首页各分区（`landing-*`）、`landing-page.tsx` 组合入口，以及 `header` / `footer` /
  `marketing-layout`。文件名 kebab-case、导出 PascalCase 具名组件、**不设 barrel**：路由直接按
  文件引用，新增区块不需要登记清单。与 `components/` 的分工是「区块（可整段复用）」对
  「零件（`ui` 上游原件、`layout` 布局件、`data-table` 表格）」。
- **模板工程**：本仓 `Woods30/saas-template`，含模板源码与技术文档。默认品牌为 Jerbix。
  **唯一源码源**。
- **官网工程**：另一个仓 `Woods30/jerbix`，定位为模板的官网 + 支付 + 商业条款文档。
  保留完整代码副本，通过 `git merge template/main` 跟进本仓。
- **实例项目**：使用者从模板工程克隆后改造成的自己的项目。
- **出厂值 / 生效配置**：出厂值是注册表声明的默认值（加上 `src/config/website.ts` 里不在
  注册表的结构值）；生效配置是数据库 `settings` 表逐字段覆盖后的结果。后台改的是生效配置，
  保存后立即生效。
- **两个品牌源**：`websiteConfig.metadata.name`（footer / OG / JSON-LD，可后台改）与
  `messages.site_name`（营销文案里的品牌字样，编译期）。二者不同步时页面标题与文案里的品牌名
  会不一致。

## 关键不变量

- **env 边界**：业务代码**不得**直接读 `process.env` / `import.meta.env`，一律经
  `src/core/env/public.ts`、`src/core/env/server.ts`。env 只用于启动必需项；支付 / 邮件 /
  通知 / 分析的凭据只在 `pnpm db:seed` 时作为初值写进数据库，运行期只读数据库。
- **`VITE_` 前缀 = 公开**：`VITE_` 变量在构建时进入客户端 bundle，任何人可见，**不得**存放
  secret。`VITE_BASE_URL` 是唯一的公开启动变量。
- **服务端 secret**：启动 secret（`BETTER_AUTH_SECRET`、`CONFIG_ENCRYPTION_KEY`）来自
  Workers binding；业务凭据来自加密后的数据库配置，二者都不进客户端 bundle。
- **locale 协商**：按 **URL 显式前缀 → cookie → `Accept-Language` → 默认语言**的顺序解析；
  SSR 与 hydration 共用 `src/lib/locale.ts` 的同一实现，保证两侧一致。
- **单一配置入口**：配置字段只在 `src/core/config/registry.ts` 声明；`websiteConfig` 由
  数据库值经 `applySettingsToConfig` 求出，全站经 Proxy 读取，只放语言无关值。需随请求
  语言变化的文案必须在工厂调用、组件 render 或路由 `head()` 内调用 `m.*()` 求值。
- **消息键配对**：新增消息键必须在所有 locale 文件中同时存在，由 `scripts/check-locale.ts`
  双向校验。
- **生成物禁改**：`src/routeTree.gen.ts`、`src/locale/paraglide/**`、
  `.content-collections/generated/**` 均不得手工编辑。
- **Workers 运行时**：非 Node.js，含 native binding 的包不可用（见 `docs/adr/0001`）。

## 当前范围与状态

- **已完成**：基础设施（Sub-Plan A）、业务模块（B：认证 / 支付 / 存储 / 邮件 / Newsletter /
  通知 / D1）、营销页面与内容站（C：`src/blocks/` 区块层 + 文档站 / 博客 / 更新日志）、测试与
  部署（D：E2E / CI / CSP）、品牌化与 Landing 单页、网站源码配置与公共菜单（模块开关、
  菜单契约、服务状态、配置文档）、个人中心（`/{locale}/settings/*`：资料 / 安全 / 登录设备 /
  通知偏好 / API 密钥 / 用户管理，含 `fetchSession` 守卫）、管理台（`/{locale}/admin/*`：
  概览 / 用户 / 角色 / 审计 / 订单 / 订阅 / 积分 / 内容 / 工单 / AI 任务 / 核销订单）与表单统一
  （TanStack Form + Zod + shadcn `Field`）。管理台与个人中心的列表页统一用
  `components/data-table`。
- **尚未实现**：文件上传、AI 网关、PWA。`websiteConfig.features` 中对应的开关是能力边界
  标记，不注册路由。
- **两仓关系（2026-11-02 定）**：本仓是**模板工程**（`Woods30/saas-template`，模板源码与
  技术文档），**官网工程**是另一个仓（`Woods30/jerbix`，官网 + 支付 + 商业条款
  文档），保留完整代码副本并靠 `git merge template/main` 跟进本仓。拆分取舍见
  `docs/adr/0004`、`docs/adr/0005`。
- **Node 下限**：`package.json` 的 `engines.node` 为 `^22.12.0 || ^24.0.0 || >=26.0.0`（`vitest@5`
  排除奇数大版本 23 / 25，故为精确 union 而非简单 `>=`；`wrangler` 要求 ≥22、
  `@tanstack/react-start` 要求 ≥22.12.0）。

## 决策日志索引

- `docs/adr/0001-why-cloudflare-workers.md` —— 为什么选择 Cloudflare Workers 作为运行时。
- `docs/adr/0002-shadcn-label-pattern.md` —— shadcn/ui 的 Label 组合模式。
- `docs/adr/0003-product-config-and-exclusivity.md` —— 套餐配置与账号级订阅。
- `docs/adr/0004-template-and-official-site-split.md` —— 模板工程与官网工程分仓。
- `docs/adr/0005-init-replacement-table.md` —— init 用声明式替换表而非占位符 token（已随 init 废弃）。
- `docs/adr/0008-core-modules-routes-layering.md` —— 三层分层与模块公开入口。
- `docs/adr/0009-multi-dialect-database-and-config.md` —— 多方言数据库与配置入库。
- `docs/adr/0010-settings-in-database.md` —— 配置注册表、密钥入库加密与 env 边界（取代 ADR-0009 的密钥与 `VITE_MODULES` 两条）。
- `docs/adr/0011-credits-only-entitlements.md` —— 权益模型收敛为 credits-only，补齐退款、自助取消与购买发放。

## 面向 AI 代理的指导

仓库根 `AGENTS.md` 是跨代理的统一入口（命令、目录地图、不变量、工作方式、确认清单）；
`CLAUDE.md` 转发到它。新增或修改项目规约时改 `AGENTS.md`，不要在多处复制。

> 提醒：术语表与不变量应随每个 sub-plan 落地同步更新；尚未实现的模块不要在实现前登记为
> 既有概念。

## 支付模型

- 套餐只在 `src/config/products.ts` 声明一次，prices 映射本站选项到当前 provider 销售引用。
- 站点按部署选择一个 provider（内置 Stripe 与 Creem）；金额和真实周期来自外部价格目录。
- 账号全局最多一份未终止订阅，一次性商品独立购买，不存在等级互斥或买断接管。
- 订阅管理交给托管 Portal；Webhook 由适配器转换，通用 events.ts 落库。
