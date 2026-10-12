# Task 8 报告：Tailwind v4 + shadcn/ui CLI

分支：`feat/saas-template-skeleton`
状态：DONE_WITH_CONCERNS（功能全部验证通过；存在一处对 brief 的必要偏离，见下）

## 1. shadcn CLI 实际执行的命令与输出

先确认包已在 `node_modules`（Step 8.1 冗余，both 已由 Task 6 安装），未重新 `pnpm add`：

```bash
ls node_modules/tailwindcss node_modules/@tailwindcss
# node_modules/tailwindcss -> .pnpm/tailwindcss@4.3.3/...
# vite -> ../.pnpm/@tailwindcss+vite@4.3.3_.../node_modules/@tailwindcss/vite
```

CLI 版本探测（未加 `@version`，即 `@latest`）：

```bash
pnpm dlx shadcn@latest --help   # -> shadcn 4.21.4
```

`init` 无法无头运行（交互），改为手写 `components.json` 后只跑 `add`。用 CLI 自身 `--help`
核对参数名（`add` 的旗标为 `-y/--yes`、`--dry-run`、`--view`、`--overwrite`；`init` 的旧式
交互项 Style/Base color/RSC 在新版已不存在，改为 `-t/--template`、`-b/--base`、`--css-variables` 等）。

预演与查看：

```bash
pnpm dlx shadcn@latest add button --dry-run -y
# ├ Files (1) +1 new
# │ + src/components/ui/button.tsx  create
# ├ Dependencies (2)
# │ + cn
# │ + radix-ui
# │ 1 file, 2 deps

pnpm dlx shadcn@latest add button --view -y   # 打印了 64 行的 button.tsx 内容
```

正式执行：

```bash
pnpm dlx shadcn@latest add button -y
# ✔ Checking registry.
# ✔ Installing dependencies.
# ✔ Created 1 file:
#   - src/components/ui/button.tsx
```

`pnpm dlx shadcn@latest info`（探测结果，确认手写配置被识别）：

```text
framework         TanStack Start (tanstack-start)
srcDirectory      Yes
rsc               No
typescript        Yes
tailwindVersion   v4
tailwindCss       src/styles/globals.css
importAlias       @
```

## 2. 最终 `vite.config.ts` 插件顺序

```text
cloudflare({ viteEnvironment: { name: 'ssr' } })   // 必须最先
tanstackStart()
tailwindcss()                                       // 置于 tanstackStart 之后（官方位置）
viteReact()                                         // 保留：TanStack Start dev 依赖 /@react-refresh
tsconfigPaths()                                     // 保留：置于最后
```

`@vitejs/plugin-react` 与 `tsconfigPaths()` 均按任务要求保留（brief Step 8.2 漏掉了前者）。
Biome 的 organizeImports 只重排了 import 语句，插件数组顺序未变（已用 grep 复核行号 11/12/14/17/19）。

## 3. 构建产物 CSS 的 grep 结果（Tailwind 生效的证明）

`pnpm exec vite dev --port 3010`（3000 被其他项目占用，显式改用 3010）。SSR HTML 中按钮存在：

```text
<button data-slot="button" data-variant="default" data-size="default" class="inline-flex shrink-0 ... bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 ... mt-4">基础设施就绪</button>
```

取 HTML 中 `<link rel="stylesheet" href="/src/styles/globals.css">` 的资源并 curl（HTTP 200，27205 bytes），
实际匹配到的规则（真实 Tailwind 输出，非仅 HTML 中的类名）：

```css
.mt-4   { margin-top: calc(var(--spacing) * 4); }
.text-3xl { font-size: var(--text-3xl); line-height: var(--tw-leading, var(--text-3xl--line-height)); }
.font-bold { --tw-font-weight: var(--font-weight-bold); font-weight: var(--font-weight-bold); }
.bg-primary { ... }
.text-primary-foreground { ... }
```

主题 token 同时产出浅色与深色值，且带媒体查询：

```css
--color-background: #ffffff;
--color-background: #0a0a0a;
--color-primary: #0070f3;
--color-primary: #3291ff;
@media (prefers-color-scheme: dark)
```

## 4. CLI 新增的依赖

`shadcn add button`（4.21.4 的新 registry `registry/new-york-v4/ui/button.tsx`）声明并安装：

- `cn@^0.4.0`（shadcn 官方的 clsx + tailwind-merge 合并替代品，**取代了旧的 `src/lib/utils.ts` 方案**）
- `radix-ui@^1.7.0`（Radix 统一包；按钮用 `Slot.Root`）

另有我手动补装的一个（见偏离 3）：

- `class-variance-authority@^0.7.1`

`pnpm-lock.yaml` 已同步更新。

## 5. 对 brief 的偏离与理由

1. **不跑 `pnpm dlx shadcn@latest init`（交互式，无法无人值守）。** 按任务要求手写 `components.json`
   （style `new-york`、baseColor `neutral`、cssVariables `true`、rsc `false`、tsx `true`，tailwind.css
   指向 `src/styles/globals.css`，aliases 走 `@/*`）。随后只跑非交互的 `add button -y`。

2. **shadcn 4.x 与 brief 假设的 2.x 行为不同——`src/lib/utils.ts` 不再生成。**
   brief/任务假设 `add button` 会生成 `src/lib/utils.ts`（clsx + tailwind-merge）。实际 4.21.4 的
   `new-york-v4` registry 让组件 `import { cn } from "cn"`，直接依赖 npm 包 `cn`，**不生成** `src/lib/utils.ts`。
   因此 ambiguity #3 关于「保留生成的 `src/lib/utils.ts`、避免与 Task 10 撞路径」的预设定消失：
   `src/lib/utils.ts` 根本不会被创建，Task 10 若创建同名文件也不会与本任务冲突（但 Task 10 需注意
   组件用的是 `cn` 包而非本地 utils）。已如实保留 CLI 生成的写法（`import { cn } from "cn"`）。

3. **补装 `class-variance-authority`（生成的组件必需，registry 元数据缺失）。**
   生成的 `button.tsx` 顶部 `import { cva, type VariantProps } from "class-variance-authority"`，
   但 registry item 的 `dependencies` 只声明了 `["cn","radix-ui"]`（已用 `shadcn view button` 复核原始
   registry 内容），导致 `tsc` 报 `TS2307: Cannot find module 'class-variance-authority'`。这是
   shadcn registry 的元数据缺口，不是本仓库引入的。为使生成代码真正可用，补装该直接依赖。未手写替身组件。

4. **`globals.css` 深色模式改为 `:root` 覆盖（brief Step 8.3 的嵌套 `@theme` 在 v4 下无效）。**
   brief 原文把深色 token 写成 `@media (prefers-color-scheme: dark) { @theme { ... } }`。Tailwind v4
   官方文档明确：「theme variables … required to be defined top-level and not nested under other
   selectors or media queries」。实测该写法把两个 `@theme` 合并进唯一的顶层 `:root`，深色值覆盖浅色值，
   产物中只剩 `--color-background: #0a0a0a` 且无 `prefers-color-scheme` 查询——即页面恒为深色。
   已改为：顶层 `@theme` 定义 token（保持不变），深色在媒体查询内用普通 `:root { ... }` 重写取值
   （Tailwind 文档推荐的变量覆盖方式）。修复后产物同时含 `#ffffff` 与 `#0a0a0a` 及媒体查询，浅/深色均正常。
   顶层 `@theme` token 块与 `body` 读取 token 的规则均按 brief 保留，仅嵌套块由 `@theme` 变为 `:root`。

5. **保留 `@vitejs/plugin-react` 与 `tsconfigPaths()`（brief Step 8.2 漏写前者）。** 按任务上下文要求保留，
   否则 `pnpm dev` 会因缺 `/@react-refresh` provider 而失败。

6. **`biome.json` 新增 `css.parser.tailwindDirectives: true`。** 否则 Biome 在 `globals.css` 的 `@theme`
   处报 parse 错误（"Tailwind-specific syntax is disabled"），`biome check` 无法通过。这是本任务引入
   Tailwind 指令后必需的配置项。

7. **用 Biome 格式化了生成的 `components/ui/button.tsx`**（双引号→单引号、去分号、`import type * as React`、
   organizeImports）。项目 `biome.json` 未排除 `src/components/ui`，且本任务要求 `biome check` clean。
   语义等价（`React` 命名空间仅用于 `React.ComponentProps<...>` 类型位置）。

## 6. 校验结果

- `pnpm run typecheck`（`tsc --noEmit`）→ **0 errors**。
- `pnpm run test`（`vitest run`）→ **Test Files 1 passed，Tests 7 passed (7)**。
- `./node_modules/.bin/biome check .` → **Checked 15 files，No fixes applied，exit 0（clean）**。
- dev server（端口 3010）SSR HTML 含按钮；CSS 产物含真实 Tailwind 工具类规则（见 §3）；进程已停止。

## 7. 自查发现与遗留不确定

- **已修复的真实缺陷**：brief Step 8.3 的嵌套 `@theme` 在 Tailwind v4 下失效（页面恒深色）。已按官方
  文档改为 `:root` 覆盖并验证浅/深色 token 均产出。
- **registry 元数据缺口**：`new-york-v4` 的 button 未声明 `class-variance-authority`，需手动补装（§5.3）。
- **token 集合是最小版**：brief 只给了 background/foreground/primary/primary-foreground/muted/
  muted-foreground/border/radius。生成的 Button 其他 variant 用到 `destructive/accent/secondary/
  ring/input` 等未定义 token——这些类的规则不会生成（无报错），非默认 variant 会缺样式。当前页面只用
  默认 variant，正常。属 brief「最小版」的预期行为，后续 Task 上完整 shadcn 主题时应补齐。
- **`cn` 包为 shadcn 新的统一合并库**：与旧文档/示例（`@/lib/utils`）不同，后续任务（如 Task 10）
  生成组件时应沿用 `import { cn } from "cn"`，避免重复引入 clsx/tailwind-merge。
- **不确定性**：`shadcn@latest` 会持续演进，本任务锁定的是执行当日的 4.21.4 行为；未 pin 版本到
  `package.json`（CLI 通过 `pnpm dlx` 一次性运行，不落库）。

## 8. Review 修复：补齐 Button 语义 token

本节取代 §7 中「缺失 token 属于预期行为」的结论。即使页面只使用默认 variant，缺少 `ring`
也会让 `outline-none` 后的焦点环回退到 `currentColor`，在页面背景上消失；已生成的其他 variant
同样必须可用。修复仅修改 `src/styles/globals.css` 并追加本节，没有修改 Button、依赖或测试文件。

在现有顶层 `@theme` 和深色媒体查询内的 `:root` 分别补齐以下值，保留蓝色 primary
`#0070f3`／`#3291ff`：

| Token | 浅色 | 深色 |
| --- | --- | --- |
| `--color-destructive` | `#b91c1c` | `#ef4444` |
| `--color-secondary` | `#f4f4f5` | `#27272a` |
| `--color-secondary-foreground` | `#0a0a0a` | `#ededed` |
| `--color-accent` | `#e4e4e7` | `#3f3f46` |
| `--color-accent-foreground` | `#0a0a0a` | `#ededed` |
| `--color-ring` | `#0a0a0a` | `#ededed` |
| `--color-input` | `#71717a` | `#71717a` |

### 8.1 编译回归验证

使用 `pnpm exec node --input-type=module` 的 stdin 脚本调用已安装的 Tailwind 编译器，未安装任何包。
修改前先运行五条目标规则断言，结果为 **5 missing utilities，exit 1**，复现 Red。
最初检查器漏计了带伪类后缀的 selector；修正匹配方式后，再同时编译基准提交和最终源码复核。
最终检查的编译步骤如下（修复前源码固定为 `d16e55d`，可在提交后重跑）：

```js
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { compile } = createRequire(require.resolve('@tailwindcss/vite'))('@tailwindcss/node')
const candidates = [
  'bg-destructive', 'bg-secondary', 'hover:bg-accent',
  'focus-visible:ring-ring/50', 'focus-visible:border-ring',
  'text-secondary-foreground', 'hover:text-accent-foreground',
  'dark:border-input', 'dark:bg-input/30', 'dark:hover:bg-input/50',
  'focus-visible:ring-destructive/20', 'dark:focus-visible:ring-destructive/40',
]
for (const phase of ['before', 'after']) {
  const input = phase === 'before'
    ? execFileSync('git', ['show', 'd16e55d:src/styles/globals.css'], { encoding: 'utf8' })
    : readFileSync('src/styles/globals.css', 'utf8')
  const compiler = await compile(input, { base: `${process.cwd()}/src/styles`, onDependency() {} })
  const css = compiler.build(candidates)
  for (const candidate of candidates) {
    const selector = '.' + candidate.replace(/[:/]/g, '\\$&')
    assert.equal(css.includes(selector + ' {') || css.includes(selector + ':'), phase === 'after')
  }
}
const asset = readdirSync('dist/client/assets').find(name => /^globals-.*\.css$/.test(name))
const css = readFileSync(`dist/client/assets/${asset}`, 'utf8')
for (const candidate of candidates) {
  assert.ok(css.includes('.' + candidate.replace(/[:/]/g, '\\$&')))
}
```

最终结果为 **before: 12 utilities missing；after: 12 utilities emitted；production: 12 utilities emitted；exit 0**。
五条必验规则 `bg-destructive`、`bg-secondary`、`hover:bg-accent`、`focus-visible:ring-ring/50`、
`focus-visible:border-ring` 均由缺失变为真实生成。生产文件为
`dist/client/assets/globals-BlqaCtuE.css`（24.40 kB，gzip 5.15 kB）。其焦点颜色包含
`--tw-ring-color: color-mix(in oklab, var(--color-ring) 50%, transparent)` 与 `border-color: var(--color-ring)`，
并保留深色媒体查询覆盖。

### 8.2 浅色与深色数值验证

用 `pnpm exec node --input-type=module` 的 stdin 脚本读取最终 CSS 的实际 hex token，计算 WCAG
sRGB 相对亮度和 `(Lmax + 0.05) / (Lmin + 0.05)`。透明色按 `a × 色值 + (1 − a) × 页面背景`
逐通道合成，包含组件实际的 hover 透明度、深色 destructive 的 60% 填充、深色 outline 的
input 30%／50% 填充、destructive 的 20%／40% ring。下表数值单位均为 `:1`：

| 模式 | Variant | 文字／填充 | Hover 文字／填充 | 焦点环／页面背景 |
| --- | --- | --- | --- | --- |
| 浅色 | default | 4.55 | 3.92 | 3.71 |
| 浅色 | destructive | 6.47 | 5.59 | 1.41 |
| 浅色 | secondary | 18.01 | 18.36 | 3.71 |
| 浅色 | outline | 19.80 | 15.60 | 3.71 |
| 浅色 | ghost | 19.80 | 15.60 | 3.71 |
| 浅色 | link | 4.55 | 4.55 | 3.71 |
| 深色 | default | 6.25 | 5.22 | 4.71 |
| 深色 | destructive | 7.90 | 7.90 | 1.70 |
| 深色 | secondary | 12.72 | 13.69 | 4.71 |
| 深色 | outline | 12.41 | 9.16 | 4.71 |
| 深色 | ghost | 16.91 | 13.13 | 4.71 |
| 深色 | link | 6.25 | 6.25 | 4.71 |

断言全部通过：所有 variant 的正常／hover 文字对比度 ≥ 3:1，焦点环与页面背景对比度 > 1:1；
非 destructive 的焦点环均 ≥ 3:1。修复前默认焦点环与页面背景的对比度在浅深模式下均为 **1.00:1**，
修复后分别为 **3.71:1／4.71:1**。`focus-visible:border-ring` 颜色与页面背景分别为
**19.80:1／16.91:1**（无边框宽度的 variant 主要依靠 3px ring，不以边框颜色代替 ring 验证）。

限制：以上是 body 背景上的数值验证，不宣称完整 WCAG AA 合规，也未执行浏览器截图验证。
保留的蓝色 primary 在浅色 hover 时文字为 3.92:1，低于普通文字 AA 的 4.5:1；生成组件固定的
`ring-destructive/20`／`/40` 可见但较弱（1.41:1／1.70:1），低于 3:1。此次按授权范围保留组件类名。

### 8.3 最终检查与提交

- `pnpm exec biome check src/styles/globals.css` 的普通工具输出曾出现不完整的 `Lint: 1 errors`；
  按 RTK 恢复流程运行 `rtk proxy pnpm exec biome check src/styles/globals.css`，实际最终结果为
  **Checked 1 file，No fixes applied，exit 0**，无诊断项。
- `pnpm run build` → **exit 0**；client 287 modules、SSR 345 modules，均成功。
  输出已有的 `vite-tsconfig-paths` 可替换为 Vite 原生 `resolve.tsconfigPaths` 提示；本次不改构建配置。
- 最终定向编译、生产 CSS selector 检查及上述数值断言 → **exit 0**。
- `git diff --check` → **exit 0**；提交仅包含现有 CSS 与本报告。
- 本修复提交主题：`fix(ui): 补齐按钮变体与焦点语义色`；父提交为 `d16e55d`。
  本节与 CSS 位于同一个提交，提交 SHA 可通过 `git log -1 --format=%H -- src/styles/globals.css` 查询。
  提交署名：`Co-Authored-By: Claude Code <noreply@anthropic.com>`。
