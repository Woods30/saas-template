# Jerbix 模板重塑设计（去 ShipAny 化 + 去 Guest Posts + 全新落地页）

**日期**：2026-11-20
**状态**：待确认
**上游基线**：本仓已于 2026-11-20 由 shipany 基线整体重构并合入 `main`（`b2b0b21`）。

---

## 1. 为什么做

这套代码现在要作为 **Jerbix** 品牌的可售卖模板发布。它脱胎于 ShipAny 的骨架，
即使品牌痕迹只剩 `LICENSE` 一处，结构与叙事仍带着强烈的"又一个 starter"味道：
落地页是 `Hero → Features → Pricing → FAQ → Blog → CTA` 的标准骨架，文案是通用
SaaS 占位词，还带着一套与模板定位无关的 guest posts（付费投稿）功能。

买家花钱买的是**省时间**，不是"另一个 AI starter"。要让模板卖得动，必须做到三件事：

1. **认不出来**：拿到代码的人不会说"这是 ShipAny 改的"。
2. **说得清**：落地页一屏之内讲明白"这东西帮我解决什么问题"。
3. **干净**：没有半成品功能、没有上游残留、没有装不上的一环。

---

## 2. 目标与非目标

### 目标

- **代码与上游差异度达标**（§8 的可测指标）：非 UI 文件零逐字相同、
  >0.95 的文件 ≤30、中位相似度 ≤0.90。
- 全仓品牌换成 **Jerbix**，`LICENSE` 换成自有的商业授权文本。
- 彻底移除 guest posts（付费投稿）功能，不留死代码、死字段、死文案、死测试。
- 重写默认落地页：换叙事、换版式、换视觉，而不只是换词。
- 全站视觉重设计（前台、后台、文档站），建立一套与上游无关的设计系统。
- 后台仪表盘重做成运营看板（收入 / 付费客户 / 订阅 / 账户 / 增长 / 访客 六张卡，
  跟随全局周期的趋势图，待处理队列，唯一一套漏斗），移除 `/admin/operations`。
- 等价改写代码写法、重组文件边界、重写代码注释与对外文案，统一成 Jerbix 的口吻。
- **收敛并蒸馏 `.claude/skills/`**：9 个技能收敛为 8 个（`new-page` 吸收
  `new-static-page`，`quick-start` 改名 `new-app`），再去掉排错清单与重复步骤，
  总行数从 2236 降到 1150 以内（见 §8）。
- 功能行为不变：除 guest posts 外，认证、支付、核销、积分、后台、文档站全部照常，
  测试全绿。

### 非目标

- 不改技术栈、不换框架、不动构建与部署链路。
- 不重命名数据库表名与列名（含 guest post 以外的一切既有表），避免给已部署实例制造迁移风险。
- 不做多语言（仍是 `locales: ["en"]`），不恢复 `/zh`。
- 不重写业务逻辑；注释与命名的调整不得改变行为。
- 不提供真实商品与真实价格——模板里的价格是买家要替换的示例值。

### 反目标（即使功能上跑通也算失败）

- 落地页仍然以"功能清单"开场。
- 仓库里还能搜到任何上游品牌、上游仓库链接、上游作者名。
- guest posts 只删了页面，`pricing.ts` / schema / RBAC 里还留着它的影子。
- 视觉上仍是"白底 + 圆角卡片 + 紫蓝渐变"的通用 AI 模板长相。
- 任何非 UI 源文件与上游逐字相同，或相似度超过 §8 的上限。

---

## 3. 定位（我的判断，已与用户对齐）

**买家**：会写代码的独立开发者与小团队。他们已经知道怎么做产品，卡在"从零搭
登录、支付、后台、权限"这几周上。

**卖点**：**能直接收钱的 SaaS 底座**。三条收款路径（订阅 / 积分 / 线下核销）
都是现成的，后台配好就能上线；默认 SQLite，零外部服务即可跑起来。

**一句话**：*Ship your SaaS and take the first payment this week.*

---

## 4. 品牌

| 项 | 决定 |
|---|---|
| 品牌名 | Jerbix |
| 默认 `VITE_APP_NAME` | `Jerbix` |
| 默认元标题 | `Jerbix — the SaaS starter that takes payments` |
| 域名占位 | `https://jerbix.com`（示例值，买家替换） |
| Logo | 纯文字标 + 一个账本刻线符号（不用图片，避免占位图形残留） |
| Favicon | 重做为同符号的 SVG |
| 邮件署名 | `Jerbix`，发件人显示名随 `app_name` |

`LICENSE` 采用 **Jerbix 商业授权**，两档：**Personal**（个人，构建无限个产品）与
**Team**（团队，多席位，构建无限个产品）。两档都**禁止转售模板本身**。文本从零起草，
与上游条款无任何段落重合。企业采购走邮件联系，不在 `LICENSE` 里单列。

---

## 5. 移除 Guest Posts（付费投稿）

这不是一个页面，是一条贯穿全仓的功能链。**51 个文件**涉及（其中 24 个文件名带
`guest`），必须连根拔：

**删除的界面与路由**
- `/guest-post`（营销页）、`/settings/guest-posts/*`
  （`/blog/write-for-us` **不是独立路由**，只是 `src/routes/blog/index.tsx` 里的一个
  链接与 `blog.write_for_us` 一个键，一并清掉）
- `/admin/guest-posts`、`/api/guest-posts/*`、`/api/admin/guest-posts/*`

**删除的模块与规则**
- `src/modules/guest-posts/*`、`src/server/guest-posts/*`、`src/lib/guest-post-rules.ts`
- `src/hooks/use-guest-post*`、`src/blocks/guest-post.tsx`
- `src/server/admin/handlers/guest-posts*.ts`

**删除的数据**
- `guest_post` 表（sqlite / postgres / mysql 三套 schema 同步删）
- `post.type` 的 `'guest'` 取值与相关分支（`src/content/posts/*`、`src/modules/posts/*`）
- `pricing.ts` 里 `guest_post_standard` / `guest_post_premium` 与 `listGuestPostPackages()`、`kind: 'guest_post'` 字段
- 支付与通知里针对 guest post 的分支（`payment/service.ts`、`notify/service.ts`、`checkout.ts`、`user/orders.ts`）
- `scripts/init-rbac.ts` 里 guest post 相关权限

**删除的文案与测试**
- `messages/en.json` 中 **69 个 `guest_posts.*` 键**（另含 `admin.guest_posts.*`、
  `settings.guest_posts.*` 两组），以及 `blog.write_for_us`、`blog.sponsored`、
  `blog.preview_banner`、`guest_posts.preview`
- `tests/guest-posts.test.ts`、`tests/guest-post-notify.test.ts`

**验收标准**：`rg -i "guest.?post"` 在 `src/ scripts/ tests/ messages/` 下零命中；
`pnpm db:push` 三方言均可建库；测试全绿。

**代价（需知晓）**：已部署的实例升级后，`guest_post` 表与其数据会随 schema 消失。
模板面向新买家，可接受；但要在 `README.md` 的升级说明里写清楚（本仓**没有
`CHANGELOG`**，可以新建一个，但不要假设它已存在）。

---

## 6. 落地页：从"功能清单"到"收到第一笔钱"

### 新结构

```
1. Hero            —— 一句话价值 + 两个 CTA + 一张"收据"视觉
2. Three rails     —— 订阅 / 积分 / 线下核销，三条收款路径并排对比
3. What's inside   —— 开箱能力网格（认证、后台、RBAC、存储、邮件、文档、分析…）
4. Steps           —— 从 clone 到收到第一笔钱：4 步
5. Pricing         —— 模板授权档位（Personal / Team）+ 一个支持订阅
6. FAQ             —— 授权、部署、数据归属、能否二次售卖
7. CTA             —— 收尾行动
```

**移除**：落地页上的 Blog 区块（`src/blocks/blog-section.tsx` 不再挂在首页）。
Blog 模块与 `/blog` 路由保留，买家可自行启用；首页不再用博客填充。

### 文案（英文，定稿方向）

**Hero**
- Eyebrow：`JERBIX · SAAS STARTER`
- Headline：`Ship your SaaS. Take the first payment this week.`
- Sub：`Auth, admin, subscriptions, credits and offline transfers are already wired. Configure them in the dashboard — no second repo, no glue code.`
- CTA：`Start building` / `See what's inside`

**Three rails**（这是整页的核心差异化）
- `Subscriptions` — `Recurring billing with Stripe. Plan changes, trials and cancellations handled.`
- `Credits` — `Metered usage with a ledger you can audit. Top up, spend, refund.`
- `Offline transfer` — `Collect by bank transfer or QR. Every order gets a unique amount, you approve the receipt.`

**Steps**
1. `Clone and run` — `pnpm install && pnpm db:push && pnpm dev`
2. `Open the dashboard` — `Everything the buyer configures lives here: name, theme, keys, payment rails.`
3. `Connect a rail` — `Stripe keys, or just a collection account with a QR image.`
4. `Ship` — `Node or Cloudflare. SQLite, Postgres or MySQL.`

**Pricing**：定价区卖**真实商品**，不是静态卡片。`src/config/pricing.ts` 改成三件：

| productId | 形态 | 演示的轨道 |
|---|---|---|
| `personal_license` | 一次性 | Stripe 一次性支付 / 线下核销 |
| `team_license` | 一次性 | Stripe 一次性支付 / 线下核销 |
| `support_monthly` | 订阅（送积分） | Stripe 订阅 + 积分轨道 |

金额全部是示例值（如 $149 / $399 / $29 每月），README 与 `AGENTS.md` 注明"改价只改
`src/config/pricing.ts`"。不发放 license key、不做授权校验——结账成功后只是创建订单
与授予积分，这是模板演示支付链路的方式，买家按需替换目录或接入自己的发放逻辑。

**订阅文案只写代码真的支持的能力**：周期扣款、取消订阅。现有代码没有换套餐/按比例
折算/Stripe 试用（`trialPeriodDays` 只有 PayPal 用），文案不得承诺这些。

**FAQ**：授权范围、能否转售、部署方式、数据归属、升级与支持。

### 视觉母题：一张收据

Hero 右侧不是抽象插画，而是一张**渲染出来的收据卡片**：细线分隔、等宽数字、
朱红色的"PAID"印章、底部锯齿边。它同时承担三件事——解释产品（收款）、建立视觉
识别（账本美学）、且完全不依赖图片资源。

---

## 7. 视觉系统：Ledger

现有主题是 shadcn 默认的暖灰 + `0.625rem` 圆角 + 衬线大标题，与上游同源。
Jerbix 换一套**账本 / 票据**美学：纸与墨的对比、朱红强调、直角、发丝线。

### 色板（OKLCH）

| 令牌 | Light | Dark | 用途 |
|---|---|---|---|
| `--background` | `oklch(0.972 0.008 85)` | `oklch(0.16 0.008 60)` | 纸 / 墨底 |
| `--foreground` | `oklch(0.21 0.012 60)` | `oklch(0.95 0.006 85)` | 正文 |
| `--primary` | `oklch(0.55 0.19 32)` | `oklch(0.68 0.17 32)` | 朱红（强调、CTA） |
| `--muted-foreground` | `oklch(0.47 0.012 65)` | `oklch(0.72 0.01 75)` | 次要文字 |
| `--moss` | `oklch(0.45 0.09 155)` | `oklch(0.72 0.10 155)` | 正向变化 |
| `--border` | `oklch(0.88 0.012 80)` | `oklch(0.30 0.012 65)` | 发丝线 |
| `--radius` | `2px` | `2px` | 全局直角化 |

朱红不用于大面积背景——这是"票据上的印章"，用滥就失效。正向变化用墨绿，见下方颜色语义。

### 字体与数字

- **标题**：无衬线（Inter），`font-weight: 600`，`letter-spacing: -0.025em`。
- **正文 / 界面标签**：Inter。
- **数字一律等高等宽**：`font-variant-numeric: tabular-nums lining-nums`，
  指标值 32px / 600，`$` 与数字**同号**（只降低色彩饱和），不缩小——上一版缩小
  `$` 造成"大小不一"的观感。
- **衬线只用于长篇阅读正文**：博客、文档站、法务页的段落（`Source Serif 4`）。
  界面里不出现衬线，包括标题与数字。

### 版式规则

- 12 栏网格，区块之间用 `1px` 发丝线分隔，不用阴影
- 区块标题：小号全大写 eyebrow + 一条横线，左对齐
- Hero **左对齐**（现有是居中）——居中大标题是最典型的模板长相
- **只有指标卡用卡片容器**：纸色卡片、`1px` 描边、`2px` 圆角、无阴影；
  其余内容（趋势图、待办、漏斗、来源表）一律平面 + 发丝线。
  仪表盘指标采用**独立卡片**（每张一个容器，3 × 2 排布），而不是一整块发丝线网格：
  卡片让每个数字自成一体，扫视时不会串行；其余区块仍保持平面，两种质感对比明确
- 表格：行间发丝线、数字列右对齐等宽
- 动效：只保留 120ms 的透明度/描边过渡，不做位移与缩放

### 颜色语义（强约束）

| 语义 | 颜色 |
|---|---|
| 正向变化（增长、上涨） | **墨绿** `--moss`，配合 `▲` |
| 负向变化（下降、失败、需要处理） | 朱红 `--vermilion`，配合 `▼` |
| 主行动（CTA、主按钮） | 朱红底 + 白字 |
| 强调文字、链接 | 朱红 |
| 中性数据、正文 | 墨色 `--ink` |

朱红不用于装饰；它出现的地方只有三种：主行动、负向信号、漏斗进度条。

### 主题预设

后台 `appearance_enabled` 一旦打开，`[data-theme]` 会覆盖 `:root` 的颜色令牌。
现有 7 套预设（classic / forest / ocean / violet / sunset / rose / slate）是上游产物，
**全部替换**为 Jerbix 预设，并把默认值改为 `paper`：

| id | 性格 |
|---|---|
| `paper` | 默认，暖纸底 + 墨字 + 朱红 |
| `ink` | 冷墨底、纸白字，同样朱红强调 |
| `moss` | 纸底 + 苔绿强调（偏编辑/内容站） |
| `mono` | 纯灰阶 + 黑强调（极简） |

四套预设共用同一套直角、发丝线与字体规则——只换色相与强调色，不换结构。
`FONTS` / `FONT_SIZES` / 侧栏变体保持现有选项，仅更新 `common.themes.*` 等 i18n 标签。
Ledger 的"衬线正文"由 `--font-body`（Source Serif 4）承载，用于营销正文与文档正文；
界面骨架仍走 `--font-sans`（Inter），主题切换不影响这两者的分工。

### 应用范围（全站重设计）

| 区域 | 改动 |
|---|---|
| 营销页 | 全部区块重写：Hero、Rails、Inside、Steps、Pricing、FAQ、CTA |
| 页头 / 页脚 | 直角、发丝线、朱红 CTA；导航改为 `Rails / Inside / Pricing / Docs` |
| 后台 | 侧栏墨底纸字 + 朱红选中态；表格等宽数字；设置页分组标题改 eyebrow 样式 |
| 文档站 | 同字体与色板；侧栏发丝线；代码块直角 |
| 认证页 | 同色板；去掉居中卡片阴影，改描边 |

---

## 8. 与上游的差异度（核心目标）

品牌、文案、视觉都只是表面。真正的风险在代码本身——实测当前仓库与
`shipany-tanstack-main@3305a34`（本仓的 vendored 基线）的差异：

| 指标 | 数值 |
|---|---|
| 双方共有的 `.ts/.tsx` 文件 | 341 |
| 其中**逐字相同** | 303（非 `components/ui/` 部分 274） |
| 相似度 >90% | 30 |
| 逐字相同的代码行 | 约 38,000 行 |
| 这些文件里注释的占比 | 5% |

结论：**只改注释和文案不可能让相似度降下来**——注释只占 5%，代码本身就是同一份。
必须动代码的写法和结构。

### 目标（可测）

以 `src/` 对上游同一路径逐文件比较（difflib 相似度）：

| 指标 | 现状 | 目标 |
|---|---|---|
| 逐字相同文件（非 `components/ui/`） | 274 | **0** |
| 相似度 >0.95 的文件 | 294 | **≤ 30** |
| 全部非 UI 文件的中位相似度 | 1.00 | **≤ 0.90** |

目标刻意保守：不换标识符的前提下，单文件层面不可能降到 0.5 以下——能做到的是
**没有文件是逐字复制**，且高相似文件大幅收敛。真正决定"认不认得出"的是架构、
文案、视觉与注释，而不是逐行文本比对。

`src/components/ui/*`（shadcn 原件）、`src/lib/utils.ts`、`src/paraglide/*`（生成物）
不纳入统计：它们是第三方库代码，任何 shadcn 项目都一样，不构成上游指纹。

### 手段

**不做逐文件随机改名。** 买家买到的是要读、要改的代码；把 `payload` 改叫
`requestBody` 只会让 diff 遍布全仓、让升级变难，收益不成比例。差异化靠下面几层，
每一层都是"真的更好"而不是"为了不同而不同"：

1. **重写代码写法（等价改写）**：把上游那种写法换成本仓的写法。

   **优先级：安全 > 性能 > 可读性。**
   - 安全：不改任何校验顺序、错误分支、权限判断、事务边界；改写后必须能对着原代码
     逐分支说明"行为相同"。拿不准就不改。
   - 性能：不做"看起来更函数式"但多一次遍历/多一次分配的改写。`for` 循环里有提前
     退出、有副作用、或处理大数组时，保留循环，不改 `map`/`filter` 链。
   - 可读性：在前两条都成立时，选更好读的写法——提前返回代替嵌套 `if`、
     具名布尔量代替内联条件、把长函数拆成具名小函数、内联只用一次的辅助函数。

   典型可改：`if/else` 链改 `switch`、重复的守卫合并、返回三元改提前返回。
   典型不改：把同步循环改异步、把单次遍历拆成多次、把短路求值改成显式分支。
2. **重写注释（重点）**：每个保留文件的注释都用 Jerbix 的口吻重写，讲清楚
   "这个模块负责什么、边界在哪、为什么这样写"，删掉描述"这套模板从哪来"的段落
   与指向上游文档的链接。
3. **调整文件边界**（文件边界 = 哪一段代码住在哪个文件；只动"代码放哪"，不动
   "代码做什么"）：
   - `src/blocks/*-section.tsx` → `src/blocks/*.tsx`
     （`hero-section.tsx` → `hero.tsx`、`faq-section.tsx` → `faq.tsx`…）。
     目录名 `blocks` 保留。落地页按新叙事需要时，可以在 `blocks/` 内增删或合并区块
     文件（见 §6）。
   - `src/modules/config/settings-test-specs.ts` 并入 `settings-test.ts`
     （两文件合起来才构成一次"配置连通性测试"，分开是上游的拆分方式）
   - **不动**：`src/server/admin/handlers/`（保留现有组织方式）、
     `src/modules/posts`（保留）、目录层级与命名风格
4. **重写重配环境与配置**（`env` 层面）：
   - `.env.example` 整体重写：分组、注释口吻、注释里的示例域名与邮箱换成 Jerbix 的
   - `src/lib/env.ts` 的加载顺序与解析写法按本仓习惯重写（保持相同的优先级语义）
   - `src/config/index.ts` / `src/config/analytics.ts` / `src/config/user-features.ts`
     等配置模块重排组织方式（相同取值、相同导出名，不同的结构）
   - `wrangler.example.jsonc`、`Dockerfile`、`.dockerignore` 同步按 Jerbix 重写
5. **Prettier → Biome**（用户指定）：见下条。
6. **重写文案与 i18n 分组**：`landing.*` 等上游命名改为 Jerbix 自己的分组，
   并重写全部值。`landing.*` 的拆分规则（避免实施者各自发挥）：

   | 新分组 | 装什么 | 原键 |
   |---|---|---|
   | `site.*` | 站点通用骨架：导航、页脚、元信息、通用按钮 | `landing.nav.*`、`landing.footer.*`、`landing.meta.*`、`landing.cta.*` |
   | `product.*` | 落地页各区块的正文 | `landing.hero.*`、`landing.features.*`、`landing.pricing.*`、`landing.faq.*`、`landing.blog.*` |

   其余分组（`auth.*`、`pricing.*`、`settings.*`、`admin.*`、`blog.*`、`docs.*`、
   `common.*`）**保留分组名**——它们是通用英文词，不是上游指纹；只重写值。
   改分组名时同步改全部调用点（`rg "landing\." src/` 到零）。

### 代码风格：Prettier → Biome

移除 `prettier`、`@ianvs/prettier-plugin-sort-imports`、
`prettier-plugin-tailwindcss`、`.prettierrc.json` 与 lint-staged 里的
`prettier --write`，换成 `@biomejs/biome`（格式化 + lint 一体）：

- `biome.json` 必须**逐项对齐 `.prettierrc.json` 的现有取值**，否则迁移本身就是
  一次全仓重排，把真正的改动埋进噪音里：
  `lineWidth: 80`（不是 90）、`indentStyle: space`、`indentWidth: 2`、
  `quoteStyle: single`、`jsxQuoteStyle: double`、`semicolons: always`、
  `trailingCommas: es5`（**不是 `all``——`all` 会给每个函数参数补尾逗号，
  等于改动全仓每一处签名）、`arrowParentheses: always`、`bracketSpacing: true`、
  `lineEnding: lf`；Tailwind class 排序交给 `useSortedClasses`
- import 排序：Prettier 侧靠插件分组，Biome 侧用
  `assist.actions.source.organizeImports` + `groups` 复现同一顺序，取值照抄
  `.prettierrc.json` 的 `importOrder`：
  react → @tanstack → 三方 → 空行 → `@/core` → `@/config` → `@/modules` →
  `@/lib` → `@/paraglide` → `@/hooks` → `@/blocks` → `@/components` →
  `@/content` → 空行 → 相对路径
- `.prettierignore` → `biome.json` 的 `files.includes`（取反语法），内容照搬：
  忽略 `node_modules`、`.output`、`data`、`drizzle`、`src/routeTree.gen.ts`、
  `src/paraglide`、`public`、`*.d.ts`、`src/components/ui`、`.claude`/`.agents`/`.codex`/`.cursor`
- `format` / `format:check` / lint 脚本与 lint-staged 全部改指向 `biome`
- `AGENTS.md` 里的 `pnpm format — Prettier` 改为 Biome
- 全仓 `biome check --write` 重排一次

Biome 的换行策略、对象展开与 JSX 折行都与 Prettier 不同，这是一层**零行为风险**的
全局差异；它也比 Prettier 快一个数量级，对买家是实打实的升级。

### 边界

- **不改数据库表名与列名**：`user`、`order`、`manual_payment_detail` 等是功能语义，
  改名会把三套 schema 与迁移一起拖入风险区，收益也低。
- **不改第三方库代码**：`components/ui/*`、`lib/utils.ts` 保持 shadcn 原件。
- **不改行为**：每一步以现有测试为回归网（基线约 167 个用例，最终数字以首次
  `pnpm test` 运行为准）；任何一次提交后 `pnpm test`
  必须全绿。
- **不改公开 API 形状**：路由路径可以改（`/guest-post` 反正要删），但已存在路由
  的请求/响应结构不变，避免前端与测试同时失效。

### 验证方式

在 `/tmp` 保留一份**干净的上游检出**，固定到某个 commit，用一次性脚本逐文件计算
相似度并输出报告：

```
shared / identical / >0.85 / max / median   →   与上表目标逐项比对
```

**必须先把三件事钉死，否则这个指标会自己骗自己**：

1. **快照要干净且固定**。用 `git clone` + `git checkout <commit>` 到 `/tmp` 的独立
   目录，跑之前断言 `git status --porcelain` 为空。不要在别处的开发副本上量
   （本机另有一份带未提交改动的上游副本，量出来的数字与本表不一致——
   343 共有 / 295 逐字相同 / 中位 1.00，而不是 341 / 303）。实施开始时把实际
   commit 哈希记进账本，之后所有度量都以它为准。
2. **按内容匹配，不按路径匹配**。本次要改文件名（`blocks/*-section.tsx` →
   `*.tsx`、`modules/indexnow` → `indexing`），按路径比会让这些文件直接掉出统计集，
   "逐字相同 = 0"就变成构造出来的假象。正确做法：先按内容哈希做一遍全局匹配，
   剩下的再按路径配对，两边取并集作为分母。
3. **分母要写进报告**。每次输出 `shared` 的绝对数，target 里"逐字相同 ≤ 0"必须在
   分母不变或变大的前提下成立。

该脚本**不进仓库**（它会提到上游名称），只作为实施期间的度量工具，结果记录在
实施计划的账本里。

**关于工作量，先讲清代价**：达标意味着要实质重写约 265 个非 UI 文件，而唯一的
回归网是 `pnpm test`。这是本次工程的主体工作量，不是顺手能做完的收尾。如果中途
发现某类文件（例如纯类型定义、常量表）改写后行为风险大于收益，允许成组跳过，
但必须在账本里逐组记录理由与条数，且报告里的中位数与 >0.95 计数仍要达标。

### 交付前清理 `docs/superpowers/`

本设计文档与 2026-11-20 的重构文档都是过程记录，必然提到上游名称；发布前整个目录
从仓库移除（Git 历史里仍可追溯）。

### 文案与占位词

- 全部用户可见文案（`messages/en.json`）逐区重写并重新分组：`landing.*` 拆成
  `site.*` / `product.*`，`pricing.*`、`faq.*`、`auth.*`、`blog.*`、`settings.*`、
  `admin.*`、`docs.*` 保留分组名但重写全部值；改分组名时同步改全部调用点
- 占位词替换：`My App` → `Jerbix`
- `jerbix.com` 只出现在营销文案与文档里；`.env.example` 的 `VITE_APP_URL` 仍是
  `http://localhost:3000`——改成未持有的域名会打断本地认证回调与结账跳转
- 法务示例页（`terms-of-service`、`privacy-policy`）改写成模板交付用示例条款，
  页面顶部标注「示例文本，发布前请替换」，口径与新 `LICENSE` 一致

### 技能（`.claude/skills/`）：先收敛，再蒸馏

9 个技能目前与上游高度雷同，实测相似度 **0.82 – 1.00**，其中 `security-scan`
**逐字节完全相同**。这既是指纹，也是维护负担：`SKILL.md` 会被 agent 整份读进上下文，
现在合计 **2236 行**，而其中大量篇幅是"怎么检测浏览器工具"（`clone-website` 592 行）、
"wrangler 各种报错怎么办"（`deploy-cloudflare` 493 行）这类一次性排错清单。

两步走。**第一步收敛数量**：9 → 8，只做两处确实重叠的合并。

| 动作 | 理由 |
|---|---|
| `new-page` **吸收** `new-static-page` | 后者真正有判断量的内容不到 20 行（放一个 `<slug>.en.mdx` + 一个用 `staticPageRouteOptions` 的薄路由）。"给模板加页面"是买家最高频的动作，分散在两个技能里反而容易选错。合并后开头一句分岔：数据页（`useQuery` + API + 导航项）还是静态 MDX 页 |
| `quick-start` **改名** `new-app` | `quick-start` 既是上游的名字，又读起来像"快速入门指南"而不是一个动作。改名后与 `new-page` / `new-module` 构成同一族动词 |

**不做**的两个合并（都试过，不划算）：

- 不合 `generate-image` 进 `design-theme`：技能按描述匹配触发，合成"改颜色/字体/主题 +
  生成配图"会让"生成一张 hero 图"这句话匹配度下降，省一个文件不值。
- 不合 `clone-website` 进 `new-app`：它是 592 行、最重的一份，合并只会让
  `new-app` 重新胀回全仓最大技能，与蒸馏的目的相反。

**第二步蒸馏**：删掉不影响判断的内容，只留"不这么写就会做错"的部分。

| 技能 | 现在 | 目标 | 蒸馏掉什么 |
|---|---|---|---|
| `deploy-cloudflare` | 493 | ≤ 260 | 按报错原文列的大段排错表，改成"先跑 `pnpm check:deploy-env`，失败看这条"的三条主线 |
| `clone-website` | 592 | ≤ 200 | 浏览器工具检测的四种分支（保留一句"用 Playwright，没有就问用户"）；提取阶段的逐项 SQL/选择器示例压成一张表 |
| `new-app`（原 `quick-start`） | 366 | ≤ 180 | 与 `new-page` 重复的建页步骤，改为指向它 |
| `new-page`（含并入的静态页） | 149 + 108 | ≤ 140 | 与 AGENTS.md「Adding a New Feature」重复的七步清单改为指针；MDX 组件逐个介绍删掉（`mdx-components.tsx` 自己会说话） |
| `new-module` | 218 | ≤ 110 | guest-posts 作为支付钩子示例的那一大段（功能已删，改用 manual-payments）；三套 schema 的重复说明合并 |
| `design-theme` | 138 | ≤ 90 | 上游 7 套预设的说明；整篇按 Ledger 重写（四套预设 `paper` / `ink` / `moss` / `mono`） |
| `generate-image` | 103 | ≤ 70 | 提示词模板堆叠，压成三段 |
| `security-scan` | 69 | ≤ 70，**全部重写** | 逐字节相同，必须重写；并补本仓特有的三条检查：配置白名单越界、凭证落盘加密、`atomic()` 误用 |

合计 2236 → **≤ 1150 行**（约 50%）。目标不是"越短越好"，超过 1150 就说明又滑回清单体。

**每个技能必须改的技术事实**（蒸馏时顺手改掉，否则文档骗人）：

- 区块命名 `src/blocks/*-section.tsx` → `src/blocks/*.tsx`
- i18n 分组 `landing.*` → `site.*` / `product.*`
- `pnpm format` 是 Biome 不是 Prettier
- `new-module` 的支付钩子示例从 guest-posts 换成 manual-payments
- `deploy-cloudflare` 补 `REPORT_TIMEZONE`、`CONFIG_ENCRYPTION_KEY` 与
  `pnpm check:deploy-env` 的强制项

**改名与合并会打断既有交叉引用，必须一起改**（已核对过全仓，需改 3 处）：

| 位置 | 现在 | 改成 |
|---|---|---|
| `.claude/skills/design-theme/SKILL.md` | "as part of the quick-start flow" | "as part of the `/new-app` flow" |
| `.claude/skills/generate-image/SKILL.md` | "A static page (`/new-static-page`) wants…" | "A static page (`/new-page`, the MDX path) wants…" |
| `README.md` / `AGENTS.md` 的技能表 | 9 行 | 8 行，行数与描述同步 |

（`new-module/SKILL.md` 里引的是 `/new-page`，名字未改，无需动。）

`.agents/skills`、`.codex/skills`、`.cursor/skills` 是指向 `.claude/skills` 的软链：
删 `new-static-page` 目录后要确认这三处链接不残留死链，改完四个入口仍解析到同一份文件。

**验收**：`ls .claude/skills` 得到 8 个目录；每个 `SKILL.md` 与上游同名技能相似度
**≤ 0.70**，`security-scan` 不再逐字节相同；总行数 ≤ 1150；
`grep -rn "quick-start\|new-static-page\|landing\.\|-section\.tsx\|prettier"`
在 `.claude/skills/`、`README.md`、`AGENTS.md` 下零命中。

### 相关文档与技能同步

`AGENTS.md`、`README.md` 里关于 guest posts 的段落必须一起改写。另外几处文档必须
同步，否则文档与代码立刻互相矛盾：

- `AGENTS.md` 的 Blocks 章节现在规定区块文件叫 `<name>-section.tsx`、导出
  `<Name>Section`；改成 `src/blocks/<name>.tsx` 后这段要一起改。
- `AGENTS.md` 的 `pnpm format` 说明由 Prettier 改为 Biome（见上）。
- `AGENTS.md` 的后台章节要删掉 `/admin/operations` 与实验日志，补上全局周期选择器、
  `/admin/analytics` 的新分工，以及 `REPORT_TIMEZONE`。
- `AGENTS.md` 的「Agent Skills」表格要按蒸馏后的技能重写描述与定位。
- `AGENTS.md` 的 Database Schema 章节要补 `analytics_visitor` 新增的 6 列。

## 9. 后台与导航

### 后台仪表盘重做：先梳理，再重做

#### 现状：三块面板互相重叠

| 面板 | 提供什么 | 问题 |
|---|---|---|
| `/admin` 概览 | 4 张卡（总用户 / 30 天收入 / 活跃订阅 / 未结工单）+ 转化漏斗 | 没有时间维度；工单与漏斗在别处重复 |
| `/admin/operations` | 今日 vs 昨日（同小时）、按来源/国家/构建/入口的访客漏斗、7 天日序列、实验日志、CSV 导出、每分钟刷新 | 面向上游自家产品；"实验日志"与买家无关；**与概览的漏斗口径不同**，两个漏斗会给出互相矛盾的数字 |
| `/api/admin/analytics/*` | overview / funnel / report 三个只读接口 | 形状可复用，但 overview 没有序列数据 |

**核心问题不是卡片少了，而是有两套漏斗。** 买家看到"注册→结账→付费"在两个页面
数字不一致，第一反应是系统有 bug。

#### 决定：三层分工

| 层 | 位置 | 装什么 |
|---|---|---|
| 概览 | `/admin` | 6 张指标卡、趋势图、待办队列、紧凑漏斗、**Top 5 来源** |
| 精细化分析 | `/admin/analytics`（新，取代 `/admin/operations`） | 完整来源/UTM 报表、五段访客漏斗、日序列明细、CSV 导出 |
| 明细 | `/admin/payments`、`/admin/users` | 订单、账户的完整列表（已存在，不改） |

**为什么拆两层**：概览要一眼看完，不能塞 7 个筛选下拉；但买家又确实需要
"哪个渠道真的带来付费"这种细查能力。所以概览只给 Top 5 与一个入口，
细查放到 `/admin/analytics`。

原 `/admin/operations` 的归属：

| operations 的独有能力 | 去处 |
|---|---|
| 访客五段漏斗（Visitors → Sign-ups → Plan selected → Checkouts → Paying） | `/admin/analytics` 保留，作为该页主区块 |
| 按来源 / 国家 / 入口 / 构建的 cohort 表 | `/admin/analytics` 拆成"访客来源表"与"注册与成交表"两张（见下方渠道口径）；`build` 维度**去掉**——它是给上游自己对比版本用的，买家没有这个概念 |
| 7 天日序列 | 概览的趋势图（补访客线）+ 分析页的明细表 |
| 今日 vs 昨日（同小时） | 概览指标卡的"较前一等长窗口"副行 |
| CSV 导出 | `/admin/analytics` 保留 |
| ** Experiment journal（实验日志）** | **删除**（上游为自家产品做的实验记录） |
| 每分钟自动刷新 | 删除，改为手动 Refresh |

#### 全局周期选择器（统一时间窗口）

现状最乱的地方不是卡片数量，而是**四个窗口同时存在**：指标卡 30 天、趋势图 14 天、
访问量 7 天、漏斗自带 24h / 7d / 30d 三档切换。同一屏上三个数字都叫"本月"，买家
没法比较，只能怀疑数据坏了。

决定：**一个页面只有一个时间窗口。**

| 项 | 规则 |
|---|---|
| 选项 | `7 days` / `30 days` / `90 days` |
| 默认 | `30 days` |
| 位置 | 页头右侧，与 Refresh / Export 同一行；`/admin` 与 `/admin/analytics` 共用同一个控件 |
| 作用范围 | 全部跟随：6 张卡、趋势图、待办以外的所有数据块、漏斗、Top sources、维度表、日序列 |
| 比较窗口 | 自动取**紧邻的前一个等长窗口**；卡片副行写 `vs previous 30 days`，随选择变化 |
| 持久化 | 写进 URL 查询参数（`?period=30d`）；刷新、分享链接、浏览器后退都保持选择 |
| 口径标注 | 区块右上角只写 `last 30 days` 这类由选择器派生的说明，**不再有写死的窗口文字** |
| 固定窗口项 | 待办队列里的"订单挂起超过 1 小时"与"24 小时内失败的 AI 任务"是滚动窗口，与周期无关：保留原值并在标签里写明单位（`over 1h`、`last 24h`） |

**为什么用下拉式的分段控件而不是日期选择器**：买家要回答的问题只有"这周 / 这个月 /
这一季怎么样"，自由选起止日期增加配置面，也让"vs previous period"失去明确含义。

**接口形状**：`GET /api/admin/analytics/{overview,funnel,report}` 三个接口统一接受
查询参数 `period`，取值 `7d` | `30d` | `90d`，缺省 `30d`。**非法值返回 400**：
参数校验用 zod enum，且 `admin-operations.ts` 本来就是 `.strict()`——为了"看板不该
报错"而在这一层放水，会让 agent 调用方以为参数生效了（实际用了别的窗口），比报错更糟。
响应里每一块都带 `period` 回显与 `previousPeriod` 汇总，前端不自己算日期区间。

#### 报表时区（部署级配置）

现有代码把"今天"与每个日桶硬编码在 **UTC+08**（`sameTimeWindows` 的 `offset = 480`、
`dayBucket` 里 `+ 8 hours`）。新的"较前一等长窗口"与 90 天按周聚合都落在这个边界上，
所以必须先把它显式化：

- 新增 env **`REPORT_TIMEZONE`，值为 IANA 时区名，默认 `Asia/Shanghai`**。
  不用分钟偏移量：`America/New_York` 这类有夏令时的地区，写死 `-300` 会让每年一半的
  时间日界线差一小时，日收入、日序列、"较前一窗口"全部跟着错位。
- 校验方式：用 `new Intl.DateTimeFormat('en-US', { timeZone })` 试构造，抛错就回落
  `Asia/Shanghai`，并打一条警告。不为它加后台设置项——时区是部署者的地理事实，
  改一行环境变量比多一个设置页省事，也避开"改了要不要重算历史分桶"的问题。
- 代码里**只允许一处**读取它：`src/modules/analytics/timezone.ts` 导出
  `REPORT_TIMEZONE`、`dayKey(date)`、`dayBucketSql(column)` 等几个小函数。所有窗口
  切分、日桶、周桶、CSV 日期都走这里，删除散落的 `+ 8` 与 `offset = 480` 字面量。
- 实现方式：用 `Intl.DateTimeFormat(..., { timeZone, ... }).formatToParts()` 取该时刻
  在目标时区里的年月日，再据此算边界。**不要**用固定偏移量做算术。
- 夏令时是有意保留的：一年里会有一天是 23 小时、一天是 25 小时。这是正确行为，
  写进注释，不要"修正"掉。
- README 注明：海外部署改成自己的时区名，否则日收入会在本地时间早上 8 点切分。

**日期不许在客户端二次格式化。** 服务端返回日桶时直接给 `day: '2026-11-21'` 这样的
字符串与已算好的标签，前端原样渲染；禁止在组件里对它调 `toLocaleDateString()`——
SSR 跑在服务端时区、浏览器跑在用户时区，两者不一致会直接触发水合失败（本仓踩过
这个坑）。CSV 也从同一处取，不另写一份日期格式化。

趋势图的粒度随窗口自适应：7 天与 30 天按日，90 天按周聚合（按日会让 90 根线糊成一片）；
周桶的起点由 `REPORT_TIMEZONE` 决定。所有接口接受 `period` 参数并在服务端做窗口与环比
计算，前端不各自算日期。

#### 指标定义（逐个过一遍）

我上一版提的 `Active accounts`（订阅或 30 天成交的账户）**撤回**：它是两个口径的
复合，既回答不了"多少订阅"，也回答不了"多少买家"，还会和另外两张卡重复。

最终 6 张卡，分两组，每张都只有一个口径。**卡片标题不带天数**——窗口由页头的
选择器统一决定；副行里的比较对象随选择器变化：

| 卡片 | 口径（精确） | 副行 | 数据来源 |
|---|---|---|---|
| **Net revenue** | 窗口内已付金额 − 退款，按币种分组；主显示币种单列一个值，其余币种进 `+2` 气泡，不做汇率换算 | 较前一等长窗口 ±%、订单数 | `order` |
| **Paying customers** | 窗口内有成交的**去重用户数**（续费也算"仍在付费"） | 新客 x · 老客 y | `order` + `user` |
| **Active subscriptions** | `active` + `trialing` + **`pending_cancel`**（按代码现有的存活集合；存量指标，不随窗口变化） | 其中试用 x · 计划取消 y | `subscription` |
| **Accounts** | 当前用户总数（`type='user'`；存量指标） | 窗口内新增 x | `user` |
| **Growth** | 窗口内新用户 ÷ 前一等长窗口新用户 − 1 | 两个绝对数并列（148 vs 132） | `user.createdAt` |
| **New visitors** | 窗口内**首次出现的去重浏览器数**（`excluded=false`，含匿名；同一浏览器只记首次那一行） | 其中注册 x · 注册转化率 | `analytics_visitor` + `user` |

其中 `Active subscriptions` 与 `Accounts` 是**存量**（某个时点的状态），不随窗口重算；
它们的副行给出窗口内的变化量，这样就同时回答了"现在多少"和"这段时间涨了多少"。

**`New visitors` 不是「访问量」，别把它当 PV。** `recordVisitor` 一个浏览器只插一行，
之后不再更新，所以窗口内统计的是"这段时间第一次来的人"，回访客不会重复计入，也没有
逐次访问的流水。要真正的访问次数得另建一张按次记录的表，本次不做。卡片名与趋势线
标签都用 **New visitors**，副行写 `first seen in this period`，避免买家误读成流量。

**`即将到期` 这一类阈值文案一律不许出现"即将"却没有数字**：要么给出明确阈值
（`renews in 7 days`），要么删掉副行。实施时按这个规则定，不要留模糊措辞。

为什么是这 6 个：前三张是"钱"，后三张是"人"。上游只有"总量 + 收入 + 订阅 + 工单"，
既没有增长信号，也没有访客与转化，这 6 张卡是买家真正每天会看的。

#### 其余四块

**趋势图（跟随周期）**：三条线——访客 / 注册 / 成交。单色系三个明度（墨色 / 朱红 /
虚线灰），**图例在绘图区外右侧独立一列**（压在折线上会看不清），图例旁直接写区间
总数，空数据时显示引导态而不是空坐标轴。

**待处理队列**（替代我上一版的"最近订单"）：`/admin/payments` 已经有完整订单表，
仪表盘再列一遍只是重复。这里改成**需要人动手的事**：

- 手工核销待审核（`manual_payments_enabled` 打开时）
- 超过 1 小时仍 `created`/`pending` 的订单
- 未结工单（`tickets_enabled` 打开时）
- 24 小时内失败的 AI 任务（`ai` 模块存在时）

每行点击直达对应页面；全空时显示"没有待处理事项"。

**漏斗**：沿用现有注册队列漏斗（utm / referrer / country 维度），压缩成三行进度条
放在队列右侧，**不加筛选下拉、也不自带窗口切换**——它跟随全局周期。条形的长度是
相对第一段的**真实比例**，不做视觉放大；所以低转化段会显得很短，那是事实。

**Top 5 来源**（概览最底一行，整行表）：

| 列 | 说明 |
|---|---|
| Channel | 首触渠道：`utm_source`，取不到退回 referrer 的 hostname，再退回 `direct` |
| Visitors | 该渠道首次出现的去重浏览器数 |
| Sign-ups | 其中注册数 |
| Paid | 其中成交数 |
| Sign-up → paid | 注册到付费转化率 |
| Revenue | 该渠道的净收入 |

按付费数降序，只显示前 5 行，右上角「View full report →」进 `/admin/analytics`。
概览不做筛选、不做分组切换。

#### 降级规则

仪表盘不能因为某个模块没开就报错，但**"0"和"没有这个功能"是两件事**，不能混：

| 情况 | 行为 |
|---|---|
| 窗口内确实没有访客（0 行） | 访客卡显示 `0`，趋势图访客线画成零线，分析页表格显示空态引导语。**0 是真实答案，不隐藏** |
| 站点刚部署、还没有任何注册 | 六张卡照常显示（多为 0），趋势图显示引导态而不是空坐标轴 |
| 手工核销未启用 | 队列中不出现待审核项；接口该字段返回 `null` 而不是 `0` |
| 工单模块关闭 | 队列不出现工单项，相关卡片不显示 |
| AI 模块关闭 | 队列不出现 AI 项 |

**没有"分析统计开关"这种东西**：本仓的采集只受 `cookie_consent_enabled` 与用户
拒绝对待数影响，不存在一个"关掉分析"的配置项。所以降级表里不要写"分析统计关闭"——
那个状态不存在。如果买家想让访客数为 0，把 consent 设为 required 即可。

概览页只发**一次**请求：`GET /api/admin/analytics/overview`（沿用现有路由名，
不新增 `dashboard` 路由），响应扩展为一次返回卡片、趋势序列、待办队列、紧凑漏斗与
Top 5 来源。每个可选块可以是 `null`；前端按 `null` 隐藏，不按 `0` 渲染。

#### 分析页 `/admin/analytics`

同一套全局周期选择器（页头右侧，与概览页一致），页面内只增加**维度**选择：

| 区块 | 内容 |
|---|---|
| 访客五段漏斗 | Visitors → Sign-ups → Plan selected → Checkouts → Paying，逐段编号 01–05，带各段相对上一段的转化率；条形按真实比例 |
| 来源与成交表 | 一张表通吃：`Group by` 维度 8 个，列 7 个（见下） |
| 日序列明细 | 日期 ×（访客、注册、订单、付费用户、净收入）；默认显示最近 5 行，可展开全部；无数据的日子写 `—` 而不是 `0` |
| 导出 | CSV，导出当前周期与当前分组（沿用现有实现） |

**来源与成交表**

| 项 | 内容 |
|---|---|
| 维度（`Group by`） | `utm_source` / `utm_medium` / `utm_campaign` / `utm_term` / `utm_content` / `Referrer` / `Country` / `Landing page` |
| 列 | Visitors、Sign-ups、Checkouts、Paying、Visit → sign-up、Sign-up → paid、Net revenue |
| 默认 | `utm_source`，按 Net revenue 降序 |
| 筛选 | 只列当前周期该维度的前 8 个值 + 一个可搜索输入；不再把前 50 个值全塞进下拉框 |
| 空值 | 访客侧记 `(none)`、注册侧记 `(none)`，合并为同一行 |

**这张表要靠一次 schema 扩展才成立**（用户已确认）：`analytics_visitor` 目前只有
`source` / `country` / `entry_path` / `build_id`，五个 UTM 一个都没有。扩展方式：

- 给 `analytics_visitor` 加 6 列：`referrer`、`utm_medium`、`utm_campaign`、
  `utm_term`、`utm_content`（`utm_source` 已由 `source` 承载，见下），全部
  `text notNull default('')`，与 `user` 表同名列保持一致的净化规则。
- 写入侧只改 `src/routes/api/operations/visit.ts`：五个 `utm_*` cookie **已经由
  `src/server.ts` 的边缘中间件种好了**（`ATTRIBUTION_COOKIE_ATTRS`，30 天），
  现在只是没去读；加几行 `getCookieFromHeader` 即可，不新增写入路径、不新增接口。
- `source` 列保留，语义钉死为**归一化渠道键**：
  `source = sanitizeUtm(utm_source) || hostname(referrer) || ''`，写入时算好并反范式存下，
  供概览 Top channels 与漏斗维度直接用，不必每次聚合都算一遍。
- 三套 schema 模板同步加列（sqlite / postgres / mysql），`pnpm db:setup && pnpm db:push`。

**为什么值得扩**：不扩的话 Analyze 页只能拆成"访客侧"与"注册侧"两张表——因为
"按 campaign 分组、同时有访问量"在旧模型里根本算不出来。扩了之后一张表就能回答
买家最常问的问题："这次投放带来了多少访问，其中多少人注册、多少人付钱。"代价是
6 个 `text default('')` 列和一处 cookie 读取，新模板没有历史数据要迁移。

**两列的来源不同，要写清**：Visitors 来自 `analytics_visitor`（浏览器首触），
Sign-ups / Checkouts / Paying / Revenue 来自 `user` 与 `order`（账户首触）。
两边都用各自的首触 UTM，值域相同但**独立计数**，所以 "Visit → sign-up" 是两个来源的
比值（GA 类渠道报表本来就是这样），不是同一批人的逐步留存。表脚注要写明这一点。

- `Landing page` 维度只有访客侧有（`entry_path`）；选中它时，成交相关列显示 `—`，
  不显示 0。
- 没有任何归因的账户（手输网址、书签）仍计入总计，但在分组表里落到 `(none)` 行。

#### 渠道口径：五个 UTM 参数到底是什么

| 参数 | 标准含义 | 本系统怎么用 |
|---|---|---|
| `utm_source` | **谁带来了这次访问**——站点或渠道名（`google`、`newsletter`、`x`） | **访客级与注册级都用**。访客侧存进 `analytics_visitor.source`（归一化渠道键），注册侧存进 `user.utm_source` |
| `utm_medium` | **以什么方式带来**——媒介类型（`cpc`、`email`、`social`、`organic`） | 访客级（本次扩展新增）+ 注册级 |
| `utm_campaign` | **哪一次活动**（`spring_launch`、`black_friday`） | 访客级（本次扩展新增）+ 注册级 |
| `utm_term` | **哪个付费关键词**（`saas+template`） | 访客级（本次扩展新增）+ 注册级 |
| `utm_content` | **哪个变体/素材/链接**（`hero_cta`、`sidebar_link`），用于区分同一活动下的不同入口 | 访客级（本次扩展新增）+ 注册级 |

采集规则：

- 五个值都由 `src/server.ts` 的中件从请求 URL 的查询串读取，写成 30 天有效的
  cookie（首触，后续访问不覆盖），再分别由**注册流程**写进 `user` 行、由**访问接口**
  写进 `analytics_visitor` 行。两处都走 `sanitizeUtm`：只留字母、数字、空格与 `._-`，
  截断 100 字符。
- `referrer` 走 `sanitizeReferrer`：归一化为 `origin + pathname`，丢弃查询串
  （可能带 token 或 PII），站内来源与自有域名一律记空。
- `country` 取自边缘 geo 头（`cf-ipcountry` / `x-vercel-ip-country` /
  `cloudfront-viewer-country`），`XX` 与 `T1` 视为未知。
- `utm_*` 为空是常态——直接访问、站内跳转、手输网址都没有。统一记 `(none)`。

**渠道口径（全站唯一）**：
`channel = sanitizeUtm(utm_source) || hostname(referrer) || 'direct'`，
小写化并去掉前导 `www.`。这条规则在访客侧写入时落到 `source` 列，在注册侧查询时
现算，两边同名同义才能并排比较。**要写进代码注释，且只有一个实现**（放
`src/modules/analytics/` 里导出，路由与报表都调它），不允许第二份。

已知瑕疵，要接受并写进文档：`utm_source=google` 与 `referrer=google.com` 在
归一化后仍是两个值（`google` / `google.com`）。不做域名反查——那需要外部依赖。
文案上建议买家在投放时统一用 `utm_source`，referrer 只作兜底。

**展示位置总表**：

| 位置 | 展示哪些 | 形态 |
|---|---|---|
| `/admin` 概览 · Top 5 channels | 只到 `channel` 这一级 | 表格：Channel / Visitors / Sign-ups / Paid / Sign-up→paid / Revenue |
| `/admin/analytics` · 来源与成交表 | 全部 8 个维度，含五个 UTM | 一张表 + 分组下拉 + 筛选 |
| `/admin/users` 列表 | `utm_source` 一列 + 筛选 | 现有列保留，筛选器改为来源下拉 |
| `/admin/users/$id` 详情 | **五个 UTM 全量** + Referrer + Country | 现有字段区保留，改为 Ledger 样式 |

`utm_term` / `utm_content` 不上概览页：它们回答的是"哪个广告词/哪条链接"，属于细查，
塞进首屏只会稀释六张卡的信号。它们在分析页的分组下拉里可选，在用户详情里始终可查。

#### 权限与 Agent 接口

权限统一为 **`admin.analytics.read`**（现有 `/api/admin/analytics/*` 挂的是
`admin.payments.read`，`/api/admin/operations` 挂的是 `admin.operations.read`；
三个端点合并到同一页同一权限下）。`admin.operations.write` 随实验日志一起消失。

改名涉及 `scripts/init-rbac.ts` 的种子、`src/lib/admin-operations.ts` 的动作注册表、
`docs/admin-agent.md` 与 `tests/admin-agent.test.ts`。**已部署实例升级后须重跑
`pnpm rbac:init`**，否则旧 `role_permission` 里的 `admin.operations.read` /
`admin.payments.read` 不再匹配新接口，分析页会 403。这条要写进 `README.md` 的升级说明
（仓库目前没有 `CHANGELOG`，不要假设它存在）。

**Agent / MCP 界面允许重命名与合并**（用户已确认），因此实施时可以顺手整理，但必须
一次改干净，四处同步：

| 处 | 改什么 |
|---|---|
| `src/lib/admin-operations.ts` | 删 `operations_experiments_*` 三个操作；`operations_report` 并入 `analytics_report`；`analytics_overview` / `analytics_funnel` 增加可选 `period` 参数 |
| `docs/admin-agent.md` | 同步操作清单、参数与示例 |
| OpenAPI 输出 | 同步；`.strict()` 保留——非法 `period` 由 zod 的 enum 直接拒绝，不靠"静默降级" |
| `tests/admin-agent.test.ts` | 同步 16 个用例 |

`analytics_report` 的现有 `from/to`（≤92 天）契约保留，与 `period` 并存：
`period` 供看板用，`from/to` 供 agent 精确取区间用；两者同时出现时 `from/to` 优先。

#### 现有测试文件的处置

`tests/operations.test.ts` 不是整体删除，而是拆分。它现有 6 个测试，逐个处置：

| 测试 | 处置 |
|---|---|
| 今日 vs 昨日同小时（`comparison uses yesterday at the same local time`） | **重写**。它测的 `sameTimeWindows(offset = 480)` 正是被全局周期取代的机制；改成测"给定 `period` 时，前一等长窗口的起止正确"，并覆盖夏令时那一周 |
| 签名访客 ID 拒绝伪造 cookie | 保留（无改动） |
| 首触 cohort 与账户归属不可变 | 保留（无改动） |
| 真实支付指标、退款、去重 cohort | 保留；补一条 `REPORT_TIMEZONE` 的日界用例 |
| **`admin operations require dedicated permissions`（实验结论）** | **删除**（`operations_experiment` 随之消失） |
| 访客接口跨域/伪造拒绝、同意撤销停止采集 | 保留；补一条"新写入的 5 个 UTM 列确实落库"的断言 |

即：删 1 个、重写 1 个、保留 4 个（其中 2 个补用例），文件改名为
`tests/analytics.test.ts`。`sameTimeWindows` 若无人再调用就删掉，不要留死代码。
`tests/guest-posts.test.ts` 与 `tests/guest-post-notify.test.ts` 整体删除。

新增测试至少要覆盖三件事，因为它们是这次改动里最容易错、且错了没人发现的：
访客级 UTM 落库与净化、`period` 与"前一等长窗口"的边界（含夏令时）、
`admin.analytics.read` 权限生效而旧权限码失效。

### 自定义名称与菜单

不是随机改名，而是**用户能看懂**这个标准下允许调整的自定义命名：

- **IndexNow → 「Instant indexing」**（中文语境即"即时收录"）。它是给 Bing / Yandex
  这类支持 IndexNow 协议的搜索引擎推送 URL 的功能，名字本身是协议名，买家看不懂。
  改动范围：`admin.nav.indexnow`、`admin.indexnow.*` 的全部标签与说明文案；
  `src/modules/indexnow` → `src/modules/indexing`；`src/routes/admin/indexnow.tsx` →
  `src/routes/admin/indexing.tsx`；RBAC 权限码 `admin.indexnow.*` →
  `admin.indexing.*`；`scripts/init-rbac.ts` 同步。
  **协议名本身保留**：说明文案里仍会写"uses the IndexNow protocol"，因为那是技术事实。
  协议相关的不动项：`indexnow_key` 配置键、`https://api.indexnow.org/indexnow` 等
  端点、`/api/admin/indexnow` 之外可改的路径、`src/lib/indexnow*.ts` 客户端。
- **菜单布局保持"平铺 + 子项"**：不改现有导航结构（一级项 + 可折叠子项、按 `group`
  标签分组）。只做三件小事：
  - IndexNow 入口改名「Instant indexing」
  - 删掉「实验日志」入口（`/admin/operations` 整个路由移除，见本节上方）
  - 营销页头导航改为 `How it works / What's inside / Pricing / Docs`，与落地页叙事对齐

---

## 10. 约束

- 单一语言：`locales: ["en"]`，不引入第二语言。
- 金额只存在于 `src/config/pricing.ts`（示例值）与买家自己的 Stripe 目录。
- 后台可配置项继续走 `config` 表 + 白名单公开接口；本次不新增密钥类配置。
- 测试必须保持 `node:test`：删除 guest posts 的两个测试文件、按上表拆分
  `tests/operations.test.ts` 后，剩余与新增用例全绿（基线约 167 个）。
- 三套 schema（sqlite / postgres / mysql）必须同步修改。
- 后台仪表盘新增的指标只读现有表（`user` / `order` / `subscription` /
  `analytics_visitor` / `ticket` / `ai_task`），**不新建表**。
  唯一允许的 schema 改动是给 `analytics_visitor` **加列**（`referrer` +
  四个 `utm_*`），且不加新接口、不加第二条写入路径——只是让现有的
  `visit.ts` 多读几个已存在的 cookie。
- 全局只有**一套转化漏斗**：访客队列口径（Visitors → Sign-ups → Plan selected →
  Checkouts → Paying）。现有 `/api/admin/analytics/funnel` 的注册队列漏斗并入其中，
  不得留两套并行的漏斗各自算数。
- `REPORT_TIMEZONE` 是**唯一**的时区来源；代码里不得再出现 `480`、`+ 8 hours`
  之类的时区字面量。
- 后台全局只有**一个时间窗口**：概览与分析页共用页头的 `7 / 30 / 90 days` 选择器，
  任何区块不得再写死自己的天数，也不得自带第二套窗口切换。
- 不改部署链路；`pnpm build`、`pnpm cf:build` 必须仍然通过。

---

## 11. 留给实施者的判断

- 每个营销区块的**具体视觉细节**（间距、字号阶）由实施者按 Ledger 规则定。
- `FeaturesSection` 拆成 `RailsSection` + `InsideSection` 两个区块文件（结构差异太大，
  在同一个文件里重写会让两个叙事互相将就）。
- **文档站写三篇并默认开启**：`content/docs/getting-started.md`、`configuration.md`、
  `deployment.md`，`docs_enabled` 默认改为 `true`（`envConfigs` 与 `.env.example` 同步），
  落地页与页头的 Docs 入口据此出现。文档只讲本仓真实命令，不写未来功能。
- Blog 保留 1–2 篇 demo 文章，内容改写成 Jerbix 口吻；首页不再挂 Blog 区块。
- 每个营销区块的具体视觉细节（间距、字号阶）由实施者按 Ledger 规则定。

---

## 12. 成功标准

0. 代码差异度达到 §8 的目标：非 UI 文件零逐字相同、>0.95 的文件 ≤30、中位 ≤0.90；
   报告里的 `shared` 分母不低于改造前，且改名文件按内容计入。
1. 新买家 clone 后 `pnpm install && pnpm db:push && pnpm dev` 即可看到 Jerbix 落地页。
2. 全仓 `rg -i shipany` 零命中；`LICENSE` 为 Jerbix 自有文本。
3. `rg -i "guest.?post"` 零命中；`rg -i "operations_experiment|admin.operations"` 零命中；
   三方言建库成功。
4. `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm cf:build` 全部通过。
5. 落地页与后台在浅色/深色两种模式下都符合 Ledger 视觉规则。
6. 后台任一页面内不出现两个不同的时间窗口：切到 `7 days` 后，卡片、趋势图、漏斗、
   来源表、日序列同步变化，且"较前一窗口"的比较基准一并切换。
7. 访客级归因可用：带 `?utm_source=x&utm_medium=y&utm_campaign=z` 访问任意页面后，
   `analytics_visitor` 新行里五个 UTM 与 `referrer` 正确落库（经净化），
   分析页能按 `utm_campaign` 分组并给出访问量。
8. `REPORT_TIMEZONE` 生效：改成 `America/New_York` 后，日桶边界随之移动，
   夏令时切换那一周不出现 24 小时以外的差错；全仓无时区字面量残留。
9. `.claude/skills/` 收敛并蒸馏完成：目录下 8 个技能，`SKILL.md` 合计 ≤ 1150 行，
   每个与上游同名技能相似度 ≤ 0.70，`security-scan` 不再逐字节相同，
   `quick-start` / `new-static-page` 在仓库内零引用，四个软链入口仍解析到同一份文件。
