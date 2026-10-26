# 模板化改造：目录结构、设计系统与文档中心

- 日期：2026-10-21
- 状态：待执行
- 参照物：Tanstarter（https://docs.tanstarter.dev）

## 意图

仓库现在是一个**能跑的产品**，但还不是一个**好用的模板**。克隆者拿到它之后，
需要在三处迷路：

1. **改文案不知道去哪**：页面文案在 `src/config/pages/`，渲染在
   `src/components/sections/`，两棵树下各一份，且每个区块又套了
   `<block>/<Block>.tsx + index.ts + types.ts` 三层文件。
2. **上线路径是散的**：Cloudflare、数据库、存储、缓存四篇的 `order` 排在功能集成
   之后（14–17），但它们是「配好才能跑」的前置；README 与文档站「快速开始」内容
   重复，且都没把「配好 Cloudflare → 自动部署」讲成一条线。
3. **AI 代理入口太重**：`AGENT.md` 471 行，其中约 250 行是主题配色、工作台布局、
   支付链路、测试分层等深度细节。它作为「克隆后第一份读物」太厚，而这些内容本身
   有价值，只是不该放在入口。

**成功的样子**：一个陌生开发者（或他的 AI Agent）克隆仓库后，按 `README` →
`AGENTS.md` → 文档站前三篇，能在一小时内跑起本地站点、改完站点信息、配好
Cloudflare 并完成首次部署；之后再按需深入各功能模块。

## 目标

- 目录收敛：页面区块的「配置」与「渲染」各归其位，层级不超过三层。
- `DESIGN.md`：把现有设计系统（配色、字体、圆角、阴影、层次、组件约定）写成文档，
  成为改 UI 时的唯一依据。
- 文档中心重构：按「部署优先」重排，正文精简到帮助文档体量，中英双语同步重写。
- `AGENTS.md` 成为跨代理的唯一入口（~100 行），深度细节下沉到文档站。

## 非目标

- 不改运行时行为：路由、API、数据库 schema、认证流程一律不动。
- 不改视觉：`globals.css` 的 token 数值不动，`DESIGN.md` 只做描述。
- 不换品牌：保留 Jerbix 名称与 Logo，文档中标注为「示例品牌」并给出替换指引。
- 不重写营销页文案：只搬位置、调整导出，不重写内容。
- 不新增运行时依赖。

## 已定决策（用户确认）

| 议题 | 决策 |
|---|---|
| 目录结构 | 收敛页面区块层，不做全仓扁平化 |
| 代理入口 | `AGENTS.md` 为主，压到 ~100 行；`AGENT.md` 改为转发 |
| 文档双语 | 继续全量双语，英文按新结构重写（非逐字翻译） |
| 品牌 | 保持 Jerbix，标注为示例品牌 |
| 文档主线 | 部署优先，再展开基础设施 |
| 验证 | 最后统一跑全量检查 |

## 方案

### 1. 目录收敛

现状 36 个文件分布在两棵树：

```
src/config/pages/{home,about,contact,pricing,roadmap,waitlist,features,index}.ts   # 8
src/components/sections/<block>/{<Block>.tsx,index.ts,types.ts}             # 9 × 3 = 27
src/components/sections/index.ts                                            # 1
```

目标：

```
src/config/pages/{home,about,contact,pricing,roadmap,waitlist,features,index}.ts   # 8，内容不变
src/components/sections/{Hero,Features,Stats,Faq,Testimonials,NewsletterCta,Roadmap,Cta,Pricing}.tsx
src/components/sections/index.ts
```

- **文件名保持 PascalCase**，与 `src/components/marketing/LandingPage.tsx` 等既有组件一致
  （`src/components/ui/` 的 kebab-case 是 shadcn 上游约定，不适用于本目录）。macOS
  大小写不敏感，`git mv` 需用中间名两步走，避免只改大小写的 rename 丢失。
- `blocks/marketing` 两级目录压成 `sections` 一级，每个区块**单文件**同时导出组件与
  类型（去掉 `index.ts` 与 `types.ts` 的搬运层）。
- **`sections/index.ts` 的契约保持不变**：`blocks` 常量仍是**恰好 8 个键**
  （`Hero` / `Features` / `Stats` / `Faq` / `Testimonials` / `NewsletterCta` /
  `Roadmap` / `Cta`），**不含 Pricing**——`tests/unit/blocks.test.ts` 钉死了这一点，
  且 `Pricing` 在页面里是按具名组件单独引入的，不属于通用区块注册表。
  原有的 15 个类型再导出（`FeatureItem` / `StatItem` / `FaqItem` / `RoadmapItem` /
  `RoadmapStatus` / `Testimonial` / `PricingPlan` / `PricingProps` 等）全部保留，
  仅改来源路径。
- `config/blocks` 改名 `config/pages`：它承载的是「每个页面的文案与区块编排」，
  不是「区块本身」，改名后「改首页文案去 `config/pages/home.ts`」一目了然。
  `index.ts` 的导出名（`homeBlocks` / `aboutBlocks` / `pricingBlocks` /
  `getPricingPlans` …）**原样保留**，不做二次命名。
- **`getPricingPlans` 留在 `config/pages/pricing.ts`**。它是运行时逻辑（被核心区
  `src/payment/billing-query.ts` 与 `src/routes/api/webhooks/stripe.ts` 调用），
  移去 `config/payment.ts` 会触碰核心区且违反「不改运行时行为」的非目标。文档里
  说明该文件同时承担「定价页文案」与「plan → price 映射」两件事即可。
- **`src/components/marketing/` 原地不动**。它与 `sections/` 是两个层级：
  `marketing/` 是页面级装配（`LandingPage` / `MarketingLayout` / `Navbar` / `Footer`），
  `sections/` 是可复用的内容区块。在 `project-structure` 文档里写明这条区分。

**需要同步改 import 的 23 个文件**（不止文档初稿列的 9 个）：

| 类别 | 文件 |
|---|---|
| 生产代码 · 配置 | `src/config/payment.ts`、`src/payment/billing-query.ts`、`src/routes/api/webhooks/stripe.ts` |
| 生产代码 · 页面 | `src/components/marketing/LandingPage.tsx`、`src/routes/{-$locale}/pricing.tsx`、`.../about.tsx`、`.../contact.tsx`、`.../features.tsx`、`.../roadmap.tsx`、`.../waitlist.tsx` |
| 测试 | `tests/unit/blocks.test.ts`、`tests/unit/billing-query.test.ts`、`tests/components/navigation.test.tsx`、`tests/components/roadmap.test.tsx`、`tests/components/newsletter-cta.test.tsx`、`tests/components/pricing.test.tsx`、`tests/unit/core-paths.test.ts` |
| 仓库文档 | `docs/architecture.md`（同时列了两棵树的路径） |

**必须逐条处理的深导入**（压平后会解析失败，或指向不存在的 `types` 模块）：

- `tests/components/pricing.test.tsx:4` → `.../pricing/Pricing`
- `tests/components/pricing.test.tsx:5` → `.../pricing/types`（全仓唯一的 `types` 深导入）
- `tests/components/newsletter-cta.test.tsx:3` → `.../newsletter-cta/NewsletterCta`
- 指向区块目录 `index` 的深导入：`src/config/pages/pricing.ts:2`、`roadmap.ts:2`、
  `waitlist.ts:2`、`src/routes/{-$locale}/pricing.tsx:5`

> `tests/unit/core-paths.test.ts` **不会因改名失败**——它只把该路径当样例传给
> `isCorePath()`，而 `CORE_PATHS` 不含该前缀，换成任何路径都仍返回 `false`。
> 仍应同步改名，只是为了让示例保持准确。

### 2. 设计系统文档（`DESIGN.md`）

仓库根新增，内容取自 `src/styles/globals.css` 的现有实现与注释：

- 设计立场（紫只出现在强调位、中性灰正文、三层纵深）
- 颜色 token 表（明 / 暗两值、语义、使用约束、对比度结论）
- 字体与字号（Inter / Quicksand / JetBrains Mono + 中文回退栈）
- 圆角、阴影、间距、动效
- 层次模型（background < sidebar < card / popover）
- 组件约定（shadcn 原件不改、`cn` 合并、图标库）
- 改主题时**必须同步的两处**（`website.ts` 的 `themeColor` 与 `globals.css`）

### 3. 文档中心重构

分组与顺序（`order` 即阅读顺序）。**frontmatter 的 `group` 必须写稳定 key**，
不能写中文标签——`DocsSidebar` 用 key 查 `GROUP_TITLE`，写中文会让英文侧栏显示中文：

| order | slug | group（key） | 说明 |
|---|---|---|---|
| 1 | getting-started | `start` | 克隆 → 跑起来 → 改站点 → 部署，一页讲完主线 |
| 2 | configuration | `config` | `websiteConfig` 全字段 |
| 3 | navigation | `config` | 导航 / 页脚 / 社交 |
| 4 | environment | `config` | 两层 env 与 `VITE_` 规则 |
| 5 | cloudflare | `deploy` | 账号、Token、子域、首次部署、自动部署 |
| 6 | database | `deploy` | D1 + Drizzle |
| 7 | storage | `deploy` | R2 |
| 8 | cache | `deploy` | KV |
| 9 | integrations | `features` | 六个模块的门禁语义总览 |
| 10 | auth | `features` | Better Auth |
| 11 | auth-account | `features` | 个人中心 |
| 12 | email | `features` | Resend / Cloudflare Email |
| 13 | newsletter | `features` | 订阅 |
| 14 | payment | `features` | Stripe |
| 15 | notifications | `features` | Discord / 飞书 |
| 16 | analytics | `features` | GA / Plausible / Umami / Clarity |
| 17 | api-keys | `features` | API 密钥 |
| 18 | user-management | `features` | 管理员 |
| 19 | project-structure | `develop` | **新增**：目录地图与「改哪里」速查 |
| 20 | design-system | `develop` | **新增**：`DESIGN.md` 的站点版摘要 + 工作台布局 + 品牌 Logo 规范 |
| 21 | forms | `develop` | TanStack Form 约定（**`group` 也要从 `config` 改成 `develop`**） |
| 22 | testing | `develop` | **新增**：测试分层与常用命令 |

`design-system` 一页承载三块内容（用户确认合并）：设计 token 摘要、工作台
（`/dashboard/*`）的布局骨架与侧栏结构、品牌 Logo 的三套变体与替换步骤。
目标 90–110 行，是唯一允许超过 90 行的页面。

- 分组 key 由三值扩到五值：`start` / `config` / `deploy` / `features` / `develop`。
  `deploy` 与 `develop` 是**新增 key**，必须同时改三处，否则侧栏会原样显示
  `deploy` / `develop`：
  1. `src/components/docs/DocsSidebar.tsx` 的 `GROUP_TITLE`，新增
     `deploy: m.docs_group_deploy`、`develop: m.docs_group_develop`；
  2. `messages/zh.json`：`docs_group_deploy: "部署"`、`docs_group_develop: "开发"`；
  3. `messages/en.json`：`docs_group_deploy: "Deployment"`、
     `docs_group_develop: "Development"`。改完跑 `pnpm locale:sort`。
- 按 `groupDocs` 的「组内最小 order」规则，五组的实际先后是
  `start`(1) → `config`(2) → `deploy`(5) → `features`(9) → `develop`(19)，与上表一致。
- **`forms` 只改 `order` 不改 `group` 会落在 `config` 组末尾**，标签不报错但分组错位，
  必须两处一起改。
- 现有测试里没有任何一条断言真实内容的组标题文案，所以 `deploy` / `develop`
  退化成裸 key **不会被任何测试抓到**——实施后需人工在 zh / en 两侧各看一眼侧栏。
- 正文体量目标：单页 40–90 行（现有多页 150–230 行）。删掉重复的「参考资料」
  长列表，每页保留 2–4 条真正需要的官方链接。
- 每页保留「下一步」小节（`DocNextSteps` 依赖它的 `./slug` 相对链接）。
- 补上缺失的 4 篇英文：`cache` / `cloudflare` / `database` / `storage`。
- **不新增 `index` 文档**。`/docs` 继续由 `docsLanding()` 落在排序后的第一篇
  （即 `getting-started`）。理由：`e2e/docs.spec.ts` 断言 `/docs` 重定向后的 H1
  含「快速开始」，新增 `index` 会让 `docsLanding()` 优先返回 `index` 并打破该契约；
  且「开始」组的第一篇本身就承担首页职责，多一层索引页反而拖慢主线。

#### 正文写法（对齐 Tanstarter）

文档的定位是**引导开发者完成配置**，不是 API 参考。每页按同一骨架写：

```markdown
---
title: 数据库
description: 一句话说明这页能让你完成什么
---

一段引子：这页解决什么问题、做完之后得到什么。

## 前提条件

需要先完成的事，带链接。可选前置单独标注。

## 设置

### 创建数据库

一句话指令，紧跟命令块：

```bash
pnpm exec wrangler d1 create my-db
```

### 回填配置

配置片段上方标文件名，行内注释标出要改的行：

```jsonc title="wrangler.jsonc"
{ "database_id": "REPLACE_ME" }  // 换成上一步的输出
```

## 命令

| 命令 | 作用 |
|---|---|
| ... | ... |

## 参考资料

- 2–4 条官方文档链接

## 下一步

- [存储](./storage)——一句话
```

具体约定：

- **H2 固定为**：`前提条件` / `设置`（或更具体的动词，如 `部署`）/ `命令`（有命令表时）/
  `参考资料` / `下一步`。
- **顺序步骤用 H3**，不写 `1. 2. 3.` 的编号列表——Tanstarter 同样用 H3 表示阶段，
  编号只在单个 H3 内部确实有先后时使用。
- **代码块**：shell 命令用 `bash`，配置片段标 `title="文件名"`，需要改动的地方用
  `#` 或 `//` 行内注释标出，不另写一段解释。
- **提示用行内 `>`**，不引入新的 callout 组件。危险操作（覆盖配置、改 schema、
  删资源）必须有一条 `>` 警告。
- **表格只在做对比时用**（env 类型对比、provider 必填项、命令表），不用表格堆字段
  说明——字段说明归 `configuration` 一页。
- **结尾固定**：`参考资料` 在前、`下一步` 在后，`下一步` 用 `./slug` 相对链接
  以便语言切换后仍指向对应译文。

### 4. 代理入口

- 新增 `AGENTS.md`（~100 行）：项目定位、命令表、目录地图、7 条不变量、
  「改哪里」速查、指向文档站的索引、确认清单。
- `AGENT.md` 改为一行转发（保留文件，避免既有引用断链）。
- `CLAUDE.md` 精简为指向 `AGENTS.md`。
- 深度内容下沉：主题与配色 → `DESIGN.md`；工作台布局、支付链路、测试分层 →
  文档站对应页。
- 同步 `README.md`、`CONTEXT.md` 中的引用。

### 5. 清理重复文档（用户确认删除）

- **删除** `docs/deployment.md`、`docs/architecture.md`：内容分别由文档站的
  `cloudflare` 与 `project-structure` 覆盖，保留两份必然漂移。
- **保留** `docs/adr/`（决策记录，不可再生）、`docs/agents/`（代理 skill 配置）、
  `docs/operations/wrangler-bindings.md`（与文档站不重复的运维细节）。
- 同步移除 `README.md`、`AGENT.md`、`CONTEXT.md` 中对这两个文件的引用。

### 6. README

改为模板门面：一句话定位、技术栈、三条命令跑起来、主线文档索引、
「这是示例品牌，怎么改成你的」、许可。

## 风险与对策

| 风险 | 对策 |
|---|---|
| 目录改名漏掉引用 | 最后统一跑 `pnpm check`（含 `tsc`）+ `pnpm test` + `pnpm test:e2e`；改名前先按上面的 23 文件清单逐一确认 |
| 文档顺序改动导致「下一步」链接指向错页 | 重排后逐页核对相对链接；`docs.spec.ts` 断言 `/docs` 重定向 |
| 英文文档与中文结构漂移 | 先定中文，再按同一结构重写英文；最后跑 `pnpm check:locale` |
| `DESIGN.md` 与 `globals.css` 漂移 | `tests/unit/theme-colors.test.ts` 已守 `themeColor`；文档中明确标注「以 CSS 为准」 |
| `deploy` / `develop` 分组退化成裸 key | 无测试覆盖，改完人工在 zh / en 两侧各看一眼侧栏 |
| macOS 大小写不敏感导致 rename 丢失 | 用两步 `git mv`（先改临时名再改目标名） |

## 会受影响但**不会坏**的测试（已核实）

- `tests/unit/core-paths.test.ts` —— 路径仅作样例传入 `isCorePath()`，改名不影响断言
- `tests/unit/docs.test.ts`、`docs-search` / `docs-pager` / `docs-next-steps` —— 合成 fixture
- `tests/components/docs-layout.test.tsx` —— 吃真实内容，但只断言「按钮数 > 0」与
  `configuration` 仍在 `config` 组，重排后仍应通过
- `tests/components/legal-docs-render.test.tsx` —— 只要 `privacy` / `terms` 的 slug
  与标题不变即可

## 会坏的测试（需同步修改）

| 文件 | 原因 |
|---|---|
| `tests/unit/blocks.test.ts` | import 路径；且必须保持 registry 恰好 8 键、不含 `Pricing` |
| `tests/unit/billing-query.test.ts` | `@/config/pages/pricing` 路径 |
| `tests/components/navigation.test.tsx` | `@/config/pages/home` 路径 |
| `tests/components/roadmap.test.tsx` | 指向区块目录 `index` 的导入 |
| `tests/components/newsletter-cta.test.tsx` | 深导入 `.../newsletter-cta/NewsletterCta` |
| `tests/components/pricing.test.tsx` | 深导入 `.../pricing/Pricing` 与 `.../pricing/types` |
| `e2e/docs.spec.ts` | 仅当新增 `index` 文档时才会坏；本方案不新增，**不需要改** |

## 实施顺序

1. 目录收敛 + import 修正（结构变更，单独提交）
2. `DESIGN.md`
3. `AGENTS.md` / `AGENT.md` / `CLAUDE.md` / `README.md` / `CONTEXT.md`，
   删除 `docs/deployment.md`、`docs/architecture.md`
4. 文档中心：分组 key 与 locale 消息 → 中文重写 → 英文重写 → order 调整
5. 全量验证（`pnpm check` + `pnpm test` + `pnpm test:e2e`）

## 留给实施者

- 每篇文档的具体措辞
- `DESIGN.md` 的详略取舍
- 新增三篇开发类文档的边界（`project-structure` / `design-system` / `testing`）
