# 主题与组件一致性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 header 弹层遮挡、补齐 sidebar 主题令牌、把 `src/components/ui/` 还原为 shadcn 上游原件、并让文档中心 MDX 用现成 Base UI 组件与 typography 渲染。

**Architecture:** 六项改动围绕一条主线——用现成组件与主题令牌替代自建与硬编码。前三项是「修」，后三项是「归位」：ui 原件回到上游（a11y 覆盖移到调用处），MDX 元素映射改挂 `ui/table` / `ui/alert` / `ui/separator`，排版交给 `@tailwindcss/typography` 并把 prose 变量映射到品牌令牌。

**Tech Stack:** TanStack Start、React 19、TypeScript strict、Tailwind CSS v4、shadcn/ui（Base UI 基座 / Tabler 图标）、Base UI `Menu`、Vitest（node + jsdom）、Playwright、`@tailwindcss/typography`。

**Spec:** `docs/superpowers/specs/2026-10-15-ui-theme-component-consistency-design.md`

## Global Constraints

- `src/components/ui/` 是 shadcn 上游原件，**一律不本地修改**；外观调整在调用处传 `className`，或用组合件包一层。
- 业务代码**不得**直接读 `process.env` / `import.meta.env`，一律经 `src/env/public.ts`、`src/env/server.ts`。
- 消息键必须在 `messages/zh.json` 与 `messages/en.json` 同时存在，改完跑 `pnpm locale:sort`。
- 行为修改先写失败测试；结构整理与行为修改分开提交。
- 不手改 `src/routeTree.gen.ts`、`src/locale/paraglide/**`、`.content-collections/generated/**`。
- 文档中文与半角英数字之间加半角空格；提交消息末尾附 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 组件测试跑法：`pnpm exec vitest run --config vitest.components.config.ts`。
- 单元测试跑法：`pnpm test`。

---

### Task 1: header 弹层 z-index 修复

**背景:** `Navbar.tsx:51` 的 header 是 `sticky top-0 z-40`；header 内三个 `Menu.Positioner`（`UserMenu`、`LocaleSwitcher`、`ThemeToggle`）无 z-index，Base UI 默认 `auto`，弹层经 portal 挂到 `document.body`，被 header 压住顶部。已修复先例是 `src/components/settings/SettingsUserCard.tsx:49` 的 `className="z-50"`。

**Files:**
- Modify: `src/components/layout/UserMenu.tsx:43`
- Modify: `src/components/layout/LocaleSwitcher.tsx:37`
- Modify: `src/components/theme/ThemeToggle.tsx:54`
- Test: `tests/components/user-menu.test.tsx`（追加断言）
- Test: `e2e/settings.spec.ts`（追加 e2e 用例，复用其 `register()` 与 `PASSWORD`）

**Interfaces:**
- Consumes: 无（独立修复）。
- Produces: 无导出变更。三处 `Menu.Positioner` 新增 `className="z-50"`。

- [ ] **Step 1: 写失败测试（组件层断言定位容器带 z-50）**

在 `tests/components/user-menu.test.tsx` 末尾追加：

```tsx
/** 从弹层向上找到 Base UI 的 Positioner 定位容器（`Menu.Popup` 的父元素）。 */
function positionerOf(menu: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = menu
  while (node && !node.className.includes('z-')) node = node.parentElement
  return node
}

describe('UserMenu 弹层层叠', () => {
  it('定位容器带 z-50，避免被 z-40 的 header 压住', async () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: 'user@example.com', name: 'Alice' } },
      isPending: false,
    })
    render(<UserMenu />)
    screen.getByRole('button', { name: 'Alice' }).click()
    const menu = await screen.findByRole('menu')
    const positioner = positionerOf(menu)
    expect(positioner?.className).toContain('z-50')
  })
})
```

（用 `role="menu"` + 向上找带 `z-` 的祖先，而非依赖 Base UI 的内部 `data-*` 属性——与仓库既有 `theme-toggle.test.tsx` 用 `getByRole('menu')` 的取法一致。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/user-menu.test.tsx -t "Positioner 带 z-50"`
Expected: FAIL（`className` 不含 `z-50`）。

- [ ] **Step 3: 三处 Positioner 加 z-50**

`src/components/layout/UserMenu.tsx` 第 43 行：

```tsx
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
```

`src/components/layout/LocaleSwitcher.tsx` 第 37 行：

```tsx
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
```

`src/components/theme/ThemeToggle.tsx` 第 54 行：

```tsx
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
```

- [ ] **Step 4: 跑组件测试确认通过**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/user-menu.test.tsx tests/components/locale-switcher.test.tsx tests/components/theme-toggle.test.tsx`
Expected: PASS（全部）。

- [ ] **Step 5: 加 e2e 断言（真实几何，header 不遮挡弹层）**

在 `e2e/settings.spec.ts` 的 `test.describe('Settings', …)` 内追加（复用文件已有的 `register()` 与 `PASSWORD`——注册后落在首页，营销 Navbar 的头像菜单即在）：

```ts
  test('登录后头像菜单不被 header 遮挡', async ({ page }) => {
    await register(page)
    // 注册后已在首页（register 内部等 URL 落到 /zh 或 /），Navbar 的头像菜单可展开。
    const trigger = page.getByRole('button', { name: '设置用户' })
    await trigger.click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()

    const headerBox = await page.locator('header').first().boundingBox()
    const menuBox = await menu.boundingBox()
    if (!headerBox || !menuBox) throw new Error('无法取得 header 或弹层的边界')
    // 弹层顶边必须在 header 底边之下，才不被压住。
    expect(menuBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1)
  })
```

（`register()` 用的昵称是「设置用户」，故触发按钮可访问名为「设置用户」。若注册后 URL 为 `/`（无前缀），Navbar 仍渲染，不受影响。）

- [ ] **Step 6: 跑 e2e 确认通过**

Run: `pnpm exec playwright test e2e/settings.spec.ts -g "头像菜单"`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/components/layout/UserMenu.tsx src/components/layout/LocaleSwitcher.tsx src/components/theme/ThemeToggle.tsx tests/components/user-menu.test.tsx e2e/marketing.spec.ts
git commit -m "$(cat <<'EOF'
fix: header 内三处弹层补 z-50，修复头像菜单被 header 遮挡

Navbar 是 sticky z-40，而 UserMenu / LocaleSwitcher / ThemeToggle 的
Base UI Menu.Positioner 无 z-index（默认 auto），弹层被 portal 挂到 body
后被 header 压住顶部。与已修复的 SettingsUserCard 同款，补 z-50。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 补齐 sidebar 主题令牌

**背景:** `src/styles/globals.css` 全文没有 `--sidebar*` 裸变量，`@theme inline` 也没有 `--color-sidebar-*` 映射，导致 `src/components/ui/sidebar.tsx` 引用的 `bg-sidebar` / `border-sidebar-border` / `text-sidebar-foreground` / `bg-sidebar-accent` / `ring-sidebar-ring` 全部不生成——个人中心侧栏无背景、无边框。这是用户报告的「分隔符、边框没用统一主题配色」的根因。

**Files:**
- Modify: `src/styles/globals.css`（`@theme inline` 块 + `:root` 品牌 token 块）
- Test: `tests/unit/theme-tokens.test.ts`（新建）

**Interfaces:**
- Consumes: 无。
- Produces: CSS 变量 `--sidebar`、`--sidebar-foreground`、`--sidebar-primary`、`--sidebar-primary-foreground`、`--sidebar-accent`、`--sidebar-accent-foreground`、`--sidebar-border`、`--sidebar-ring`，及对应 `--color-sidebar-*` 工具类映射。

- [ ] **Step 1: 写失败测试（不变式：sidebar.tsx 用到的每个 sidebar 工具类都有令牌映射）**

新建 `tests/unit/theme-tokens.test.ts`：

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 主题令牌完整性守卫。
 *
 * `src/components/ui/sidebar.tsx` 引用了一批 `sidebar-*` 工具类（bg-sidebar、
 * border-sidebar-border…）。若 globals.css 未定义对应的裸变量与 `@theme inline`
 * 映射，Tailwind 会静默不生成这些类，侧栏就失去背景与边框——本测试把这条不变式
 * 钉死，防止令牌再次缺失。
 */
const globals = readFileSync(new URL('../../src/styles/globals.css', import.meta.url), 'utf-8')
const sidebarSource = readFileSync(
  new URL('../../src/components/ui/sidebar.tsx', import.meta.url),
  'utf-8',
)

/** 需要存在裸变量 + @theme 映射的 sidebar 语义色。 */
const SIDEBAR_COLORS = [
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
] as const

describe('sidebar 主题令牌', () => {
  it('每个 sidebar 语义色都有裸变量定义', () => {
    for (const name of SIDEBAR_COLORS) {
      expect(globals).toContain(`--${name}:`)
    }
  })

  it('每个 sidebar 语义色都有 @theme inline 的颜色映射', () => {
    for (const name of SIDEBAR_COLORS) {
      expect(globals).toContain(`--color-${name}: var(--${name});`)
    }
  })

  it('sidebar.tsx 引用的 sidebar 工具类都能被令牌覆盖', () => {
    // 从源码抽出 `bg-sidebar` / `text-sidebar-foreground` 这类工具类名。
    const used = new Set(
      [...sidebarSource.matchAll(/\b(?:bg|text|border|ring)-sidebar(?:-[a-z-]+)?\b/g)].map(
        (m) => m[0],
      ),
    )
    // 工具类名去掉前缀后即语义色名（bg-sidebar-accent → sidebar-accent）。
    const colors = [...used].map((cls) => cls.replace(/^(?:bg|text|border|ring)-/, ''))
    for (const color of colors) {
      expect(SIDEBAR_COLORS).toContain(color)
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run tests/unit/theme-tokens.test.ts`
Expected: FAIL（`--sidebar:` 未定义）。

- [ ] **Step 3: 在 `@theme inline` 块补映射**

在 `src/styles/globals.css` 的 `@theme inline { … }` 内，`--color-ring: var(--ring);` 之后追加：

```css
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
```

- [ ] **Step 4: 在 `:root` 品牌 token 块补裸变量**

在 `src/styles/globals.css` 的 `:root { … --radius: 0.75rem; }` 块内，`--ring` 之后追加（取值全部转发到既有品牌令牌，故自动随 `light-dark()` 明暗）：

```css
  /*
   * 侧栏语义色：转发到既有品牌令牌，使个人中心侧栏的底色 / 边框 / hover 与全站一致。
   * 转发而非新造色值——`--card` 等本身是 light-dark()，因此侧栏自动跟随主题。
   */
  --sidebar: var(--card);
  --sidebar-foreground: var(--foreground);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: var(--muted);
  --sidebar-accent-foreground: var(--muted-foreground);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--ring);
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm exec vitest run tests/unit/theme-tokens.test.ts`
Expected: PASS。

- [ ] **Step 6: 构建并确认工具类已生成**

Run: `pnpm build && grep -o 'bg-sidebar{[^}]*}' dist/client/assets/globals-*.css | head`
Expected: 输出含 `bg-sidebar{...}`（此前该 grep 无结果）。

- [ ] **Step 7: 提交**

```bash
git add src/styles/globals.css tests/unit/theme-tokens.test.ts
git commit -m "$(cat <<'EOF'
fix: 补齐 sidebar 主题令牌，修复个人中心侧栏无背景无边框

globals.css 缺少 --sidebar* 裸变量与 @theme inline 映射，sidebar.tsx 引用的
bg-sidebar / border-sidebar-border / text-sidebar-foreground 等工具类全部
未生成，侧栏因此没有底色与边框。补齐 8 个令牌并转发到既有品牌令牌，随主题
自动明暗；加守卫测试钉死该不变式。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 恢复 card / input / label 为 base-nova 上游原件

**背景:** `src/components/ui/card.tsx`、`input.tsx`、`label.tsx` 是按 shadcn 旧版 `new-york` 风格手写的（`forwardRef` + `rounded-lg`），与项目声明的 `style: base-nova` 不符。base-nova 的 `Card` 是 `rounded-xl ring-1`、含 `CardAction` 与 `size` prop；`Input` 走 `@base-ui/react/input`、高 `h-8`；`Label` 无 `forwardRef`。调用点：`ui/input` 3 处、`ui/card` 5 处、`ui/label` 1 处（`field.tsx`）。

**Files:**
- Modify（CLI 覆盖）: `src/components/ui/card.tsx`、`src/components/ui/input.tsx`、`src/components/ui/label.tsx`
- Test: `tests/components/ui-originals.test.tsx`（新建）
- 调用点复核: `src/components/auth/AuthFormField.tsx`、`src/components/auth/AuthLayout.tsx`、`src/components/sections/newsletter-cta/NewsletterCta.tsx`、四个 `settings/*.tsx`

**Interfaces:**
- Consumes: 无。
- Produces: `Card` 新增 `CardAction` 导出与 `size?: "default" | "sm"` prop；`Input` 为 Base UI 包装；`Label` 为普通函数组件。既有导出名（`Card`、`CardHeader`、`CardTitle`、`CardDescription`、`CardContent`、`CardFooter`、`Input`、`Label`）保持不变。

- [ ] **Step 1: 写失败测试（断言 base-nova 的组件契约）**

新建 `tests/components/ui-originals.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * 守卫：这三个文件必须是 shadcn base-nova 上游原件，而非手写替代。
 *
 * base-nova 的契约特征（区别于旧版 new-york 手写版）：
 * - Card 根带 `data-slot="card"` 与 `--card-spacing` 变量、`rounded-xl`；
 * - Card 支持 `size` prop 并渲染 `data-size`；
 * - CardAction 存在且带 `data-slot="card-action"`；
 * - Input 渲染 `data-slot="input"`；
 * - Label 渲染 `data-slot="label"`。
 */
describe('ui 原件为 base-nova 风格', () => {
  it('Card 渲染 data-slot 与圆角，且支持 size prop', () => {
    render(
      <Card size="sm" data-testid="card">
        <CardHeader>
          <CardTitle>标题</CardTitle>
          <CardAction>操作</CardAction>
        </CardHeader>
        <CardContent>内容</CardContent>
      </Card>,
    )
    const card = screen.getByTestId('card')
    expect(card).toHaveAttribute('data-slot', 'card')
    expect(card).toHaveAttribute('data-size', 'sm')
    expect(card.className).toContain('rounded-xl')
    expect(document.querySelector('[data-slot="card-action"]')).not.toBeNull()
  })

  it('Input 渲染 data-slot="input" 且为 base-nova 尺寸', () => {
    render(<Input aria-label="字段" />)
    const input = screen.getByLabelText('字段')
    expect(input).toHaveAttribute('data-slot', 'input')
    expect(input.className).toContain('h-8')
  })

  it('Label 渲染 data-slot="label"', () => {
    render(<Label>标签</Label>)
    expect(screen.getByText('标签')).toHaveAttribute('data-slot', 'label')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/ui-originals.test.tsx`
Expected: FAIL（`Card` 无 `data-slot`、`Input` 无 `data-slot`、`h-10` 而非 `h-8`）。

- [ ] **Step 3: 用 CLI 重装三个组件**

Run:
```bash
pnpm dlx shadcn@latest add card --overwrite -y
pnpm dlx shadcn@latest add input --overwrite -y
pnpm dlx shadcn@latest add label --overwrite -y
```
Expected: 三个文件被 base-nova 原样覆盖；`components.json` 不变。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/ui-originals.test.tsx`
Expected: PASS。

- [ ] **Step 5: 复核调用点（高度 40→32px 与圆角变化）**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/auth-form-field.test.tsx tests/components/auth-form.test.tsx tests/components/settings-layout.test.tsx`
Expected: PASS。若 `AuthFormField` 测试因 `aria-invalid` 联动失败，检查 `field.tsx` 的 `Field data-invalid` 是否与 base-nova `Input` 的 `aria-invalid:` 类衔接（`field.tsx` 未被改动，仍传 `aria-invalid`，无需改）。

视觉复核（人工）：`pnpm dev` 后打开 `/zh/auth/login` 与 `/zh/settings/profile`，确认输入框高度与卡片圆角正常，无布局塌陷。

- [ ] **Step 6: 提交**

```bash
git add src/components/ui/card.tsx src/components/ui/input.tsx src/components/ui/label.tsx tests/components/ui-originals.test.tsx
git commit -m "$(cat <<'EOF'
refactor: card/input/label 还原为 shadcn base-nova 上游原件

三者此前是按旧版 new-york 手写的（forwardRef + rounded-lg），与项目声明的
style: base-nova 不符，无法直接跟随上游更新。用 CLI 重装为上游原样，并加
守卫测试断言 base-nova 契约（data-slot / data-size / rounded-xl / h-8）。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 恢复 button.tsx 上游，a11y 覆盖移到调用处

**背景:** `src/components/ui/button.tsx` 的 destructive variant 被删掉了 3 个上游焦点环类（`focus-visible:border-destructive/40`、`focus-visible:ring-destructive/20`、`dark:focus-visible:ring-destructive/40`），理由是深色下低透明度焦点环对页面背景仅 1.70:1，低于 3:1。**关键约束（已核实）：** base-nova 的 `Button` 只渲染 `data-slot="button"`，**不带** `data-variant`，因此 CSS 层无法单独命中 destructive 按钮——a11y 覆盖只能落在**调用处的 `className`**（`cn` 基于 twMerge，调用方 className 会覆盖 variant 里的同名焦点环工具类）。全仓仅 1 处 destructive 调用点。

**Files:**
- Modify（CLI 覆盖）: `src/components/ui/button.tsx`
- Create: `src/lib/a11y.ts`
- Modify: `src/routes/{-$locale}/_layout/settings/security.tsx:234`
- Test: `tests/components/button-destructive-focus.test.tsx`（新建）
- Test: `tests/unit/a11y.test.ts`（新建）

**Interfaces:**
- Consumes: 无。
- Produces: `src/lib/a11y.ts` 导出 `destructiveFocusRing: string`（常量，供 destructive 按钮调用处传 `className`）。

- [ ] **Step 1: 写失败测试（断言合并后不含低对比 destructive 焦点环）**

新建 `tests/unit/a11y.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'
import { destructiveFocusRing } from '@/lib/a11y'

/**
 * destructive 按钮的焦点环可访问性。
 *
 * base-nova 的 destructive variant 自带低透明度焦点环（ring-destructive/20），
 * 深色下对页面背景仅 1.70:1，低于 WCAG 3:1 下限。ui 原件不本地修改，改在调用处
 * 用 className 覆盖回高对比的 --ring。`cn` 基于 twMerge，同名工具类后者胜出。
 */
describe('destructiveFocusRing', () => {
  const upstreamDestructive =
    'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40'

  it('覆盖后不再包含低对比的 destructive 焦点环', () => {
    const merged = cn(upstreamDestructive, destructiveFocusRing)
    expect(merged).not.toContain('focus-visible:ring-destructive')
    expect(merged).not.toContain('focus-visible:border-destructive')
  })

  it('覆盖后焦点环指回高对比的 --ring', () => {
    const merged = cn(upstreamDestructive, destructiveFocusRing)
    expect(merged).toContain('focus-visible:ring-ring/50')
    expect(merged).toContain('focus-visible:border-ring')
  })
})
```

新建 `tests/components/button-destructive-focus.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { destructiveFocusRing } from '@/lib/a11y'
import { Button } from '@/components/ui/button'

describe('Button destructive 焦点环', () => {
  it('调用处传入 override 后，最终类名不含低对比 destructive 焦点环', () => {
    render(
      <Button variant="destructive" className={destructiveFocusRing}>
        删除
      </Button>,
    )
    const btn = screen.getByRole('button', { name: '删除' })
    expect(btn.className).not.toContain('focus-visible:ring-destructive')
    expect(btn.className).toContain('focus-visible:ring-ring/50')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run tests/unit/a11y.test.ts`
Expected: FAIL（`@/lib/a11y` 不存在）。

- [ ] **Step 3: 建 `src/lib/a11y.ts`**

新建 `src/lib/a11y.ts`：

```ts
/**
 * 跨组件的可访问性类名常量。
 *
 * `src/components/ui/` 是 shadcn 上游原件，不本地修改；需要调整外观时在调用处传
 * `className`。这里集中存放需要复用的 override，避免散落各处。
 */

/**
 * destructive 按钮的焦点环 override。
 *
 * base-nova 的 destructive variant 自带 `focus-visible:ring-destructive/20` 与
 * `focus-visible:border-destructive/40`——深色下对页面背景仅 1.70:1，低于 WCAG 2.2
 * 的 3:1 非文本对比下限。传本常量给 destructive 按钮的 `className`，`cn`（基于
 * twMerge）会用高对比的 `--ring` 覆盖同名工具类。
 */
export const destructiveFocusRing =
  'focus-visible:ring-ring/50 focus-visible:border-ring dark:focus-visible:ring-ring/50'
```

- [ ] **Step 4: 跑单元 + 组件测试确认通过**

Run: `pnpm exec vitest run tests/unit/a11y.test.ts && pnpm exec vitest run --config vitest.components.config.ts tests/components/button-destructive-focus.test.tsx`
Expected: PASS。

- [ ] **Step 5: 用 CLI 恢复 button.tsx 上游**

Run: `pnpm dlx shadcn@latest add button --overwrite -y`
Expected: `button.tsx` 恢复 3 个 destructive 焦点环类，与上游逐字一致。

- [ ] **Step 6: 在唯一 destructive 调用点传 override**

`src/routes/{-$locale}/_layout/settings/security.tsx` 第 234 行改为：

```tsx
          <AlertDialogTrigger
            render={<Button type="button" variant="destructive" className={destructiveFocusRing} />}
          >
```

并在该文件顶部 import 区加：

```tsx
import { destructiveFocusRing } from '@/lib/a11y'
```

- [ ] **Step 7: 跑组件测试确认通过（Step 5 恢复上游后仍绿）**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/button-destructive-focus.test.tsx`
Expected: PASS（override 覆盖了恢复后的上游焦点环）。

- [ ] **Step 8: 提交**

```bash
git add src/components/ui/button.tsx src/lib/a11y.ts 'src/routes/{-$locale}/_layout/settings/security.tsx' tests/unit/a11y.test.ts tests/components/button-destructive-focus.test.tsx
git commit -m "$(cat <<'EOF'
refactor: button 还原上游，destructive 焦点环覆盖移到调用处

button.tsx 此前删掉了上游 destructive 的 3 个焦点环类（深色下 1.70:1 < 3:1）。
base-nova 的 Button 不带 data-variant，CSS 无法单独命中 destructive，故把
无障碍修复移到唯一调用点的 className：cn 基于 twMerge，高对比 --ring 覆盖
上游同名工具类，ui 原件得以回到上游。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 接入 @tailwindcss/typography 并把 prose 映射到品牌令牌

**背景:** `Mdx.tsx:20` 的 `className="mdx prose max-w-3xl"` 里 `prose` 是死类名——`@tailwindcss/typography` 未安装，`prose` 静默失效。装插件后需把 `--tw-prose-*` 映射到品牌令牌；因 `--foreground` 等本身是 `light-dark()`，prose 自动跟随主题，**无需 `prose-invert`**。

**Files:**
- Modify: `package.json`（新增 devDependency `@tailwindcss/typography`）
- Modify: `src/styles/globals.css`（`@plugin` + prose 变量映射）
- Modify: `src/components/mdx/Mdx.tsx:20`（去掉重复的 `max-w-3xl`）

**Interfaces:**
- Consumes: Task 2 引入的令牌体系（`--foreground` / `--primary` / `--border` 等，已存在）。
- Produces: `.prose` 类可用且配色跟随品牌主题。

- [ ] **Step 1: 装插件**

Run: `pnpm add -D @tailwindcss/typography`
Expected: `package.json` devDependencies 出现 `@tailwindcss/typography`（^0.5.20）。

- [ ] **Step 2: 写失败测试（构建产物含 prose 样式）**

新建 `tests/unit/prose-tokens.test.ts`：

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * prose 排版接入守卫。
 *
 * 此前 `prose` 是死类名（插件未安装，Tailwind 静默不生成），文档正文排版全靠手写
 * mdx.css。本测试断言 globals.css 已 @plugin 且把 prose 变量映射到品牌令牌，
 * 防止插件被移除后 `prose` 再次静默失效。
 */
const globals = readFileSync(new URL('../../src/styles/globals.css', import.meta.url), 'utf-8')

describe('prose 品牌化', () => {
  it('globals.css 注册了 typography 插件', () => {
    expect(globals).toContain('@plugin "@tailwindcss/typography"')
  })

  it('prose 正文与标题色映射到品牌令牌', () => {
    expect(globals).toContain('--tw-prose-body: var(--foreground)')
    expect(globals).toContain('--tw-prose-headings: var(--foreground)')
  })

  it('prose 链接色用主色，而非默认灰阶', () => {
    expect(globals).toContain('--tw-prose-links: var(--primary)')
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm exec vitest run tests/unit/prose-tokens.test.ts`
Expected: FAIL（未注册插件）。

- [ ] **Step 4: 在 globals.css 注册插件并映射变量**

在 `src/styles/globals.css` 顶部 `@import "tailwindcss";` 之后追加：

```css
@plugin "@tailwindcss/typography";
```

在 `:root` 品牌 token 块（以 `--radius: 0.75rem;` 结尾的那一块）之后、`html { scroll-behavior: smooth; }` 之前，插入：

```css
/*
 * prose 品牌化：把 typography 的 --tw-prose-* 映射到本站语义令牌。
 * 令牌本身是 light-dark()，故明暗自动跟随，无需 prose-invert。
 */
.prose {
  --tw-prose-body: var(--foreground);
  --tw-prose-headings: var(--foreground);
  --tw-prose-lead: var(--muted-foreground);
  --tw-prose-links: var(--primary);
  --tw-prose-bold: var(--foreground);
  --tw-prose-counters: var(--muted-foreground);
  --tw-prose-bullets: var(--border);
  --tw-prose-hr: var(--border);
  --tw-prose-quotes: var(--foreground);
  --tw-prose-quote-borders: var(--border);
  --tw-prose-captions: var(--muted-foreground);
  --tw-prose-code: var(--foreground);
  --tw-prose-pre-code: var(--foreground);
  --tw-prose-pre-bg: var(--muted);
  --tw-prose-th-borders: var(--border);
  --tw-prose-td-borders: var(--border);
}
```

- [ ] **Step 5: 去掉 Mdx.tsx 里重复的 max-w-3xl**

`src/components/mdx/Mdx.tsx` 第 20 行：

```tsx
    <div className="mdx prose">
```

（`max-w-3xl` 保留在 `mdx.css` 的 `.mdx` 上，避免两处重复。）

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm exec vitest run tests/unit/prose-tokens.test.ts`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add package.json pnpm-lock.yaml src/styles/globals.css src/components/mdx/Mdx.tsx tests/unit/prose-tokens.test.ts
git commit -m "$(cat <<'EOF'
feat: 接入 @tailwindcss/typography 并把 prose 映射到品牌令牌

此前 Mdx 的 `prose` 是死类名（插件未安装，Tailwind 静默不生成），正文排版全靠
手写 mdx.css。装插件并把 --tw-prose-* 映射到语义令牌；令牌本身是 light-dark()，
明暗自动跟随，无需 prose-invert。加守卫测试防止再次静默失效。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: MDX 元素映射到 ui 组件并收敛样式

**背景:** MDX 表格是手写 `<table>`（无表头底色、无外框）；`> **Note**` / `> **注意事项**`（共 28 处）渲染为低对比 blockquote；代码块 `mdx.css:29` 是唯一的硬编码色 `bg-zinc-900`；`.mdx a` 与正文同色。方案：表格 → `ui/table`，Note 引用 → `ui/alert`（普通引用保留 blockquote），代码块 token 化，链接色改 `text-primary`，docs 正文加容器。

**Files:**
- Modify: `src/components/mdx/Mdx.tsx`（Table 分支、quote 分支）
- Modify: `src/styles/mdx.css`（代码块 token 化、链接色、首元素边距、li 间距）
- Modify: `src/routes/{-$locale}/_layout/docs/$slug.tsx`（正文容器 + 居中）
- Test: `tests/components/mdx.test.tsx`（更新表格与引用块断言）

**Interfaces:**
- Consumes: `ui/table` 的 `Table/TableHeader/TableBody/TableRow/TableHead/TableCell`；`ui/alert` 的 `Alert/AlertTitle/AlertDescription`；Task 5 的 `prose`。
- Produces: `Mdx` 对表格渲染 ui/table 结构；对以 `**Note**` / `**注意事项**` / `**Notes**` 开头的引用渲染 Alert（`role="alert"`），其余引用仍为 blockquote。

- [ ] **Step 1: 更新失败测试（表格结构 + Note→Alert）**

把 `tests/components/mdx.test.tsx` 的 `describe('Mdx 表格')` 首条断言改为：

```tsx
  it('把 markdown 表格渲染为 ui/table 结构', () => {
    render(<Mdx source={['| 字段 | 类型 |', '| --- | --- |', '| name | string |'].join('\n')} />)
    const table = screen.getByRole('table')
    // ui/table 的 Table 根带 data-slot="table"（外层容器是 table-container）。
    expect(table).toHaveAttribute('data-slot', 'table')
    const columnHeaders = within(table).getAllByRole('columnheader')
    expect(columnHeaders.map((c) => c.textContent)).toEqual(['字段', '类型'])
  })
```

把 `describe('Mdx 引用块')` 增加一条 Note 用例（原有的「把 `> ` 行渲染为 blockquote」等用例用的是普通引用，不受影响，**保留不动**）：

```tsx
  it('以 **Note** 开头的引用渲染为 Alert', () => {
    render(<Mdx source="> **Note**: 生产环境必须配置真实域名。" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('data-slot', 'alert')
    expect(alert.textContent).toContain('生产环境必须配置真实域名。')
  })

  it('中文「注意事项」开头的引用同样升级为 Alert', () => {
    render(<Mdx source="> **注意事项**：不要泄漏 secret。" />)
    expect(screen.getByRole('alert').textContent).toContain('不要泄漏 secret。')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/mdx.test.tsx`
Expected: FAIL（表格无 `data-slot="table"`；Note 未渲染 `role="alert"`）。

- [ ] **Step 3: Mdx.tsx 表格改用 ui/table**

`src/components/mdx/Mdx.tsx` 顶部加：

```tsx
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
```

把 `Table({ table })` 函数体替换为：

```tsx
function Table({ table }: { table: TableBlock }) {
  return (
    // `not-prose`：表格样式由 ui/table 提供，不叠加 typography 的表格排版。
    <div className="not-prose mb-4">
      <UITable>
        <TableHeader>
          <TableRow>
            {table.header.map((cell, column) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 静态表格，位置即身份
              <TableHead key={`h-${column}`}>{renderInline(cell)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row, rowIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 同上，行序静态且不重排。
            <TableRow key={`r-${rowIndex}`}>
              {row.map((cell, column) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 同上，单元格位置静态且不重排。
                <TableCell key={`c-${rowIndex}-${column}`}>{renderInline(cell)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </UITable>
    </div>
  )
}
```

- [ ] **Step 4: Mdx.tsx 引用块分支区分 Note / 普通引用**

在 `Mdx.tsx` 加判定函数：

```tsx
/** 引用块是否以 `**Note**` / `**注意事项**` / `**Notes**` 开头——是则升级为 Alert。 */
function isNoteQuote(text: string): boolean {
  return /^\s*\*\*(Note|Notes|注意事项)\*\*/.test(text)
}
```

把 `quote` 分支替换为：

```tsx
        if (b.kind === 'quote')
          return isNoteQuote(b.text) ? (
            <Alert key={key} className="not-prose my-4">
              <AlertDescription>{renderInline(b.text)}</AlertDescription>
            </Alert>
          ) : (
            <blockquote key={key} className="mdx-quote">
              {renderInline(b.text)}
            </blockquote>
          )
```

- [ ] **Step 5: mdx.css 收敛样式（代码块 token 化、链接色、间距）**

`src/styles/mdx.css` 修改：

`.mdx a` 改为：

```css
.mdx a {
  @apply text-primary underline underline-offset-4 hover:text-primary/80;
}
```

`.mdx pre` 与 `.mdx pre code` 改为（去掉硬编码 zinc）：

```css
/* 代码块用主题令牌而非固定深色，明暗主题下都有层次。 */
.mdx pre {
  @apply mb-4 overflow-x-auto rounded-lg border border-border bg-muted p-4;
}
.mdx pre code {
  @apply border-0 bg-transparent p-0 font-mono text-sm text-foreground;
}
```

在 `.mdx` 规则后加首元素边距重置与列表项间距：

```css
/* 正文首元素不额外留上边距（页面标题与 hr 已提供间隔）。 */
.mdx > :first-child {
  @apply mt-0;
}
.mdx li {
  @apply leading-7;
}
```

- [ ] **Step 6: docs 正文加容器并居中**

`src/routes/{-$locale}/_layout/docs/$slug.tsx` 的 `DocPage` 返回改为：

```tsx
  return (
    // 正文与右侧目录并排并整体居中；超宽屏下不再左对齐留出大片空洞。
    <div className="mx-auto flex max-w-5xl justify-center gap-10">
      <article className="max-w-3xl min-w-0 flex-1">
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-muted-foreground">{doc.description}</p>
        {doc.updated !== '' && (
          <p className="mt-2 text-xs text-muted-foreground">
            {m.docs_updated_at()} {doc.updated}
          </p>
        )}
        <hr className="my-6 border-border" />
        <Mdx source={doc.body} />
        <DocNextSteps steps={doc.steps} locale={locale} />
        <DocPager locale={locale} prev={doc.prev} next={doc.next} />
      </article>
      <aside className="sticky top-20 hidden h-fit w-56 shrink-0 xl:block">
        <DocsToc headings={doc.headings} />
      </aside>
    </div>
  )
```

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/mdx.test.tsx tests/components/legal-docs-render.test.tsx`
Expected: PASS。

- [ ] **Step 8: 目视复核**

Run: `pnpm dev`，打开 `/zh/docs/configuration` 与 `/en/docs/configuration`，确认：表格有表头底色与外框、Note 呈现为带边框的 Alert、代码块在明暗两主题下都有层次、链接为主色、超宽屏正文居中。

- [ ] **Step 9: 提交**

```bash
git add src/components/mdx/Mdx.tsx src/styles/mdx.css 'src/routes/{-$locale}/_layout/docs/$slug.tsx' tests/components/mdx.test.tsx
git commit -m "$(cat <<'EOF'
feat: MDX 元素改用 ui 组件并收敛排版

表格改挂 ui/table（此前手写 table 无表头底色与外框）；`> **Note**` 等 28 处
提示引用升级为 ui/alert，普通引用保留 blockquote；代码块去掉唯一的硬编码
bg-zinc-900 改用主题令牌；链接改主色；补首元素边距与列表项间距；docs 正文
加容器并居中，消除超宽屏空洞。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## 收尾验证

- [ ] Run: `pnpm check`（locale 编译 + Biome + TypeScript + env + locale 校验）→ 全绿、零警告。
- [ ] Run: `pnpm test` → 单元测试全绿。
- [ ] Run: `pnpm exec vitest run --config vitest.components.config.ts` → 组件测试全绿。
- [ ] Run: `pnpm build` → 成功；`grep -o 'bg-sidebar{[^}]*}' dist/client/assets/globals-*.css` 有输出。
- [ ] Run: `pnpm test:e2e` → 全绿（含新增头像菜单用例）。
- [ ] 人工：`/zh` 与 `/zh/settings/profile` 在浅色 / 深色 / 跟随系统三种主题下目视一致。
