# AGENT.md

本文件是本仓库面向 **所有 AI 编程代理** 的统一指导文件（single source of truth）。
Claude Code 经 `CLAUDE.md` 引用本文件；其他代理（Codex、Cursor、Copilot、Gemini CLI 等）
直接读取本文件。

> 若你的工具约定使用 `AGENTS.md`，请同样以本文件为准——两者的内容只在本文件维护。

---

## 项目定位

`saas-template`（品牌名 **Jerbix**）是一个构建在 **Cloudflare Workers** 上的
**TanStack Start** SaaS 起步模板。目标流程：`git clone` → 修改 `src/config/website.ts`
→ 部署。

技术栈：TanStack Start / Router / Query、React 19、TypeScript strict、Tailwind CSS v4、
shadcn/ui（Base UI 基座 / Tabler 图标）、Paraglide JS（zh / en）、Zod、Drizzle ORM + D1、
Vitest + Playwright。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器（Vite，端口 3000） |
| `pnpm build` | 生产构建；`pnpm preview` 预览产物 |
| `pnpm check` | locale 编译 + Biome + TypeScript + env + locale 校验（提交前必跑） |
| `pnpm test` | Vitest 单元测试 + 组件测试（`test.projects` 合并两组） |
| `pnpm test:affected` | 仅跑受影响测试（`vitest run --changed`） |
| `pnpm test:watch` | watch 模式 |
| `pnpm typecheck` | 编译 locale 后跑 `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` / `pnpm format` | Biome |
| `pnpm exec vitest run --config vitest.components.config.ts` | 只跑组件测试（jsdom）；全量已含在 `pnpm test` 内 |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm check:core` | 判定当前 diff 是否触及核心区（退出码 0=核心、1=非核心、2=无法判定） |
| `pnpm check:env` / `pnpm check:env:prod` | 开发 / 生产环境变量校验 |
| `pnpm check:client-bundle` | 检查客户端 bundle 不含服务端 secret |
| `pnpm deploy` | 生产 env 校验 → 构建 → bundle 检查 → `wrangler deploy` |

## 架构要点

- **入口**：`src/server.ts` 是自定义 server entry（`wrangler.jsonc` 的 `main` 指向它）。
  每个请求生成 CSP nonce、解析主题，把归一化后的 env 与 nonce 写入 AsyncLocalStorage
  （`src/lib/server-context.ts`），再用 Paraglide 的 `paraglideMiddleware` 写入语言上下文。
- **路由**：文件路由在 `src/routes/`；根路由经 `shellComponent` 提供 HTML 文档。
  `src/routeTree.gen.ts` 由框架生成，**不得手改**。
- **配置**：`src/config/website.ts` 是站点集中配置的唯一入口，模块加载期求值，只放语言
  无关值；需随请求语言变化的文案必须在工厂调用、组件 render 或路由 `head()` 内求值。
- **env**：`src/env/public.ts`（`VITE_` 前缀，客户端可见）与 `src/env/server.ts`
  （服务端 secret）两层 Zod 校验，是读取 env 的**唯一出口**。
- **i18n**：`src/lib/locale.ts` 为纯逻辑（URL 前缀 → cookie → `Accept-Language` → 默认
  `zh`），`src/locale/middleware.ts` 接入 Paraglide；消息源在仓库根 `messages/{zh,en}.json`。
- **provider**：`src/{mail,newsletter,notification,payment}/index.ts` 暴露按请求构建的
  provider 注册表，业务代码只调用抽象接口。
- **内容**：Content Collections 读 `content/{docs,blog,changelog,legal}/`，构建期生成到
  `.content-collections/`（git-ignored 但在版本控制中，勿手改）。
- **模块门禁**：`src/lib/module-access.ts`（页面，`beforeLoad` 抛 `notFound()`）、
  `src/lib/module-access.server.ts`（API，关闭 → `404 MODULE_DISABLED`，配置不全 →
  `503 SERVICE_UNAVAILABLE`）。门禁必须早于 body 解析、鉴权、限流与 provider 调用。
- **认证**：`src/auth/auth.ts` 的 `getAuth(env)` 每请求可重入；社交登录可见性经
  `src/auth/providers.ts` 的 server function 判定（服务端 secret 不得进客户端 bundle）。

## 关键不变量

违反以下任一条即为缺陷，评审会阻断：

1. **env 两层模型**：业务代码**不得**直接读 `process.env` / `import.meta.env`，一律经
   `src/env/public.ts`、`src/env/server.ts`。
2. **`VITE_` 前缀 = 公开**：`VITE_` 变量构建时进入客户端 bundle，任何人可见，**不得**
   存放 secret。
3. **服务端 secret**：仅经 Workers binding / 服务端读取，**绝不能**设成 `VITE_` 前缀
   （如 `BETTER_AUTH_SECRET`、`STRIPE_SECRET_KEY`）。
4. **消息键配对**：新增消息键必须在所有 locale 文件中同时存在，由
   `scripts/check-locale.ts` 双向校验；改完跑 `pnpm locale:sort`。
5. **不手改生成物**：`src/routeTree.gen.ts`、`src/locale/paraglide/**`、
   `.content-collections/generated/**` 均不得手工编辑。
6. **Workers 运行时**：非 Node.js，含 native binding 的包不可用（见
   `docs/adr/0001-why-cloudflare-workers.md`）。
7. **`src/components/ui` 只放上游原件**：该目录下的文件是 shadcn registry 的原样拷贝，
   **一律不本地修改**，以便直接跟随上游更新。需要调整外观时在调用处传 `className`，
   或用组合件包一层，不要改原件本身。

## 项目规约

### 文档语言

- 所有项目内文档（`README.md`、`docs/`、`content/docs/`、设计文档、注释、ADR）默认使用
  **中文**编写；`content/` 下的英文版为对应的 `.md`，中文版为 `.zh.md`。
- 技术专有名词、命令、代码标识符、库名保留英文原文，无需翻译。
- 中文与半角英数字、符号之间添加一个半角空格，例如：`使用 `pnpm` 安装依赖`。
- 标点符号使用标准中文全角标点。
- API、CLI、配置项等机器可读字段的键名仍使用英文，仅其说明文字使用中文。

### 组件与第三方库：先读官方文档

**硬规则：动手写之前，先查官方文档确认推荐用法。**

- 涉及任何第三方库（better-auth 及其插件、TanStack Start / Router / Query、Base UI、
  Paraglide、Drizzle、shadcn）时，**先查官方文档**，按文档给出的推荐方式接线；不凭记忆
  写 API，也不凭印象猜插件配置项。
- 查阅顺序：**官方文档 → 本仓 `content/docs/` → 现有代码**。三者冲突时以官方文档为准，
  并顺手修正本仓文档，不留两套说法。
- 有意偏离官方推荐（封装、绕过某默认行为）时，在代码注释与 PR 描述里写明**原因**和
  这样做的代价；无说明的偏离视为缺陷。
- 引入插件能力时，先看插件自带什么：能用的官方能力（如 admin 插件的 impersonate、
  session 吊销、access-control）**优先于**手写等价逻辑。

### UI 组件

**硬规则：先找现成组件，找不到才自己写。**

- 编写任何页面前，先确认 shadcn / Base UI 是否已有对应组件；**有就直接用**，仅在确实
  没有可用组件时才手写。已有语义等价的上游组件（如菜单类交互用 `dropdown-menu`，
  弹窗用 `dialog` / `alert-dialog`）时，不得用底层 primitive 手搓一份。
- 本仓是 shadcn 的 **Base UI** 风格工程（`components.json` 的 `style: base-nova`、
  `iconLibrary: tabler`）。新增组件用 CLI 安装，不要手抄源码：

  ```bash
  pnpm dlx shadcn@latest add <component> -y
  ```

- 组件装入 `src/components/ui/`，视为上游原件，**不本地修改**（见「关键不变量」第 7 条）。
- 破坏性操作确认用 `AlertDialog`，不要用 `window.confirm`；空态用 `Empty` / `Spinner`；
  状态标记用 `Badge`——不要手写等价物。
- 表单统一用 **TanStack Form + Zod `validators` + `Field` 组合件**，见
  `content/docs/forms.zh.md`。

### 主题与配色

**硬规则：只使用语义 token，不硬编码调色板。**

- 颜色一律用 `src/styles/globals.css` 中的语义 token（`bg-background`、`text-foreground`、
  `bg-muted`、`border-border`、`text-destructive`、`bg-primary` 等）。**不得**写
  `bg-zinc-100`、`text-gray-500`、`bg-white` 这类具体色阶，也不得写十六进制色值。
- 遮罩、边框、图标底色等需要中性色的场合，同样走 token（`bg-foreground/10` 之类），
  不要用 `bg-black/40` 之类绕过主题。
- 明暗由 `<html data-theme>` 与 `light-dark()` 驱动（见 `src/lib/theme.ts` 与
  `globals.css` 顶部注释）。新增 token 时必须在 `:root` 用 `light-dark(明, 暗)` 成对声明，
  并在 `@theme inline` 中映射为工具类；只声明一半会导致某一主题下取值为空。
- 上游组件（`src/components/ui/`）里的 `bg-black/10` 等是 shadcn 原件的一部分，**不要**
  为统一风格去改原件；在调用处通过 `className` 覆盖。
- **这条规则有测试守着**：`tests/unit/theme-consistency.test.ts` 扫描 `src/`（排除
  `components/ui/` 与 `mail/`），发现十六进制 / rgb / hsl 字面量、Tailwind 具体色阶
  （`bg-gray-500`）或内联颜色样式即失败。两个白名单文件各有原因：`LocaleFlags.tsx`
  是国旗的法定配色，`config/website.ts` 的 `ui.themeColor` 由浏览器在页面外渲染。
  新增例外要在测试里写明原因，不要直接放宽正则。
- **主题字体与字距也走 token**：`--font-sans` / `--font-mono` / `--tracking-normal`
  定义在 `globals.css`，`body` 统一应用。字体文件由 `@fontsource-variable/*` 自托管
  （`globals.css` 顶部的 `@import`），不走 Google Fonts——因此 CSP 的 `font-src` 不必
  放开第三方源。导出稿的三套字体（Inter / Quicksand / JetBrains Mono）都是拉丁专用
  字面，`--font-sans` 里必须保留 `PingFang SC` / `Microsoft YaHei` 后备项，否则中文
  会落到浏览器默认字体。字距 `--tracking-normal` 取导出稿的 `-0.01em`。
- **邮件模板是唯一允许写字面量的业务代码**：邮件客户端不执行站点 CSS，颜色只能硬编码。
  它们集中在 `src/mail/components/EmailLayout.tsx` 的 `EMAIL_THEME`，取值是主题浅色档
  的快照；`theme-consistency.test.ts` 会逐项比对，改主题时漏改会失败。模板里不要另写
  色值，一律从 `EMAIL_THEME` 取。
- **配色来自 tweakcn 主题 `cmvd8fl4i000104l4ctz6amjc`**（为 Jerbix Logo 定制的紫系），
  在 `globals.css` 里转成 `light-dark()` 单声明。品牌稿（`jerbix-brand-v4`）仍是 Logo
  的唯一色源；站点 `--primary` 的 `#6B46FF` 与品牌紫 `#6948FF` 几乎同值，页面上不会被
  看成两个紫。tweakcn 导出的是 `.dark` 类 + Next.js 字体样板，**照抄会失效**——本仓
  没有 `.dark` 类、也没有 `next/font`。改主题时按下面的流程走：

  1. **以 registry JSON 为准**，不要照抄网页上贴出来的 CSS：`curl -sL
     https://tweakcn.com/r/themes/<id>` 取 `cssVars.light` / `cssVars.dark`，两者合成
     一条 `light-dark(明, 暗)`。网页上的导出稿可能与 registry 不同版本（本仓曾因此
     整块 sidebar / chart 取值对不上，页面看着「不像 tweakcn」）；
  2. **逐对校验对比度**（正文 ≥ 4.5:1，非文本图形 ≥ 3:1）。第三方主题普遍过不了 AA，
     本仓对导出稿做了这几处修正，不要「还原」回去：
     - 深色 `--primary` 从 L=0.5990 提到 **0.615**（原值压在 `--card` 上 4.28:1，
       作为链接色不达 AA；提到 0.615 是满足 AA 的最小改动）；
     - **深色 `--primary-foreground` 用墨色而非白色**（白字压在提亮后的主色上只有
       ~3.9:1，墨色 4.79:1）；
     - 浅色 `--accent-foreground` / `--secondary-foreground` 用 L=0.545 而非导出稿的
       0.5553（4.42:1 → 4.63:1）；
     - `--input` 独立加深（导出稿与 `--border` 同值，表单框 1.22:1 几乎看不见）；
     - `--destructive` 两档都重新定 L（导出稿浅色 3.15:1、深色 2.38:1）；
     - 深色 `--sidebar-accent-foreground` 从 0.5990 提到 0.66（压在 `--sidebar-accent`
       上 3.76:1 → 4.61:1）；
  3. 层次：`card > background`，且 **`--sidebar` 与 `--background` 同值**（导出稿如此，
     两种主题都是）。侧栏与页面底的分界完全靠 `--sidebar-border` 的 1px 描边，所以
     `--sidebar-border` **不得**转发 `--background` / `--border`，必须独立取值。
     `--sidebar` 同样**不得**转发 `--card`——转发过去侧栏会变成卡片色，整页塌成一块；
  4. `--accent` / `--secondary` 带明显紫调（C≈0.02–0.04），只作**小面积**的菜单面与
     高亮底；大面积分区用近乎无彩的 `--muted`。装饰图形用 `--highlight`（同色相、
     更浅一档），不要拿 `--accent` 画点线；
  5. 同步 `src/config/website.ts` 的 `ui.themeColor`、`public/manifest.json` 的
     `background_color` / `theme_color`，以及 `content/docs/configuration*.md` 里的示例值。
     `tests/unit/theme-colors.test.ts` 与 `theme-tokens.test.ts` 会守住漂移。

  shadcn 组件映射到主题 token 时注意：`--accent` 不是强调色，`--secondary` 是次级面
  而非次级文本，`--ring` 跟 `--primary` 同色同值。

  导出稿的其余 token 已全部引入：`--destructive-foreground`（实心 destructive 按钮的
  文字色，两档取不同前景才过 AA）、`--chart-1..5`（图表默认序列色）、`--font-sans` /
  `--font-mono` / `--font-serif`、`--tracking-normal`，以及 `--shadow-2xs .. --shadow-2xl`
  整八档。新增组件时若需要图表色、实心危险按钮或投影，直接用这些 token。

  **阴影八档要分主题写，不能像颜色那样用 `light-dark()`。** `light-dark()` 只在**颜色
  上下文**里被解析，`box-shadow` 把整个 `light-dark(...)` 当未知值，结果是
  `box-shadow: none`（本项目实测过：第一版写成折叠式，八档全部失效）。因此浅色档写在
  `@theme inline`（投影色是**品牌紫** `#6b46ff`，这是导出稿 `--shadow-color` 的值），
  深色档用 `:root[data-theme="dark"]` 与 `@media (prefers-color-scheme: dark)` 下的
  `:root[data-theme="system"]` 两段覆盖为黑。添帧数时两段都要补，漏一段系统偏好用户
   会把浅紫投影带进深色外观。

#### 品牌 Logo（v4 矢量包）

- **Logo 走内联 SVG，不用 `<img>`。** `BrandLogo` 用 `?raw` 把
  `src/components/layout/brand/jerbix-horizontal.svg` 当文本导入，剥离资产自带的
  `<style>` 后按 class 名改写成呈现属性（`fill="var(--jbx-text)"` 等）再注入。
  原因是 CSS 变量**无法穿透 `<img>` 的文档边界**——用 `<img src>` 的话主题切换
  对 Logo 完全无效。资产里的 `<style>` 带 `:root{--jbx-*:…}` 默认值，必须剥掉，
  否则内联后会覆盖站点主题。
- **`--jbx-*` 用品牌稿原色，不映射站点 token。** 墨色 `#111318`、品牌紫
  `#6948FF` / `#8066FF` 是设计方定的识别色。站点 `--primary` 浅色档同样取 `#6948FF`，
  二者因此天然一致；深色档 `--primary` 提亮到 `#8C77FF`（对比度需要），与
  `--jbx-accent` 的 `#8066FF` 略有差异，这是有意的——Logo 保持品牌规范，正文链接
  要过 AA。
- **禁止用 CSS 滤镜从浅色 Logo 推导深色版。** `invert` / `hue-rotate` 是全局色矩阵，
  字标的深墨色与品牌紫无法同时映射正确（实测墨色被推成纯白，与正文不同色）。
- **深色规格以官方预览为准**：字标纯白 `#fefefe`，只有 `x` 是紫色渐变
  （`#5b38f6` → `#8b49f9`）。按 `--foreground` 之类的正文色推导会让字标发灰，
  偏离品牌稿——这是踩过的坑。吉祥物（jerboa）像素一律不改。
- **位图资产可能带抠图残留。** `logo-horizontal-transparent.svg` 与 `mascot.png`
  原先都在内容区烘死了一层 alpha 5–13 的白色薄雾，浅色底上看不见、深色底上就是
  一个浅色矩形。换新资产后若深色下出现「边框」，先按 alpha 直方图确认是否残留
  （本项目已清理过一轮）。
- **首屏 mascot 仍有两份位图**（`mascot.png` / `mascot-dark.png`），由
  `.leap-mascot-on-dark` 按主题切换，两份必须**同画幅 1032×714、同构图**。
  浅色版是在白底上抠的，边缘残留近白抗锯齿像素（实测 79% 的边缘像素接近纯白），
  深色下会像描了一圈发光的边；深色版边缘干净（0.2%）。换图时先量
  `alpha 30–220 的边缘像素里近白占比`，超过 5% 就会在深色下露白边。
- **切换两层图片用 `visibility`，不要用 `display`。** 深色层绝对定位在浅色层之上，
  浅色层一旦 `display: none` 就不再撑开容器，父级高度塌陷会让深色层整块不可见。

### 工作台布局

`DashboardLayout` 用 shadcn 的 `sidebar` + `SidebarInset`，侧栏 `variant="inset"`。
布局基线对齐 tweakcn 主题的 dashboard 示例（`?p=dashboard` 预览）：

- **侧栏用 `variant="inset"`，不要改回默认 variant。** inset 下内容区是浮起面板
  （`m-2` + `rounded-xl` + `shadow-sm`），顶栏 `h-12` + `border-b` 贴着面板顶部。
  本主题 `--sidebar` 与 `--background` 同值，面板没有底色差，边界只靠 `shadow-sm`
  与顶栏那条细线来读——tweakcn 的预览也是同一套 token、同样的观感，不要因此判定
  「inset 看不出来」而拆成非 inset（那样只剩一圈 8px 的缝）。
- **内容区宽度**用 `max-w-6xl`，不要退成 `max-w-3xl`：工作台既有单列表单也有 5–6 列
  表格，窄栏会让表格列挤在一起。
- **`SidebarInset` 必须带 `min-w-0`**：它是 flex item，默认 `min-width: auto`，宽表格的
  min-content 会把它撑出视口，整页横向滚动。
- **表格窄屏逐级收起次要列**（`hidden sm:table-cell` / `md:` / `lg:`），不要指望横向
  滚动——滚动区会把主操作按钮推出屏幕外。行操作多时收进 `DropdownMenu`。
- **表格的外框、圆角、表头底色一律不要写在调用处**。`ui/table` 上游只有 `<table>` 与
  `[&_tr]:border-b` 的行分隔，没有外层容器；这三样以前散落在各调用处（文档表格有、
  工作台各处没有），同一种组件两种表头。现在由 `globals.css` 的
  `[data-slot='table-container']`（`border` + `--radius-lg` 圆角 + `overflow-hidden`）
  与 `[data-slot='table-header']`（`bg-muted` + `sticky top-0 z-10`）统一给，
  `data-slot` 是 `Table` / `TableHeader` 自带的，**调用处零改动即生效**。
  表头底色挂在 `thead` 而不是每个 `th`：各自带底色时单元格间的空隙会露出底色，
  染通一整行才是 shadcn `dashboard-01` 的样子。文档正文里的表格仍要留 `.not-prose`
  （隔离 typography 的表格排版），但不要再写 `border` / `rounded-lg` / `bg-muted`。
- **表格页不要在表格外面再套一张 `Card`。** `Table` 自带外框（见上一条），外面再套
  卡就是「框里套框」——卡片一道边框、表格又一道，两圈间距还不等宽。工具行（搜索 /
  主操作）与分页行都贴在表格外侧，用 `flex justify-between` 与表格共用同一套留白；
  作用于整张列表的操作（如「注销其他设备」）放表格上方工具行右侧，不属于某一行。
  API 密钥、登录设备、用户管理三个表格页都按此写。表单页（资料 / 安全 / 通知）
  是单列输入，仍然用 `Card` 承载。
- **卡片间距不要逐处写 `p-6`。** `ui/card` 的 utility 类把 `--card-spacing`
  写死在 `[...:--spacing(4)]` 里，`@theme` 变量覆盖不了它；由 `globals.css` 的
  `[data-slot='card']:not([data-size='sm']) { --card-spacing: 1.5rem }` 统一拉到
  24px（tweakcn 预览实测值），`CardFooter` 自带 `p-(--card-spacing)` 随之对齐。
- **尺寸比 shadcn 原件大一号**：原件是 32px 行高 + 16px 图标 + 14px 字号，在 240px
  宽的侧栏里偏挤。`SIDEBAR_ITEM_CLASS` 统一放大为展开态 40px / 18px / 15px、
  收起态 36px / 20px；横版 logo 用 `w-36`（144px）。收起态覆盖必须带 `!`，原件
  `size-8!` 带 important。
- **收起态 logo**：横版 logo（1400×380）缩到 3rem 宽只剩十几像素，必须换成方形图标
  （`metadata.images.icon`）。
- **主题切换收在用户菜单里**（`DashboardUserCard` 的 `DropdownMenuSub`），与「个人中心 /
  退出登录」同组；不要在侧栏里单列一行——图标对不齐，还多占一条菜单高度。窄屏（`md`
  以下）侧栏是抽屉、用户菜单要三步才够到，此时顶栏单独放一个 `ThemeToggle`。
  主题状态与写入统一走 `useTheme()` / `ThemeMenuItems`，独立按钮与菜单项共用一套逻辑。
- **用户菜单从侧栏右缘向外展开**：`side={isMobile ? 'bottom' : 'right'}` +
  `align="end"` + `sideOffset={4}`，照 shadcn `nav-user`。早先是向上弹出，会把内容区
  挡住一大块；`right` 只压住内容区最左一列。窄屏必须切 `bottom`——抽屉贴左缘，
  右弹会顶到视口外。触发按钮右侧图标用 `IconDotsVertical`（不是上箭头，菜单不向上开）。
- **用户表**：头像并入身份列（头像 + 姓名 + 邮箱纵向两行），不单开一列；状态用
  「`size-2` 圆点 + 文案」而非实心 `Badge`——六列表格里 Badge 色块会和角色 Badge、
  操作按钮抢注意力。圆点颜色走语义 token（`bg-success` / `bg-destructive`），
  不写 `emerald-500` 之类的固定色阶，深色下才不会刺眼。
- **用户表的时间列写「封禁到期」（`banExpires`）**，不写「有效期」——schema 里没有
  账号有效期字段，笼统的「有效期」会让管理员以为是订阅到期。三种取值分开表达：
  未封禁 `—`、已封禁无到期时间「永久」、已封禁有到期时间显示日期。别把三种情况都
  渲染成同一个 `—`。
- **封禁原因挂在状态单元格下方**，用 `Popover` 展示完整文本：单元格里截断成一行
  （`max-w-48 truncate`），点击展开。不要用原生 `title`——触屏上不出现，长文本也不
  换行；也不要单开一列，原因只对已封禁用户有值，会留下整列 `—`。只在
  `banned && banReason` 时渲染：插件解封时不清空 `banReason`，单看字段会误报。
- **用户列表的筛选走服务端**：admin 插件的 `listUsers` 只有一组
  `filterField` / `filterValue`，表达不了「邮箱 + 角色 + 封禁状态」三者同时生效。
  检索在 `src/auth/admin-users-query.ts`（只依赖 drizzle，可单测），排序必须带
  `asc(users.id)` 作 tiebreaker——同一秒注册的用户不少，只按时间排序时翻页会重复
  或漏项。搜索用 `like` + 显式转义，不用 `contains`（后者不转义 `%` / `_`）。
- **CSP 的 `script-src` 必须放行分析脚本 origin**。分析脚本是运行时 `injectScript()`
  插入的外部 `<script src>`，CSP nonce 只覆盖服务端序列化进 HTML 的内联脚本，覆盖
  不到它们。GA / Plausible / Clarity 的 origin 固定写在 `ANALYTICS_SCRIPT_ORIGINS`；
  Umami 是自托管的，origin 由 `getAnalyticsScriptOrigins()` 从
  `VITE_UMAMI_SCRIPT_URL` 逐请求推导。曾经的实现只放行了 `connect-src`，生产环境
  脚本全被拦截而测试全绿——**新增外部脚本时 `script-src` 与 `connect-src` 都要看**。
- **分析只在生产构建中注入**（`import.meta.env.PROD`）。本地开发把分析打开会污染
  真实账号数据；验证注入链路用 `pnpm build && pnpm preview`。
- **业务埋点集中在 `src/lib/analytics/events.ts`**，事件名是外部契约，不得在调用处
  写字面量。参数只放非 PII 值（id / 金额 / 枚举），邮箱与姓名一律不进参数。
- **`initAnalytics()` 的幂等标记不能提前置位**。放在所有早退条件之前会让 SSR 或
  模块关闭状态下的首次调用永久占位，同一进程内再也初始化不了。早期实现即是如此。

### 支付

- **Price ID 映射与白名单必须同源**。`payment.priceMap`（plan id → 周期 → Price）
  由 `VITE_STRIPE_PRICE_*` 派生，`payment.allowedPriceIds` 从同一份映射汇总。
  分成两个手写字段时，常见配置是白名单填 A、映射指向 B，结账阶段 502 且现场看不出
  原因。映射在 `src/config/payment.ts`，纯函数、可单测。
- **没有 Price 的 plan 不得给可点的结账按钮**。定价页面用 `isPlanPurchasable()`
  降级为「先注册」，不要让用户点出一个 502。`getServiceStatuses()` 会把空白名单
  报为 `incomplete`，`validateWebsiteConfig()` 会把定价页上不存在的 plan 报成孤儿。
- **Stripe API 版本锁定 `2025-09-30.clover`（`stripe@23`）**，与旧版相比有三处破坏性
  字段迁移，webhook 按新结构读取：
  - `Invoice.subscription` → `Invoice.parent.subscription_details.subscription`
  - `Invoice.charge` → `Invoice.payments.data[].payment.charge`
  - `Subscription.current_period_start/end` → `Subscription.items.data[].current_period_*`

  按旧字段读**不会抛错**——值是 `undefined`，于是 `chargeId` 恒为 `null`、周期写成
  `Invalid Date`，webhook 返回 200 而数据库是错数据。测试夹具必须用新结构，否则
  掩盖这类漂移。时间戳经 `toDate()` 转换，缺失时整列不写而不是写 `Invalid Date`。
- **一次性支付必须落 `payments` 行**。`mode: 'payment'`（终身版）没有 subscription，
  早期实现直接跳过 INSERT，导致 `payments.userId` 恒为 null、无法判断谁买了终身版。
  现在写一条 `type: 'one_time'` 的行，userId 取自 checkout metadata。
- **数据库列名保持供应商中立**：`subscriptions` / `payments` 用 `provider` /
  `customerId` / `subscriptionId` / `invoiceId` / `chargeId`，**不写** `stripeXxx`。
  模板的 provider 注册表允许接入第二个支付渠道，列名里写死 Stripe 会让新增 provider
  时要么改表、要么另起同义列。
- **webhook 的三张表都要有索引**：`subscriptions` 的 `subscription_id` /
  `customer_id` / `user_id`，`payments` 的 `invoice_id` / `charge_id` / `user_id`。
  少了它们，每个事件都是整表扫描。
- **portal 端点只信数据库里的 customerId**。`DELETE /api/payment` 按会话 userId 反查
  `subscriptions.customerId`，绝不接受客户端传入的 id（否则可以打开他人的账单门户）。
- **通知失败不阻塞 webhook**：`notify()` 自身吞掉异常并返回 `false`，webhook 的返回值
  只决定 Stripe 是否重投，与通知成败无关。

### 文档站

`DocsLayout` 是自建 shell（不复用工作台侧栏），交互以 **docs.tanstarter.dev** 为参照。
几条约定：

- **窄屏抽屉用 `Sheet`**（Base UI Dialog），不要手写 `fixed` 面板：焦点陷阱、`aria-modal`、
  滚动锁、Escape、关闭后焦点归还都由弹层提供，手写版会漏掉其中几项。
- **点击文档条目后关闭抽屉**：不关的话新正文被抽屉盖住，用户以为没跳转。
- **分组可折叠、默认展开**：分组是主题分区而非层级菜单；当前文档所在分组强制展开，
  否则从搜索跳过来时高亮条目藏在折叠区里。
- **收起态（`collapsed`）的展开按钮固定在左上角**，并给 `<main>` 补 `lg:pl-20` 让出位置。
  放左下角要越过整页正文才找得到。
- **本页目录**：当前锚点用 `text-primary` 高亮（不加粗、不填底色），h3 缩进一级并有短横线
  接回竖线。scroll-spy 用滚动阈值而非 `IntersectionObserver`——目录表达的是「最后一个
  越过的标题」这种顺序关系；滚到底时强制点亮最后一节。

### Markdown 渲染（`src/components/mdx/Mdx.tsx`）

- **代码块必须带标题栏**（`ui/code-block` 的 `CodeBlockHeader`）：文件/终端图标 + 文件名
  或语言名 + 复制按钮。标题栏同时承担「这是哪个文件」与「和正文分割」两个职责。
- 围栏支持 `title=`：```` ```jsonc title="wrangler.jsonc" ```` 会显示文件名。**配置类文档
  里指向具体文件的代码块都要加 `title=`**——读者需要知道这段该粘进哪个文件。
- **连续的 `###`（≥2 个）渲染为步骤时间线**：编号圆点 + 贯穿竖线。孤立的 `###` 保持普通
  标题，因此同级小节（如「验证链接 / 重置链接」）不会被误编号。规则由渲染器自动判定，
  内容作者不需要额外标注。

### 测试分层

**E2E 只守「用户能不能完成一件事」，细节交互交给组件测试。**

| 层 | 范围 | 位置 |
|---|---|---|
| 单元测试 | 纯逻辑：门禁、主题解析、locale 归一化、env 校验、邮件模板 | `tests/unit/` |
| 组件测试 | 单页面 / 单组件的交互与渲染：表单校验、菜单开关、断点布局、锚点、文案 | `tests/components/` |
| E2E | 跨页面、跨服务的用户旅程：注册登录、个人中心读写、模块门禁、关键页面可访问 | `e2e/` |

E2E 的取舍：

- **写**：需要真实浏览器、真实服务端、真实数据库才能验证的路径（会话 cookie、重定向、
  SSR 与 hydration、路由守卫、API 与页面联动）。
- **不写**：元素位置、断点下的溢出、动画开关、hover 位移、锚点滚动、TOC 结构、
  单个字段的校验提示、静态文件内容（sitemap / robots / manifest）——这些用组件测试或
  构建期断言覆盖，成本低一个数量级。
- **规模**：新增 E2E 前先问「这条用例守的是哪条核心流程」。答不上来就下沉到组件测试。
  单个 spec 保持在 10 条以内，整套 E2E 目标在 5 分钟内跑完。
- **locale**：跨语言行为由单元测试覆盖；E2E 只在**一个** locale 上跑主流程，不逐语言复制。

当前基线（12 条，本地约 50 秒）：

| spec | 守什么 |
|---|---|
| `auth.spec.ts` | 注册 → 自动登录 → 登出；字段校验在提交前拦下 |
| `settings.spec.ts` | 路由守卫、默认落点、昵称写入 D1、登出后会话失效 |
| `docs.spec.ts` | `/docs` 重定向、⌘K 搜索 → 跳转、侧栏偏好由服务端回读 |
| `marketing.spec.ts` | 首页渲染 + 语言切换走真实 `/en` 前缀 |
| `hydration.spec.ts` | zh / en 首页水合无 React / CSP 报错 |
| `site-config.spec.ts` | 关闭模块的 API 返回 404 而非假成功 |

新增用例前先对照这张表：如果守的东西已被某一层覆盖，就不该再进 E2E。

### 变更纪律

- **行为修改先写失败测试**，确认失败原因后再实施最小修改。
- **结构整理与行为修改分开提交**，不在同一提交里混合。
- 提交仅在全部测试通过、Linter 警告为零、代表单一逻辑工作单元时执行；提交消息末尾附
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- **pre-commit 钩子**（simple-git-hooks + lint-staged）在提交时对暂存文件跑
  `biome check --write`，自动格式化并暂存修正。
- **CI**：e2e 仅在 PR 触及核心区或 push 到 `main` 时运行；核心区清单以
  `scripts/core-paths.ts` 为**单一事实来源**（本地 `pnpm check:core` 与 CI 共用，不得
  两处各写一份）。
- 不新增依赖前先确认既有依赖无法满足需求。

### 需要确认的操作

以下操作影响面广，执行前须向用户确认：创建新文件（用户已明确要求的除外）、删除重要
文件、架构或目录结构的大规模调整、引入新的外部服务或库、认证与授权实现、数据库
schema / 迁移变更、生产环境与部署设置变更。

## 参考文档

| 主题 | 位置 |
|---|---|
| 网站配置全字段 | `content/docs/configuration.zh.md` |
| 导航 / 页脚 / 社交菜单 | `content/docs/navigation.zh.md` |
| 邮件 / 订阅 / 支付 / 通知 / 分析 | `content/docs/integrations.zh.md` 及各模块单页 |
| 身份认证与个人中心 | `content/docs/auth.zh.md`、`content/docs/auth-account.zh.md` |
| 表单约定（TanStack Form） | `content/docs/forms.zh.md` |
| 环境变量与两层校验 | `content/docs/environment.zh.md` |
| 术语表与不变量清单 | `CONTEXT.md` |
| 架构与路由表 | `docs/architecture.md` |
| 部署步骤 | `docs/deployment.md` |
| 决策记录 | `docs/adr/` |

## Agent skills

本仓库为这些 skill 提供了项目侧配置：

### Issue tracker

GitHub Issues via `gh` CLI。Issue / PR 标题、正文、评论统一使用中文。
See `docs/agents/issue-tracker.md`.

### Triage labels

默认五标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` /
`wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs

单仓 single-context：根 `CONTEXT.md` + `docs/adr/`。See `docs/agents/domain.md`.

## 与用户级指导文件的关系

本文件只描述**本仓库特有**的规约，不覆盖用户在 `~/.claude/CLAUDE.md` 等用户级文件中
定义的全局行为（TDD 周期、提交纪律、确认规则、语言偏好等）。用户级规则优先适用；
本文件在其之上补充项目细节。
