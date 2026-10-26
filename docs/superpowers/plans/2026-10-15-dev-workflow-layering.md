# 开发流程分层实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让日常开发循环默认只跑受影响的测试，仅当改动命中核心区时才跑全量回归 + e2e，同时消除重复编译与噪音 diff。

**Architecture:** 四层收敛：(1) 让 `pnpm test` 真正覆盖单元 + 组件（修好失效的 workspace 聚合）；(2) `locale:compile` 幂等化，消除串行链里的重复编译；(3) 引入核心区清单，本地脚本与 CI 共用同一份，驱动「受影响测试为主、全量回归仅核心变更」的分层；(4) 消除 CI 重复 install / build 与 `.content-collections` 时间戳噪音。

**Tech Stack:** Vitest 5（`test.projects`）、Playwright、Paraglide JS、Biome、GitHub Actions、`simple-git-hooks` + `lint-staged`。

**Spec:** `docs/superpowers/specs/2026-10-15-dev-workflow-layering-design.md`

## Global Constraints

- 业务代码**不得**直接读 `process.env` / `import.meta.env`，一律经 `src/env/public.ts`、`src/env/server.ts`。
- 不新增依赖前先确认既有依赖无法满足需求；本计划新增 `simple-git-hooks` + `lint-staged`（见 Task 4，**执行前需向用户确认**）。
- 核心区清单**只定义一处**，本地脚本与 CI 共用，不得两处各写一份。
- 提交仅在全部测试通过、Linter 警告为零时执行；提交消息末尾附 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 结构整理与行为修改分开提交。
- 不手改 `src/routeTree.gen.ts`、`src/locale/paraglide/**`、`.content-collections/generated/**`（生成物）。

---

### Task 1: `pnpm test` 覆盖单元 + 组件

**背景:** `vitest.workspace.ts` 引用三个 config 聚合成 workspace，但全仓无任何地方引用它，且 vitest 5 已废弃该文件。实际 `vitest run` 只跑 `vitest.config.ts`（= 仅 `tests/unit`），组件测试（`tests/components`，19 文件 / 160 用例）被漏掉。改用 vitest 5 的 `test.projects`。

**Files:**
- Delete: `vitest.workspace.ts`
- Modify: `vitest.config.ts`（声明 `test.projects`）
- Modify: `vitest.components.config.ts`（加 `name: 'components'`，作为被引用的 project 保留）
- Test: `tests/unit/test-projects.test.ts`（新建，守卫配置）

**Interfaces:**
- Consumes: 无。
- Produces: `pnpm test` 运行 unit + components 两组；`vitest.config.ts` 的 `test.projects` = `['vitest.components.config.ts', <inline unit project>]`。

- [ ] **Step 1: 写失败测试（源码守卫，不 import 配置）**

新建 `tests/unit/test-projects.test.ts`：

```ts
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 测试分组接线守卫。
 *
 * 此前 vitest.workspace.ts 无人引用（vitest 5 已废弃该文件），`pnpm test` 实际
 * 只跑 tests/unit，tests/components 被漏掉。改用 test.projects 后，本测试以源码
 * 断言钉死「两组都在 projects 里」且「死配置已删除」，防止回归。
 *
 * 用源码断言而非 import 配置：配置模块带解析副作用，且 repo 既有守卫测试
 * （brand-config.test.ts）同样读源码。
 */
const root = new URL('../../', import.meta.url)
const vitestConfig = readFileSync(new URL('vitest.config.ts', root), 'utf-8')
const componentsConfig = readFileSync(new URL('vitest.components.config.ts', root), 'utf-8')

describe('vitest projects', () => {
  it('vitest.config.ts 声明了 projects 且含 components 组', () => {
    expect(vitestConfig).toContain('projects:')
    expect(vitestConfig).toContain('vitest.components.config.ts')
  })

  it('unit 组在 projects 内联声明', () => {
    expect(vitestConfig).toContain("name: 'unit'")
  })

  it('components 组带 name: components', () => {
    expect(componentsConfig).toContain("name: 'components'")
  })

  it('失效的 vitest.workspace.ts 已删除', () => {
    expect(existsSync(new URL('vitest.workspace.ts', root))).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run tests/unit/test-projects.test.ts`
Expected: FAIL（`vitest.config.ts` 无 `projects:`；`vitest.workspace.ts` 仍存在）。

- [ ] **Step 3: 删除死配置并改用 test.projects**

Run: `git rm vitest.workspace.ts`

把 `vitest.config.ts` 改为（unit 内联声明，components 以路径引用既有配置文件，避免重复定义）：

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const srcAlias = fileURLToPath(new URL('./src', import.meta.url))
// 与 tsconfig 的 `content-collections` path 对齐：sitemap / legal 等纯逻辑会读生成的
// 博客 / 文档清单，单测需要同一别名才能解析该模块。
const contentCollectionsAlias = fileURLToPath(
  new URL('./.content-collections/generated/index.js', import.meta.url),
)

export default defineConfig({
  test: {
    // 两组 project 合并：unit（node，内联）与 components（jsdom，引用独立配置文件）。
    // 此前 components 只靠一个无人引用的 vitest.workspace.ts 聚合，实际 `vitest run`
    // 只跑 unit，components 的 19 个文件被漏掉。workers 组（0 用例）不并入默认。
    projects: [
      'vitest.components.config.ts',
      {
        resolve: { alias: { '@': srcAlias, 'content-collections': contentCollectionsAlias } },
        test: {
          name: 'unit',
          environment: 'node',
          globals: false,
          // 邮件模板的 actionUrl 白名单从站点 base URL 派生，夹具统一用 example.com。
          env: { VITE_BASE_URL: 'https://example.com' },
          setupFiles: ['tests/setup.ts'],
          include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
          // 默认 5s 在并行高负载下偶发超时（实测全量曾 14 failed，重跑全绿），调高消除 flakiness。
          testTimeout: 15000,
          hookTimeout: 15000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/index.ts',
        'src/**/*.types.ts',
        'src/**/*.schemas.ts',
        'src/locale/paraglide/**',
        'src/**/__tests__/**',
      ],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80, perFile: false },
    },
  },
})
```

在 `vitest.components.config.ts` 的 `test` 块内加 `name` 与超时（其余保持不变）：

```ts
  test: {
    name: 'components',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: [
      'tests/components/**/*.test.tsx',
      'tests/components/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run tests/unit/test-projects.test.ts`
Expected: PASS。

- [ ] **Step 5: 确认 `pnpm test` 覆盖两组**

Run: `pnpm test 2>&1 | tail -20`
Expected: 输出含 unit 与 components 两组，用例总数由 ~602 升至 ~762。

- [ ] **Step 6: 提交**

```bash
git add vitest.config.ts vitest.components.config.ts tests/unit/test-projects.test.ts
git commit -m "$(cat <<'EOF'
chore: 改用 vitest test.projects 合并 unit + components

vitest.workspace.ts 无人引用（vitest 5 已废弃），`pnpm test` 实际只跑
tests/unit，components 的 19 个文件被漏掉。改用 test.projects 声明两组，
并调高 testTimeout 消除并行下的偶发超时。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

（`git rm vitest.workspace.ts` 已在 Step 3 执行，其删除会被本提交一并纳入。）

---

### Task 2: `locale:compile` 幂等化

**背景:** `locale:compile` 实测 ~18s，且在 `check` / `typecheck` / `test` / `check:locale` 里被重复调用。产物在 `src/locale/paraglide`（由 `project.inlang/paraglide.config.ts` 的 `outdir` 决定）。只要 `messages/*.json` 与 `project.inlang/**` 未变，编译结果即最新，可跳过。

**Files:**
- Create: `scripts/locale-compile.ts`
- Modify: `package.json`（`locale:compile` 指向新脚本）
- Test: `tests/unit/locale-compile.test.ts`（新建）

**Interfaces:**
- Consumes: 无。
- Produces: `scripts/locale-compile.ts` 导出 `isCompileUpToDate(now?: number): boolean`（纯函数，便于单测）与 CLI 入口。

- [ ] **Step 1: 写失败测试（纯函数判定逻辑）**

新建 `tests/unit/locale-compile.test.ts`：

```ts
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isCompileUpToDate } from '../../scripts/locale-compile'

/**
 * locale 编译的幂等判定：输入（messages/*.json、project.inlang/**）全部早于产物
 * 时视为最新，跳过编译。这是消除串行链里重复 18s 编译的关键。
 */
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'locale-compile-'))
  mkdirSync(join(root, 'messages'))
  mkdirSync(join(root, 'project.inlang'))
  mkdirSync(join(root, 'out'))
  writeFileSync(join(root, 'messages', 'zh.json'), '{}')
  writeFileSync(join(root, 'project.inlang', 'settings.json'), '{}')
  writeFileSync(join(root, 'out', 'runtime.js'), '// generated')
  return root
}

describe('isCompileUpToDate', () => {
  it('产物比全部输入新时视为最新', () => {
    const root = setup()
    const t = Math.floor(Date.now() / 1000)
    utimesSync(join(root, 'messages', 'zh.json'), t - 100, t - 100)
    utimesSync(join(root, 'project.inlang', 'settings.json'), t - 100, t - 100)
    utimesSync(join(root, 'out', 'runtime.js'), t, t)
    expect(isCompileUpToDate({ root })).toBe(true)
  })

  it('输入比产物新时视为需重编', () => {
    const root = setup()
    const t = Math.floor(Date.now() / 1000)
    utimesSync(join(root, 'out', 'runtime.js'), t - 100, t - 100)
    utimesSync(join(root, 'messages', 'zh.json'), t, t)
    expect(isCompileUpToDate({ root })).toBe(false)
  })

  it('产物缺失时视为需重编', () => {
    const root = setup()
    expect(isCompileUpToDate({ root: join(root, 'nonexistent') })).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run tests/unit/locale-compile.test.ts`
Expected: FAIL（`scripts/locale-compile.ts` 不存在）。

- [ ] **Step 3: 实现 `scripts/locale-compile.ts`**

新建 `scripts/locale-compile.ts`：

```ts
/**
 * Paraglide 编译的幂等包装。
 *
 * `paraglide-js compile` 实测 ~18s，且在 `check` / `typecheck` / `test` /
 * `check:locale` 里被重复调用。产物（outdir）只要比全部输入新，即可跳过编译。
 *
 * 输入：`messages/*.json`、`project.inlang/**`。产物目录取自
 * `project.inlang/paraglide.config.ts` 的 outdir（与 CLI / vite 插件同源）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MESSAGES_DIR = 'messages'
const INLANG_DIR = 'project.inlang'
const OUT_DIR = 'src/locale/paraglide'

/** 递归取目录下所有文件的最新 mtime（秒）；目录不存在返回 0。 */
function newestMtime(dir: string): number {
  if (!existsSync(dir)) return 0
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full))
    } else {
      newest = Math.max(newest, statSync(full).mtimeMs)
    }
  }
  return newest
}

/**
 * 产物是否已是最新。
 * `root` 便于单测注入临时目录；默认即仓库根（相对 cwd）。
 */
export function isCompileUpToDate({ root = '.' }: { root?: string } = {}): boolean {
  const outDir = join(root, OUT_DIR)
  // 产物缺失（如全新 clone）→ 必须编译。
  if (!existsSync(join(outDir, 'runtime.js'))) return false
  const outTime = newestMtime(outDir)
  const inputTime = Math.max(
    newestMtime(join(root, MESSAGES_DIR)),
    newestMtime(join(root, INLANG_DIR)),
  )
  // 产物严格晚于输入才算最新；相等（同秒）保守重编。
  return outTime > inputTime
}

// CLI：非 `--force` 且已最新则跳过。
if (process.argv[1]?.endsWith('locale-compile.ts')) {
  const force = process.argv.includes('--force')
  if (!force && isCompileUpToDate()) {
    console.log('locale:compile 跳过（产物已是最新）')
  } else {
    execFileSync('pnpm', ['exec', 'paraglide-js', 'compile', '--project', './project.inlang'], {
      stdio: 'inherit',
    })
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run tests/unit/locale-compile.test.ts`
Expected: PASS。

- [ ] **Step 5: 改 package.json 脚本**

`package.json` 的 `locale:compile` 改为：

```json
    "locale:compile": "tsx scripts/locale-compile.ts",
```

- [ ] **Step 6: 实测幂等（连续两次，第二次应跳过）**

Run:
```bash
pnpm locale:compile
time pnpm locale:compile
```
Expected: 第一次正常编译；第二次输出「locale:compile 跳过（产物已是最新）」，耗时 < 1s。

再验证变更后重编：

Run:
```bash
touch messages/zh.json && pnpm locale:compile
```
Expected: 重新编译。

- [ ] **Step 7: 提交**

```bash
git add scripts/locale-compile.ts package.json tests/unit/locale-compile.test.ts
git commit -m "$(cat <<'EOF'
perf: locale:compile 幂等化，输入未变则跳过编译

paraglide 编译约 18s，且在 check / typecheck / test / check:locale 里被重复
调用。新增幂等包装：产物比 messages/*.json 与 project.inlang/** 新时跳过，
`--force` 可强制重编。加单测覆盖判定逻辑。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 消除 `.content-collections` 时间戳噪音

**背景:** `@content-collections/core` 把 `new Date()` 写进生成头（`node_modules/@content-collections/core/dist/index.js:2168`），且仅 `.content-collections/generated/index.js` 带该头。该目录在 `.gitignore` 第 5 行，但 6 个生成文件在 `7257d80` 被 `git add -f` 纳入版本控制（AGENT.md 记为「git-ignored 但在版本控制中」）。跑一次 `dev` / `build` / `content:build` 即产生噪音 diff。修法（用户已确认）：**去掉生成头的时间戳**。

**Files:**
- Create: `scripts/normalize-content-collections.ts`
- Modify: `package.json`（`content:build` 追加规范化步骤）
- Test: `tests/unit/normalize-content-collections.test.ts`（新建）

**Interfaces:**
- Consumes: 无。
- Produces: `scripts/normalize-content-collections.ts` 导出 `normalizeHeader(content: string): string`（纯函数）与 CLI 入口。

- [ ] **Step 1: 写失败测试（纯函数去掉时间戳）**

新建 `tests/unit/normalize-content-collections.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { normalizeHeader } from '../../scripts/normalize-content-collections'

/**
 * content-collections 的生成头含 `new Date()`，每次构建都变，导致
 * .content-collections/generated/index.js 反复被标记为已修改。规范化为固定串。
 */
describe('normalizeHeader', () => {
  it('把带时间戳的生成头替换为固定串', () => {
    const input = '// generated by content-collections at Thu Oct 15 2026 15:01:41 GMT+0800\n\nconst a = 1\n'
    expect(normalizeHeader(input)).toBe('// generated by content-collections\n\nconst a = 1\n')
  })

  it('已是固定串时保持幂等', () => {
    const input = '// generated by content-collections\n\nconst a = 1\n'
    expect(normalizeHeader(input)).toBe(input)
  })

  it('无生成头时原样返回', () => {
    const input = 'const a = 1\n'
    expect(normalizeHeader(input)).toBe(input)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run tests/unit/normalize-content-collections.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `scripts/normalize-content-collections.ts`**

新建 `scripts/normalize-content-collections.ts`：

```ts
/**
 * 规范化 content-collections 生成物首行注释。
 *
 * `@content-collections/core` 在 index.js 首行写入 `new Date()`，使该文件每次
 * 构建都变（噪音 diff）。这里把时间戳剥掉，只留固定标识。仅 index.js 带此头，
 * 其余 all*.js 不受影响。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const HEADER_RE = /^\/\/ generated by content-collections at .*$/m
const FIXED_HEADER = '// generated by content-collections'

/** 把首行带时间戳的生成头替换为固定串；无头或已是固定串则原样返回。 */
export function normalizeHeader(content: string): string {
  return content.replace(HEADER_RE, FIXED_HEADER)
}

if (process.argv[1]?.endsWith('normalize-content-collections.ts')) {
  const path = '.content-collections/generated/index.js'
  const before = readFileSync(path, 'utf-8')
  const after = normalizeHeader(before)
  if (after !== before) writeFileSync(path, after)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run tests/unit/normalize-content-collections.test.ts`
Expected: PASS。

- [ ] **Step 5: 改 package.json 脚本**

`package.json` 的 `content:build` 改为：

```json
    "content:build": "content-collections build && tsx scripts/normalize-content-collections.ts",
```

- [ ] **Step 6: 实测无噪音**

Run:
```bash
pnpm content:build && pnpm content:build && git status --short .content-collections
```
Expected: 无输出（不再出现 `M .content-collections/generated/index.js`）。若仍有 `M`，说明是被规范化的那一次改动本身——`git add` 后应稳定。

- [ ] **Step 7: 提交**

```bash
git add scripts/normalize-content-collections.ts package.json tests/unit/normalize-content-collections.test.ts .content-collections/generated/index.js
git commit -m "$(cat <<'EOF'
chore: 规范化 content-collections 生成头，消除时间戳噪音

生成物 index.js 首行含 new Date()，每次构建都使该文件变为已修改，制造无意义
diff。构建后剥掉时间戳，只留固定标识；加单测覆盖规范化逻辑。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 核心区清单 + 受影响测试 + pre-commit

**背景:** 现状无任何选择性运行机制，改一行也跑全量；也无 pre-commit 自动化（「提交前跑 check + test」仅靠 `CONTRIBUTING.md` 约定）。本任务引入**单一定义**的核心区清单，本地与 CI 共用。

> **依赖确认：** 本任务引入 `simple-git-hooks` + `lint-staged`（轻量，无 husky 的额外依赖面）。**执行前须向用户确认这两个依赖。**

**Files:**
- Create: `scripts/core-paths.ts`（清单 + 匹配器，单一事实来源）
- Create: `scripts/check-core-changed.ts`（CLI，供本地与 CI 判定）
- Modify: `package.json`（新增 `test:affected`、`check:core` 脚本；新增 `simple-git-hooks` 配置）
- Test: `tests/unit/core-paths.test.ts`（新建）

**Interfaces:**
- Consumes: 无。
- Produces:
  - `scripts/core-paths.ts`：`export const CORE_PATHS: readonly string[]`、`export function isCorePath(file: string): boolean`。
  - `scripts/check-core-changed.ts`：CLI 读取变更文件列表，命中核心区则退出码 0，否则 1。
  - `package.json` 脚本 `test:affected`、`check:core`。

- [ ] **Step 1: 写失败测试（匹配器）**

新建 `tests/unit/core-paths.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { CORE_PATHS, isCorePath } from '../../scripts/core-paths'

/**
 * 核心区判定：命中则本地与 CI 跑全量回归 + e2e。
 */
describe('isCorePath', () => {
  it('认证 / 支付 / env / 门禁 / 数据库 / server / api 路由属于核心区', () => {
    expect(isCorePath('src/auth/auth.ts')).toBe(true)
    expect(isCorePath('src/payment/index.ts')).toBe(true)
    expect(isCorePath('src/env/server.ts')).toBe(true)
    expect(isCorePath('src/lib/module-access.ts')).toBe(true)
    expect(isCorePath('src/db/schema.ts')).toBe(true)
    expect(isCorePath('src/server.ts')).toBe(true)
    expect(isCorePath('src/routes/api/contact/index.ts')).toBe(true)
    expect(isCorePath('src/config/website.ts')).toBe(true)
    expect(isCorePath('src/lib/locale.ts')).toBe(true)
    expect(isCorePath('wrangler.jsonc')).toBe(true)
  })

  it('营销组件 / 样式 / 文案不属于核心区', () => {
    expect(isCorePath('src/components/sections/hero/Hero.tsx')).toBe(false)
    expect(isCorePath('src/styles/globals.css')).toBe(false)
    expect(isCorePath('messages/zh.json')).toBe(false)
    expect(isCorePath('docs/architecture.md')).toBe(false)
  })

  it('清单非空且无重复', () => {
    expect(CORE_PATHS.length).toBeGreaterThan(0)
    expect(new Set(CORE_PATHS).size).toBe(CORE_PATHS.length)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run tests/unit/core-paths.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `scripts/core-paths.ts`**

新建 `scripts/core-paths.ts`：

```ts
/**
 * 核心区清单——「全量回归 + e2e」的判定依据，**单一事实来源**。
 *
 * 本地 `pnpm check:core` 与 CI 的 e2e 触发条件都读这里，不得两处各写一份。
 * 命中以下任一前缀即视为核心变更：这些区域的缺陷影响面广或涉及安全边界，
 * 值得每次改动都跑完整回归。
 */
export const CORE_PATHS: readonly string[] = [
  'src/auth/',
  'src/payment/',
  'src/env/',
  'src/lib/module-access.ts',
  'src/lib/module-access.server.ts',
  'src/db/',
  'src/server.ts',
  'src/routes/api/',
  'src/config/website.ts',
  'src/lib/locale.ts',
  'src/locale/middleware.ts',
  'drizzle.config.ts',
  'drizzle.config.local.ts',
  'wrangler.jsonc',
]

/** 某文件路径是否落在核心区。 */
export function isCorePath(file: string): boolean {
  // 归一化：去掉可能的 ./ 前缀，统一用 / 分隔。
  const normalized = file.replace(/^\.\//, '').replace(/\\/g, '/')
  return CORE_PATHS.some((prefix) => normalized.startsWith(prefix))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run tests/unit/core-paths.test.ts`
Expected: PASS。

- [ ] **Step 5: 实现 `scripts/check-core-changed.ts`**

新建 `scripts/check-core-changed.ts`：

```ts
/**
 * 判定本次改动是否触及核心区。
 *
 * 用法：`tsx scripts/check-core-changed.ts [baseRef]`。
 * 变更文件取自 `git diff --name-only <base>...HEAD`（默认 base 为 origin/main）。
 * 命中核心区退出码 0，否则 1——本地 `pnpm check:core` 与 CI 的 e2e 门禁共用。
 */
import { execFileSync } from 'node:child_process'
import { isCorePath } from './core-paths'

function changedFiles(base: string): string[] {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    encoding: 'utf-8',
  })
  return out.split('\n').map((l) => l.trim()).filter(Boolean)
}

const base = process.argv[2] ?? 'origin/main'
const files = changedFiles(base)
const core = files.filter(isCorePath)

if (core.length > 0) {
  console.log(`核心区改动 ${core.length} 处，需全量回归：`)
  for (const f of core) console.log(`  ${f}`)
  process.exit(0)
}
console.log('未触及核心区，跳过全量回归。')
process.exit(1)
```

- [ ] **Step 6: 加 package.json 脚本与 pre-commit 配置**

`package.json` 的 `scripts` 内新增：

```json
    "test:affected": "pnpm run locale:compile && vitest run --changed",
    "check:core": "tsx scripts/check-core-changed.ts",
```

`package.json` 顶层（与 `scripts` 同级）新增：

```json
  "simple-git-hooks": {
    "pre-commit": "pnpm exec lint-staged"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,css}": "biome check --write --no-errors-on-unmatched"
  },
```

Run:
```bash
pnpm add -D simple-git-hooks lint-staged
pnpm exec simple-git-hooks
```
Expected: `.git/hooks/pre-commit` 被写入。

- [ ] **Step 7: 实测三个脚本**

Run:
```bash
pnpm check:core; echo "exit=$?"
pnpm exec vitest run tests/unit/core-paths.test.ts
```
Expected: `check:core` 依据当前分支 vs `origin/main` 输出并给出退出码；单测通过。

- [ ] **Step 8: 提交**

```bash
git add scripts/core-paths.ts scripts/check-core-changed.ts package.json pnpm-lock.yaml tests/unit/core-paths.test.ts
git commit -m "$(cat <<'EOF'
feat: 核心区清单与分层测试门禁

新增 scripts/core-paths.ts 作为「全量回归 + e2e」判定的单一事实来源，本地
check:core 与 CI 共用；新增 test:affected（vitest --changed）支撑「受影响
测试为主」的本地循环；接入 simple-git-hooks + lint-staged，pre-commit 只对
暂存文件跑 Biome。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: CI 按核心区触发 e2e 并消除重复构建

**背景:** CI 三 job 串行，各自 `pnpm install` + `content:build`，`build` 在 job2 / job3 各跑一次，e2e 全量 49 用例在 `workers: 1` 下串行，且**每次 PR 都跑**。改为：e2e 仅在 (a) 命中核心区，或 (b) push 到 `main` 时运行。

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 4 的 `scripts/check-core-changed.ts`。
- Produces: 新增 `changes` job，输出 `core=true|false`，供 `e2e` job 的 `if` 条件消费。

- [ ] **Step 1: 加 `changes` job（复用核心区清单）**

在 `.github/workflows/ci.yml` 的 `jobs:` 下、`lint-typecheck-test` 之前插入：

```yaml
  changes:
    runs-on: ubuntu-latest
    outputs:
      core: ${{ steps.core.outputs.core }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      # 复用 scripts/core-paths.ts：命中核心区 → core=true。
      - id: core
        run: |
          if pnpm exec tsx scripts/check-core-changed.ts origin/${{ github.base_ref || 'main' }}; then
            echo "core=true" >> "$GITHUB_OUTPUT"
          else
            echo "core=false" >> "$GITHUB_OUTPUT"
          fi
```

- [ ] **Step 2: e2e job 加触发条件**

`e2e` job 改为：

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: [build, changes]
    # 仅核心区改动，或 push 到 main 时跑全量 e2e；普通 PR 跳过。
    if: needs.changes.outputs.core == 'true' || github.event_name == 'push'
    env:
      E2E_BASE_URL: http://localhost:3000
    steps:
```

（其余 `e2e` steps 保持不变。）

- [ ] **Step 3: 复用 build 产物，去掉 e2e job 内重复构建**

`e2e` job 中删除「重新 install → content:build → build」这三步，改为下载 `build` job 的 artifact：

```yaml
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - uses: actions/download-artifact@v4
        with:
          name: build
          path: dist/
```

（后续「Start server」起 `pnpm dev` 不变——dev server 会重建，但依赖已装、产物已在。）

- [ ] **Step 4: 本地校验 workflow 语法**

Run: `pnpm exec tsx -e "process.exit(0)" && node -e "require('node:fs').readFileSync('.github/workflows/ci.yml','utf-8')"`
Expected: 无错误。进一步用 `actionlint`（若可用）：`command -v actionlint && actionlint .github/workflows/ci.yml || echo "actionlint 未安装，跳过"`。

- [ ] **Step 5: 验证核心区判定在 CI 的等价行为**

Run:
```bash
git diff --name-only origin/main...HEAD | head
pnpm check:core; echo "exit=$?"
```
Expected: 输出与 `changes` job 一致（同一脚本）。

- [ ] **Step 6: 提交**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: e2e 改按核心区或 main 触发，并复用 build 产物

此前每次 PR 都跑全量 e2e，且 e2e job 内重复 install + content:build +
build。新增 changes job 复用 scripts/core-paths.ts 判定核心区，e2e 仅在
命中核心区或 push 到 main 时运行，并改为下载 build job 的 dist 产物。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## 收尾验证

- [ ] Run: `pnpm test` → unit + components 两组全绿（用例数 ~762）。
- [ ] Run: `pnpm check` → 全绿；连续两次第二次显著更快（`locale:compile` 跳过）。
- [ ] Run: `pnpm content:build && git status --short .content-collections` → 无输出。
- [ ] Run: `pnpm check:core; echo $?` → 依当前分支改动给出正确退出码。
- [ ] Run: `pnpm exec vitest run tests/unit/locale-compile.test.ts tests/unit/normalize-content-collections.test.ts tests/unit/core-paths.test.ts tests/unit/test-projects.test.ts` → 全绿。
- [ ] 人工：确认 pre-commit 生效（改一个 `.ts` 暂存后 `git commit` 触发 Biome）。
- [ ] 人工：开一个仅改营销组件的 PR，确认 e2e 不跑；改 `src/auth/**` 的 PR，确认 e2e 跑。
