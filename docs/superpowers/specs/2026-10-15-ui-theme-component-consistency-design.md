# 主题与组件一致性设计

日期：2026-10-15。
状态：对话设计已获用户批准；本文件记录实施规格。

## 1. 目标与范围

收敛五处「主题 / 组件一致性」缺陷，全部围绕同一条主线：**用现成的 shadcn Base UI
组件与主题令牌，而不是自建等价物或硬编码**。

1. 首页 header 的头像下拉菜单被 header 遮住顶部（层叠缺陷）。
2. 个人中心视觉不统一（根因是 sidebar 主题令牌缺失）。
3. `src/components/ui/` 被本地修改过，无法直接跟随上游更新。
4. 文档中心 / 个人中心存在可复用现成组件却自建的情况。
5. 文档中心 markdown 渲染不好看（根因是 `prose` 是死类名）。

五块互相咬合（令牌缺失同时影响 2 与 5；ui 原件恢复是 3 与 4 的前提），因此合并为一份
spec、一个实施计划，**但按块分别提交**。

## 2. 当前源码事实（均已实机核实）

### 2.1 层叠缺陷

- `src/components/marketing/Navbar.tsx:51`：header `sticky top-0 z-40`。
- `src/components/layout/UserMenu.tsx:43`：`Menu.Positioner` **无 z-index**（Base UI
  默认 `auto`），弹层经 `Menu.Portal` 挂到 `document.body`，非 header 后代。
- 几何：header 高 64px（`h-16`）；触发按钮 `size-8` 垂直居中 → 底 ≈48px；`sideOffset=8`
  → 弹层顶 ≈56px，落进 header 带内约 8px。
- 同一缺陷还在 `src/components/layout/LocaleSwitcher.tsx:37`、
  `src/components/theme/ThemeToggle.tsx:54`（同处 header）。
- 既有修法先例：`src/components/settings/SettingsUserCard.tsx:49` 已加 `className="z-50"`
  （commit `975395f`）。

### 2.2 sidebar 主题令牌缺失（个人中心不统一的硬根因）

- `src/styles/globals.css` 全文**没有** `--sidebar*` 裸变量，`@theme inline` 里也**没有**
  `--color-sidebar-*` 映射。
- 实机验证：构建产物 `dist/client/assets/globals-*.css` 中 `bg-sidebar`、`bg-sidebar-accent`、
  `text-sidebar-foreground`、`border-sidebar-border`、`ring-sidebar-ring` **一个都没生成**。
- `src/components/ui/sidebar.tsx` 大量引用这些工具类（如 `:172` `bg-sidebar
  text-sidebar-foreground`、`:362` `bg-sidebar-border`、`:403` `ring-sidebar-ring`）。
- 后果：个人中心侧栏无背景、无边框、无 hover 底色——即用户报告的「分隔符、边框没用统一
  主题配色」。
- 个人中心**其余部分已合规**：四个内容页全部用 `ui/card`，面包屑用 `ui/breadcrumb`，
  无手写 `<hr>` / `divide-*` / `border-t`，无硬编码色（唯一 `dark:bg-white` 是全仓 logo
  统一写法，保留）。

### 2.3 `src/components/ui/` 本地修改

| 文件 | 状态 | 与 base-nova 上游的差异 |
|---|---|---|
| `button.tsx` | 实质修改 | destructive variant 删掉 3 个焦点环类（`focus-visible:border-destructive/40`、`focus-visible:ring-destructive/20`、`dark:focus-visible:ring-destructive/40`），加中文注释；其余逐字一致 |
| `card.tsx` | 手写 new-york 旧版 | `forwardRef` + `displayName`；`rounded-lg border bg-card shadow-sm`；`CardTitle` 是 `<h3 text-2xl>`；缺 `CardAction` 与 `size` prop |
| `input.tsx` | 手写 new-york 旧版 | `forwardRef` + 原生 `<input>`；`h-10 rounded-md focus-visible:ring-offset-2`；缺 `aria-invalid` / `file:` 系列类 |
| `label.tsx` | 手写旧版 | 纯 `<label>` + `forwardRef`；类名与 base-nova 的 `flex items-center gap-2 … group-data-[disabled=true]:…` 不符 |
| 其余 16 个 | 等价 | 仅 import 路径改写与图标替换（`iconLibrary: tabler` 的正常产物） |

已核对 base-nova 官方 registry 源码（card / input / label），确认上述差异。

调用点（影响面）：
- `ui/button`：9 处 import，6 处 `render={<Button …/>}`。
- `ui/input`：3 处 import（`NewsletterCta.tsx:3`、`AuthFormField.tsx:3`、`ui/sidebar.tsx:11`）。
- `ui/card`：5 处（`AuthLayout.tsx:3` 与四个 settings 页）。
- `ui/label`：1 处（`ui/field.tsx:7`，用于 `FieldLabel`）。
- `CardAction` / `<Card size=…>`：全仓无调用点。

### 2.4 MDX 渲染

- `src/components/mdx/Mdx.tsx:20`：`className="mdx prose max-w-3xl"`，但
  `@tailwindcss/typography` **未安装**（`package.json`、`node_modules`、`pnpm-lock.yaml`、
  `globals.css` 全无）→ `prose` 静默失效。
- 排版全靠 `src/styles/mdx.css` 17 条 `@apply`。表格无表头底色、无外框；`> Note` 渲染为
  低对比 `blockquote`；代码块 `mdx.css:29` 是唯一的硬编码色 `bg-zinc-900 text-zinc-100`。
- 内容事实：`content/docs/` 26 个 `.md`（13 篇 × zh/en）。引用块共 **40** 处，其中 **28**
  处以 `> **Note**` / `> **注意事项**` / `> **Notes**` 开头（应升级为 Alert），12 处是普通
  引用（保留 blockquote）。正文无 `---` 分隔线（`---` 只作 frontmatter 定界）。
- 现有测试 `tests/components/mdx.test.tsx` 以 `role="blockquote"` 断言引用块、以
  `table/thead/tbody` 断言表格——改造后需同步更新。

### 2.5 可复用组件盘点

- 个人中心：已合规，无需改。
- 文档中心：侧栏 `DocsSidebar`、搜索 `DocsSearch`（直接用 Base UI `Dialog`）**无上游等价
  组件**（语义与 shadcn `sidebar` 不同），保留自建；搜索弹窗可评估改挂 `ui/dialog` 组合件，
  属可选优化。
- 可复用点集中在 MDX 元素映射（见 3.5）。

## 3. 设计

### 3.1 header 弹层（对应目标 1）

给三处 `Menu.Positioner` 加 `className="z-50"`：`UserMenu.tsx:43`、`LocaleSwitcher.tsx:37`、
`ThemeToggle.tsx:54`。与 `SettingsUserCard` 同款，不改 ui 原件。

**验证**：新增 e2e——打开头像菜单后，弹层 `boundingBox().y` 不低于 header 底边。

### 3.2 sidebar 令牌（对应目标 2）

在 `globals.css` 补 8 个令牌，全部经 `light-dark()` 一次声明明暗，语义对齐品牌：

| 令牌 | 取值来源 |
|---|---|
| `--sidebar` | `--card` |
| `--sidebar-foreground` | `--foreground` |
| `--sidebar-primary` | `--primary` |
| `--sidebar-primary-foreground` | `--primary-foreground` |
| `--sidebar-accent` | `--muted` |
| `--sidebar-accent-foreground` | `--muted-foreground` |
| `--sidebar-border` | `--border` |
| `--sidebar-ring` | `--ring` |

并在 `@theme inline` 补 `--color-sidebar-*` 映射。**验证**：新增单测断言构建 CSS 含
`bg-sidebar` 与 `border-sidebar-border` 两条工具类；e2e 断言侧栏有背景/边框。

### 3.3 恢复 ui 原件（对应目标 3）

- `card.tsx` / `input.tsx` / `label.tsx`：`pnpm dlx shadcn@latest add <c> --overwrite -y`
  重装为 base-nova 原样。
- `button.tsx`：同上，恢复 3 个 destructive 焦点环类。
- **a11y 修复迁移**：在 `globals.css` 加一条作用域覆盖规则，把 destructive 按钮的
  focus-visible 环指回高对比 `--ring`，保住 commit `b891bbf` 的无障碍成果（1.70:1 → ≥3:1），
  且不触原件。
- **调用点适配**：重点看 `AuthFormField`（Input 高度 40→32px 的视觉差与 `aria-invalid`
  联动）与 Card 布局（`rounded-lg` → `rounded-xl ring-1`）。
- **测试**：新增单测断言 destructive 按钮焦点环对比度 ≥3:1（把当初的修复固化为回归）。

### 3.4 复用现成组件（对应目标 4）

- 个人中心：仅由 3.2 的令牌补齐即回到统一主题，不再改结构。
- 文档中心：MDX 元素映射改用 ui 组件（见 3.5）；侧栏 / 搜索保留自建。

### 3.5 MDX 渲染（对应目标 5，方案 1+2）

- 装 `@tailwindcss/typography`，`globals.css` 加 `@plugin`；把 `--tw-prose-*` 映射到品牌
  令牌（`--tw-prose-body: var(--foreground)`、`--tw-prose-headings`、`--tw-prose-links:
  var(--primary)`、`--tw-prose-borders: var(--border)` 等）。因 `--foreground` 本身是
  `light-dark()`，prose **自动跟随主题，无需 `prose-invert`**。
- **元素映射到 ui 组件**（用 `not-prose` 包裹避免与 typography 冲突）：
  - 表格 → `ui/table` 族（`Table/TableHeader/TableBody/TableRow/TableHead/TableCell`）。
  - `> **Note**` / `> **注意事项**` / `> **Notes**` → `ui/alert`；普通引用保留 blockquote。
- 代码块 token 化（复用 `--card` / `--muted` 或 landing 已有的 `--lab-terminal-*`），去掉
  `bg-zinc-900` 硬编码。
- 补 `.mdx a` → `text-primary`、首元素边距重置、`li` 间距、标题 `tracking-tight`。
- docs 正文（`$slug.tsx`）加容器、`flex` 居中，消除超宽屏空洞。
- `mdx.css` 收缩为薄覆盖层。
- **测试**：更新 `mdx.test.tsx`——引用块断言由 `role="blockquote"` 改为 Alert 语义；
  表格断言适配 ui/table 结构。

## 4. 全局约束

沿用 `AGENT.md` 既有规约，重申与本设计相关者：

- `src/components/ui/` 是 shadcn 上游原件，不本地修改；外观调整在调用处传 `className`，
  或用组合件包一层。**本设计将三个手写文件与 button 全部还原上游，是回归该不变量。**
- 业务代码不得直接读 `process.env` / `import.meta.env`。
- 消息键必须在 `messages/{zh,en}.json` 同时存在，改完跑 `pnpm locale:sort`。
- 行为修改先写失败测试；结构整理与行为修改分开提交。
- 不手改 `src/routeTree.gen.ts`、`src/locale/paraglide/**`。
- 文档中文与半角英数字之间加半角空格。

## 5. 提交切分

按块分提交，结构整理与行为修改不混：

1. fix：header 三处 Positioner 补 z-50 + e2e。
2. fix：globals.css 补 sidebar 令牌 + 测试。
3. refactor：ui 原件恢复（card/input/label/button）+ CSS 层 a11y 覆盖 + 调用点适配 + 对比度测试。
4. feat：MDX 渲染改造（typography + ui 组件映射 + 容器）+ 测试更新。

## 6. 验证方式

- `pnpm check`、`pnpm test`（含 components）、`pnpm exec vitest run --config
  vitest.components.config.ts` 全绿。
- `pnpm build` 后断言产物含 sidebar 工具类。
- e2e：header 菜单不被遮挡、settings 侧栏有背景边框、docs 渲染新元素。
- 深浅两色主题目视核对（个人中心、文档站）。

## 7. 非目标

- 不迁移到真 MDX 管线（`@mdx-js/rollup`）——作者需要图片 / h4-h6 / 嵌套列表 / 嵌入组件时
  另开 spec。
- 不改文档中心侧栏 / 搜索的结构（保留自建）。
- 不改个人中心的路由与信息架构。
