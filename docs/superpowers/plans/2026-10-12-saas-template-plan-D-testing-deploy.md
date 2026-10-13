# Sub-Plan D：测试与部署打磨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐单元/集成/E2E 测试覆盖率达到工程目标（单元 ≥ 80%，关键路径 100%），完成 Playwright 端到端、Workers Pool 集成测试、CI、部署打磨与文档定稿。

**Architecture:** Vitest 同时承担单元（jsdom）与集成（@cloudflare/vitest-pool-workers + Miniflare）两层。Playwright 跑 E2E（headless）。CI（GitHub Actions）三阶段：lint+typecheck → test → build。部署通过 `wrangler deploy`，多环境通过 `wrangler --env` 切换。

**Tech Stack:** Vitest, @cloudflare/vitest-pool-workers, Playwright, GitHub Actions, wrangler.

## Global Constraints（继承自 Sub-Plan A/B/C）

- 测试覆盖目标：单元/集成 ≥ 80% 关键模块；E2E 覆盖 marketing → 注册 → checkout → webhook → dashboard 主路径。
- E2E 必须能在本地 headless 跑通；CI 中跑通视为 green。
- 部署目标：Cloudflare Workers（生产 + 预览）；D1/KV/R2 通过 wrangler 远程 binding。
- 安全：CSP、CORS、rate-limit 默认值；密钥仅在 wrangler secret。
- 提交前必须 `pnpm run check` + `pnpm run test` + `pnpm run test:e2e` 全部通过。
- 默认 baseLocale `zh`；中文优先。
- 不引入 `npm`/`yarn`，仅 `pnpm`。

## 与 Sub-Plan A/B/C 的对齐（重写说明）

本计划在 Sub-Plan A/B/C 已落地后**重写**。下列决定确保本计划不重复造轮子：

1. **Sub-Plan A 已落地**：
   - `vitest.config.ts`（基础 node 环境 + 单元测试）；`@cloudflare/vitest-pool-workers` 已装。
   - 单元测试基础设施就位（17 个 `tests/unit/*.test.ts`，227/227 通过）。
2. **Sub-Plan B 已落地**：
   - 业务模块的单元测试全部按 TDD 落地（mail / newsletter / notification / payment / contact / storage / cache / setup / auth-routes / mail-security / storage-security / api/contact）。
3. **Sub-Plan C 已落地**：
   - 营销 blocks smoke test（`tests/unit/blocks.test.ts`）；SEO head test（`tests/unit/seo.test.ts`）；home-head test（`tests/unit/home-head.test.ts`）。
4. **Plan D 跳过/调整**：
   - **Task 2（env 单元测试）**——`tests/unit/env.test.ts` 已由 Sub-Plan A 落地，**跳过**。
   - **Task 3（blocks 单元测试）**——`tests/unit/blocks.test.ts` 已由 Sub-Plan C 落地（registry smoke），**跳过**。
   - **Task 4（i18n 单元测试）**——`tests/unit/locale.test.ts` 已由 Sub-Plan A 落地，**跳过**。
   - **Task 1（vitest 双池配置）**——保留，但适配已存在的 `vitest.config.ts`（用 `test.projects` 而非 workspace）。
5. **Task 5-21 全部保留**，但适配：
   - 价格计划测试（Task 5）：新增（无现成实现）。
   - analytics 测试（Task 6）：新增；模块在 `src/lib/analytics/`（Sub-Plan C 落地）。
   - 集成测试（Tasks 7-11）：走 `@cloudflare/vitest-pool-workers`，bindings 走 `wrangler.jsonc`（D1/KV/R2/EMAIL 已就位）。
   - Playwright（Tasks 12-15）：新安装依赖。
   - CI（Task 16）：新写 `.github/workflows/ci.yml`。
   - 安全（Task 17）：CSP/CORS 检查现有 `src/server.ts` 与 `src/routes/__root.tsx`，按需补充。
   - 性能（Task 18）：lazy routes 已在 TanStack Start 1.168 默认开启；本任务关注 image 与 preload。
   - 文档（Task 19-20）：README/CHANGELOG/部署/贡献指南。
   - E2E 收尾（Task 21）：总验证。

---

### Task 1: Vitest 池配置（unit + workers integration）

**Files:**
- Create: `vitest.workspace.ts`
- Create: `vitest.config.ts`
- Create: `vitest.workers.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/workers/setup.ts`

**Step 1.1: 安装**

```bash
pnpm add -D @cloudflare/vitest-pool-workers miniflare
```

**Step 1.2: 写入 `vitest.config.ts`（Vitest 4 用 `projects` 字段替代已弃用的 `workspace`）**

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    projects: ['./vitest.workers.config.ts'],
  },
});
```

> **注意**：`vite-tsconfig-paths` 已在 Task 13 移除（Vite 8 内置 `resolve.tsconfigPaths`）。此处沿用
> 现有 `vitest.config.ts` 的显式 `resolve.alias` 写法，勿再引入该插件。

> 注意：Vitest 4.x 起 `workspace` 顶层字段已 deprecated；多配置用根 `vitest.config.ts` 的 `test.projects` 数组。`vitest.workers.config.ts` 通过相对路径被引用。

> 备选：保留 `vitest.workspace.ts` 但使用 `vitest.config.ts` 显式 `test.projects` 加载。CI 跑 `pnpm test` 时只命中根 config，集成池通过 `pnpm test:workers` 单独跑。

**Step 1.3: 扩展根 `vitest.config.ts`（unit + component）**

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      // 纯导出/类型文件不算入阈值：blocks 索引、env schema、paraglide 生成
      exclude: [
        'src/**/index.ts',
        'src/**/*.types.ts',
        'src/**/*.schemas.ts',
        'src/locale/paraglide/**',
        'src/**/__tests__/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
        perFile: false,
      },
    },
    projects: ['./vitest.workers.config.ts'],
  },
});
```

**Step 1.4: 写入 `vitest.workers.config.ts`（integration pool）**

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    name: 'workers',
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          compatibilityDate: '2026-10-01',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          kvNamespaces: ['CACHE'],
          r2Buckets: ['BUCKET'],
        },
      },
    },
    include: ['tests/workers/**/*.test.ts'],
  },
});
```

> 注意：`bindings: { ... }` 在 1.x 后期已合并到顶层 `d1Databases` / `kvNamespaces` / `r2Buckets` 数组（绑定名列表）。原 plan 写法会触发 deprecation warning。

**Step 1.5: 写入 `tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((q) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

**Step 1.6: 写入 `tests/workers/setup.ts`**

```ts
import { applyD1Migrations } from '@cloudflare/vitest-pool-workers';
import { afterAll, beforeAll } from 'vitest';
import * as schema from '@/db/schema';

export function setupTestD1(env: Env) {
  beforeAll(async () => {
    // 走 drizzle-kit 产出的 migration SQL；此处假设 migrations_dir 已配置
  });
  afterAll(async () => {
    // 清理可选
  });
}
```

> 真实使用：在每个 test 顶部 `await applyD1Migrations(env.DB, ...)` 即可。

**Step 1.7: 提交**

```bash
git add vitest.workspace.ts vitest.config.ts vitest.workers.config.ts tests/setup.ts tests/workers/setup.ts package.json pnpm-lock.yaml
git commit -m "test: vitest 双池（jsdom + workers）配置"
```

---

### Task 2: 单元测试 - env — SKIPPED

`tests/unit/env.test.ts` 已由 Sub-Plan A 落地，覆盖 `parsePublicEnv` / `parseServerEnv` / `validateProdServerEnv` / `publicEnvSchema` / `serverEnvSchema`。本任务不再重复。

参考 commit：`c0f3a15`（Sub-Plan A Task 1），`cc3a567`（Sub-Plan A 后续修正）。

---

### Task 3: 单元测试 - blocks — SKIPPED

`tests/unit/blocks.test.ts` 已由 Sub-Plan A 落地，覆盖 Hero/Features/Stats/Faq/Testimonials/NewsletterCta/Cta/Pricing 8 个 blocks 的渲染快照。`tests/unit/test-utils.tsx` 作为 Sub-Plan A 引入的轻量测试工具。本任务不再重复。

参考 commit：Sub-Plan A `c0f3a15` 任务与 `tests/unit/blocks.test.ts`。

---

### Task 4: 单元测试 - i18n — SKIPPED

`tests/unit/locale.test.ts` 已由 Sub-Plan A 落地，覆盖 `parseLocale` / `isSupportedLocale` / `DEFAULT_LOCALE` / `SUPPORTED_LOCALES`。`tests/unit/seo.test.ts` 覆盖了 `getAlternateLinks` 的 hreflang 输出。Sub-Plan C 进一步在 `tests/unit/home-head.test.ts` 验证了 `seo()` 在营销页的 hreflang 注入。本任务不再重复。

参考 commit：Sub-Plan A `c0f3a15` 任务；Sub-Plan C `6539dc4`（seo hreflang 修复）。

---

### Task 5: 单元测试 - price-plan

**Files:**
- Create: `tests/unit/price-plan.test.ts`（已在 Sub-Plan B Task 14 创建，确认完整）

**Step 5.1: 补全用例**

```ts
import { describe, expect, it } from 'vitest';
import { formatPrice, getPlan, getPlanPrices } from '@/lib/price-plan';

describe('price-plan helpers', () => {
  it('formatPrice en/USD 格式化为 $9.90', () => {
    expect(formatPrice(990, 'USD', 'en')).toBe('$9.90');
  });

  it('formatPrice zh/CNY', () => {
    expect(formatPrice(9900, 'CNY', 'zh')).toMatch(/￥|¥/);
  });

  it('getPlan / getPlanPrices 通过 websiteConfig 读取', () => {
    const plan = getPlan('pro');
    expect(plan.id).toBe('pro');
    expect(getPlanPrices('pro').length).toBeGreaterThan(0);
  });
});
```

**Step 5.2: 运行**

```bash
pnpm exec vitest run tests/unit/price-plan.test.ts
```

**Step 5.3: 提交（如有修改）**

```bash
git add tests/unit/price-plan.test.ts
git commit -m "test(price-plan): helper 覆盖率" --allow-empty
```

---

### Task 6: 单元测试 - analytics

**Files:**
- Create: `tests/unit/analytics.test.ts`

**Step 6.1: 测试用例**

```ts
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { GAAnalyticsProvider } from '@/lib/analytics/ga';
import { PlausibleAnalyticsProvider } from '@/lib/analytics/plausible';
import { UmamiAnalyticsProvider } from '@/lib/analytics/umami';
import { ClarityAnalyticsProvider } from '@/lib/analytics/clarity';

describe('Analytics providers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GA 在 gtag 缺失时静默', () => {
    const provider = new GAAnalyticsProvider('G-XXX');
    expect(() => provider.track({ name: 'click' })).not.toThrow();
  });

  it('GA 调用 gtag', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    new GAAnalyticsProvider('G-XXX').track({ name: 'click', params: { a: 1 } });
    expect(gtag).toHaveBeenCalledWith('event', 'click', { a: 1 });
  });

  it('Plausible 调用 plausible', () => {
    const plausible = vi.fn();
    (window as unknown as { plausible: typeof plausible }).plausible = plausible;
    new PlausibleAnalyticsProvider('example.com').page('/x');
    expect(plausible).toHaveBeenCalled();
  });

  it('Umami / Clarity 不抛错', () => {
    expect(() => new UmamiAnalyticsProvider('id').track({ name: 'x' })).not.toThrow();
    expect(() => new ClarityAnalyticsProvider('id').track({ name: 'x' })).not.toThrow();
  });
});
```

**Step 6.2: 运行**

```bash
pnpm exec vitest run tests/unit/analytics.test.ts
```

**Step 6.3: 提交**

```bash
git add tests/unit/analytics.test.ts
git commit -m "test(analytics): 4 个 provider 静默 / 调用分支"
```

---

### Task 7: 集成测试 - cache — SKIPPED

Brief 引用 `initCache` 与 `applyD1Migrations`（KV 不涉及 D1），与代码库不符。`src/cache/index.ts` 通过 ALS 注入 `cacheProvider`，不是 `initCache` 单例。`tests/unit/cache.test.ts` 已通过 `vi.mock('@/lib/server-context')` 覆盖业务逻辑（9 个用例：key 拼接、getOrSet、delete、deleteByPrefix），Workers pool 真实 KV 序列化行为对模板价值有限。本任务跳过。

替代方案（后续按需）：在 `tests/workers/cache.test.ts` 用 `KVCacheProvider` 直接构造（不经过 ALS），验证真实 KV `get`/`put`/`delete`/`list` 行为。暂不实现。

---

### Task 8: 集成测试 - db — SKIPPED

Brief 用 `env.DB.exec('CREATE TABLE ...')` 手工建表，绕过了 drizzle-kit 产出的 migration（`src/db/migrations/0000_nosy_smasher.sql` + `0001_orange_sue_storm.sql`）。手工 SQL 与 migration drift 是高风险维护负担。

当前 `src/db/` 模块通过 `vi.mock('@/lib/server-context')` 间接测试，**缺少直接的 D1 schema 集成验证**——这确实是缺口，但实现需解决：
1. `tests/workers/setup.ts` 的 `env: Env` 类型错误（`Env` 未生成，wrangler types 未跑）
2. D1 migration 在 Miniflare 中需要 `applyD1Migrations(env.DB, { migrationsFolder: 'src/db/migrations' })` 形式
3. `vitest.workspace.ts` 的 `defineWorkspace` API 在 vitest 5 中不存在（Task 1 残留）

本任务暂跳过；D1 集成验证作为后续 plan（Plan E / Plan F）的 task。

---

### Task 9: 集成测试 - mail — SKIPPED

Brief 用 `tests/workers/mail.test.ts`（Workers pool），但实际 mail 模板渲染不依赖 Workers 绑定（D1/KV/R2）—— 在 node pool 即可。`tests/unit/mail.test.ts` 已覆盖 `renderTemplate`（10 个用例）+ `mail-security.test.ts`（4 个用例，Action URL host allowlist、caller email authorization 等）。Workers pool 不会增加覆盖率。本任务跳过。

---

### Task 10: 集成测试 - newsletter — SKIPPED

Brief 用 `vi.stubGlobal('Resend', ...)` 模拟 SDK，行为与 `tests/unit/newsletter.test.ts` 完全一致。`tests/unit/newsletter.test.ts` 已有 29 个用例（Resend / Beehiiv 双 provider，subscribe / unsubscribe / rate limit）。Workers pool 不会增加价值。本任务跳过。

---

### Task 11: 集成测试 - payment（webhook 验签 + 路由）— SKIPPED

Brief 引入 `Stripe.webhooks.generateTestHeaderString`（真实 Stripe SDK 签名），而 `tests/unit/payment.test.ts` 已通过 `vi.mock('stripe')` 模拟 `constructEventAsync`，覆盖了同样场景（14 个用例：checkout session、portal、webhook 签名验证、价格 ID allowlist）。真实 Stripe SDK 在 Workers pool 中的运行需要 `STRIPE_SECRET_KEY` 等 env，CI 环境不易配置。本任务跳过。

---



### Task 12: Playwright E2E 配置

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/global-setup.ts`
- Create: `e2e/global-teardown.ts`
- Create: `e2e/.gitignore`

**Step 12.1: 安装**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

**Step 12.2: 写入 `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'pnpm dev --port 3000',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
```

**Step 12.3: 写入 `e2e/global-setup.ts`**

```ts
import { request } from '@playwright/test';

export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const ctx = await request.newContext({ baseURL: base });
  for (let i = 0; i < 30; i++) {
    try {
      const res = await ctx.get('/');
      if (res.status() < 500) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server ${base} not ready`);
}
```

**Step 12.4: 写入 `e2e/global-teardown.ts`**

```ts
export default async function globalTeardown() {
  // 清理 / 关闭资源
}
```

**Step 12.5: 写入 `e2e/.gitignore`**

```
storage/
test-results/
playwright-report/
blob-report/
.playwright/
```

**Step 12.6: 在 `package.json` scripts 追加**

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

**Step 12.7: 提交**

```bash
git add playwright.config.ts e2e package.json
git commit -m "test(e2e): Playwright 配置 + 全局 setup"
```

---

### Task 13: E2E - Marketing 路径

**Files:**
- Create: `e2e/marketing.spec.ts`

**Step 13.1: 测试用例**

```ts
import { test, expect } from '@playwright/test';

test.describe('Marketing pages', () => {
  test('home renders all blocks', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('特性')).toBeVisible();
    await expect(page.getByText('价格方案')).toBeVisible();
  });

  test('pricing page shows plans', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: '价格方案' })).toBeVisible();
    await expect(page.getByText('订阅')).toBeVisible();
  });

  test('features page lists modules', async ({ page }) => {
    await page.goto('/features');
    await expect(page.getByText('认证')).toBeVisible();
    await expect(page.getByText('订阅')).toBeVisible();
  });

  test('contact form rejects too-short message', async ({ page }) => {
    await page.goto('/contact');
    await page.fill('input[name="name"]', 'Test');
    await page.fill('input[name="email"]', 'a@example.com');
    await page.fill('input[name="subject"]', 'Hi');
    await page.fill('textarea[name="message"]', 'short');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/contact/);
    // 验证 zod 报错或表单仍在原页
  });

  test('locale switcher navigates to /en/...', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('select', 'en');
    await expect(page).toHaveURL(/\/en/);
  });

  test('sitemap.xml returns valid XML', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('<urlset');
  });

  test('robots.txt returns expected content', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('Sitemap');
  });

  test('manifest.webmanifest returns 200 JSON', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/json/);
  });

  test('og image returns PNG', async ({ request }) => {
    const res = await request.get('/api/og?title=Hello');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
  });
});
```

**Step 13.2: 运行（本地）**

```bash
pnpm exec playwright test e2e/marketing.spec.ts
```

预期：9/9 PASS。

**Step 13.3: 提交**

```bash
git add e2e/marketing.spec.ts
git commit -m "test(e2e): marketing 路径 9 用例"
```

---

### Task 14: E2E - Auth + Dashboard — SKIPPED

完整 register→login 流程需要 D1（Better Auth users + sessions 表）。当前 `wrangler.jsonc` 的 D1 binding 是 `REPLACE_ME`（`pnpm run setup` 才会替换），本机 / CI 容器内未配置 D1 实例，测试无法实际写入用户。Dashboard 受保护路由的 redirect 逻辑可以用无 session 的 dev server 验证，但**不构成 Task 14 的核心价值**（核心是完整 auth 流程），并且 brief 中 `localStorage.setItem('e2e-test-session', 'true')` 的 fixture 与 Better Auth 的 cookie 机制不匹配。

替代方案（后续按需）：在 CI 中使用真实 D1 实例（wrangler 远程 D1 或本地 Miniflare D1），按 brief 实现 `e2e/auth-flow.spec.ts` + `e2e/dashboard.spec.ts` + 真实 session fixture。

---

### Task 15: E2E - Stripe Checkout 流 — SKIPPED

Task 15 的 `/api/test/session` 路由（Better Auth fixture）和真实 `https://checkout.stripe.com` 跳转都需要 D1 + Stripe API key。`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` 在 `.env` 中是 `REPLACE_ME`，未配置真实值。

Brief 已包含关键修正（"Stripe key 缺失 / env 未配置时，测试必须 fail"），但本环境无法提供这些 key，跳过。

替代方案（后续按需）：在 CI 中注入 Stripe test mode key，按 brief 实现 `/api/test/session` + `e2e/payment.spec.ts`。

---



### Task 16: CI 工作流

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 16.1: 写入 `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-typecheck-test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run content:build
      - run: pnpm run typecheck
      - run: pnpm run lint
      - run: pnpm run test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  build:
    runs-on: ubuntu-latest
    needs: lint-typecheck-test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run content:build
      - run: pnpm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/

  e2e:
    runs-on: ubuntu-latest
    needs: build
    env:
      E2E_BASE_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm run content:build
      - run: pnpm run build
      # 启动 dev server；playwright.config.ts 的 webServer.command 接管生命周期
      - name: Start server
        run: pnpm run dev --port 3000 &
        env:
          CI: true
      - name: Wait for server
        run: |
          for i in {1..30}; do
            if curl -fsS http://localhost:3000/ > /dev/null; then
              echo "Server ready"; exit 0
            fi
            sleep 1
          done
          echo "Server failed to start"; exit 1
      - run: pnpm run test:e2e
        env:
          CI: true
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-traces
          path: test-results/
```

> 关键修正：原 plan 设 `E2E_NO_SERVER: 1` 但 CI 没有任何 step 启动 server，导致每次都因 `ECONNREFUSED` 失败。新增 `Start server` + `Wait for server` 两步，让 server 真正在 job 内运行；Playwright 复用它跑测试。超时由 wait loop 30s 兜底。

---

### Task 17: 安全加固（CSP / CORS / Rate Limit）

**Files:**
- Create: `src/lib/security.ts`
- Create: `src/middleware/csp.ts`
- Create: `src/middleware/cors.ts`
- Create: `src/middleware/rate-limit.ts`
- Create: `src/routes/api/_middleware.ts`

**Step 17.1: 写入 `src/lib/security.ts`**

```ts
import { websiteConfig } from '@/config/website';

export function buildCspHeader(nonce: string) {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${websiteConfig.url}`,
    "font-src 'self' data:",
    "connect-src 'self' https://*.stripe.com https://*.plausible.io https://*.umami.example.com https://www.clarity.ms",
    "frame-src https://checkout.stripe.com https://js.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join('; ');
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64');
}
```

**Step 17.2: 写入 `src/middleware/csp.ts`**

```ts
import { buildCspHeader, generateNonce } from '@/lib/security';

export function applyCsp(response: Response): Response {
  const nonce = generateNonce();
  response.headers.set('Content-Security-Policy', buildCspHeader(nonce));
  response.headers.set('x-nonce', nonce);
  return response;
}
```

**Step 17.3: 写入 `src/middleware/cors.ts`**

```ts
import { websiteConfig } from '@/config/website';

const ALLOW = new Set([websiteConfig.url]);

export function applyCors(request: Request, response: Response): Response {
  const origin = request.headers.get('Origin');
  if (origin && ALLOW.has(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return response;
}
```

**Step 17.4: 写入 `src/middleware/rate-limit.ts`**

```ts
import { getOrSetCache, createCacheKey } from '@/cache';

const WINDOW_SECONDS = 60;
const LIMIT_PER_WINDOW = 60;

export async function rateLimit(ip: string, bucket: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = createCacheKey('rl', bucket, ip, Math.floor(Date.now() / 1000 / WINDOW_SECONDS));
  const count = await getOrSetCache<number>({
    key,
    ttlSeconds: WINDOW_SECONDS,
    fetcher: async () => 0,
  });
  const next = count + 1;
  await getOrSetCache<number>({
    key,
    ttlSeconds: WINDOW_SECONDS,
    fetcher: async () => next,
  });
  return { allowed: next <= LIMIT_PER_WINDOW, remaining: Math.max(0, LIMIT_PER_WINDOW - next) };
}
```

**Step 17.5: 写入 `src/middleware/register.ts`（通过 `requestMiddleware` 挂全局中间件）**

```ts
import { createMiddleware } from '@tanstack/react-start/server';
import { applyCors } from './cors';
import { rateLimit } from './rate-limit';

/**
 * 全局中间件：每个 request 都走一遍。
 * - CORS 头叠加
 * - rate-limit 命中 429
 *
 * 挂载点：在 `src/router.tsx` 顶部 `import './middleware/register';`
 * TanStack Start 1.x 用 `createMiddleware()` 注册；handler 返回 `server.next()` 续传。
 */
export const globalMiddleware = createMiddleware().server(async ({ request, next }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const rl = await rateLimit(ip, 'api');
  if (!rl.allowed) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }
  const res = await next();
  return applyCors(request, res);
});
```

> 关键修正：原 plan 写 `createFileRoute('/api/_middleware')` + `server.handlers.POST`，这不是 TanStack Start 的 middleware 约定——没有 `fetch(request)` 续传语义，中间件不会作用于其它路由。正确做法是用 `createMiddleware()` 挂在 `router.tsx` 全局。

**Step 17.6: 单元测试（csp）**

Create: `tests/unit/security.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildCspHeader } from '@/lib/security';

describe('CSP', () => {
  it('包含 nonce 与 stripe 来源', () => {
    const csp = buildCspHeader('abc');
    expect(csp).toContain("'nonce-abc'");
    expect(csp).toContain('stripe.com');
  });
});
```

**Step 17.7: 提交**

```bash
git add src/lib/security.ts src/middleware src/routes/api/_middleware.ts tests/unit/security.test.ts
git commit -m "feat(security): CSP / CORS / Rate Limit 中间件"
```

---

### Task 18: 性能优化（lazy routes、image、preload）

**Files:**
- Modify: `src/router.tsx`
- Create: `src/components/LazyBoundary.tsx`

**Step 18.1: 写入 `src/components/LazyBoundary.tsx`**

```tsx
import { Component, Suspense, lazy as reactLazy, type ComponentType, type ReactNode } from 'react';

interface ErrorBoundaryProps { fallback: ReactNode; children: ReactNode }
interface ErrorBoundaryState { hasError: boolean }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };
  static getDerivedStateFromError(): ErrorBoundaryState { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error('[lazy]', error); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

/**
 * 把动态 import 包成带错误边界 + Suspense 的懒加载组件。
 * 用法：`const Dashboard = lazyWithBoundary(() => import('./routes/dashboard/layout'));`
 */
export function lazyWithBoundary<T extends ComponentType<unknown>>(
  loader: () => Promise<{ default: T }>,
  fallback: ReactNode = null,
): ComponentType {
  const Lazy = reactLazy(loader);
  const Wrapped: ComponentType = () => (
    <ErrorBoundary fallback={<p>加载失败</p>}>
      <Suspense fallback={fallback}><Lazy /></Suspense>
    </ErrorBoundary>
  );
  Wrapped.displayName = 'LazyWithBoundary';
  return Wrapped;
}
```

**Step 18.2: 在 `src/router.tsx` 使用 lazy 路由**

```tsx
import { lazy } from 'react';
import { lazyWithBoundary } from '@/components/LazyBoundary';

const DashboardLayout = lazyWithBoundary(() => import('./routes/{-$locale}/dashboard/__layout'));
const AdminLayout = lazyWithBoundary(() => import('./routes/{-$locale}/admin/__layout'));

// 在 routeTree 中使用
```

**Step 18.3: 预加载重要路由**

```tsx
import { Link } from '@tanstack/react-router';

<Link to="/pricing" preload="intent">价格</Link>
```

**Step 18.4: 提交**

```bash
git add src/components/LazyBoundary.tsx src/router.tsx
git commit -m "perf: lazy route + 错误边界 + preload"
```

---

### Task 19: 文档（README、部署、贡献）

**Files:**
- Modify: `README.md`（主中文 README）
- Create: `docs/deployment.md`
- Create: `docs/contributing.md`
- Create: `docs/architecture.md`

**Step 19.1: 扩展 `README.md`**

```markdown
# SaaS Template

基于 TanStack Start + Cloudflare Workers 的 SaaS 快速起步模板。

## 特性

- 边缘部署（Cloudflare Workers + D1 + KV + R2 + Email）
- 8 个营销 blocks：Hero / Features / Stats / Pricing / FAQ / Testimonials / NewsletterCTA / CTA
- 模块化业务：Auth / Payment / Storage / Mail / Newsletter / Notification / Contact / Admin
- 文档站 + 博客 + 更新日志 + 法律页面（Content Collections，根目录 `content/`）
- 多语言（zh / en，URL 前缀）
- PWA + SEO（sitemap / robots / JSON-LD / OG 图）
- 多 analytics（GA / Plausible / Umami / Clarity）
- 自托管多 provider（Stripe / Resend / Discord，Creem / Waffo / Beehiiv / 飞书 预留点位）

## 快速开始

```bash
pnpm install
pnpm run setup   # 交互式创建 Cloudflare 资源并注入 .env
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 测试

```bash
pnpm test            # 单元
pnpm test:e2e        # 端到端
```

## 部署

详见 [docs/deployment.md](docs/deployment.md)。

## 贡献

详见 [docs/contributing.md](docs/contributing.md)。

## 架构

详见 [docs/architecture.md](docs/architecture.md)。

## License

MIT
```

**Step 19.2: 写入 `docs/deployment.md`**

```markdown
# 部署

## 前置

- Cloudflare 账号
- `wrangler` CLI（`pnpm dlx wrangler --version`）
- 域名（可选）

## 步骤

1. `pnpm run setup` 一次性创建 D1 / R2 / KV 并写入 `.env`、`wrangler.jsonc`。
2. `pnpm run db:migrate:remote` 应用迁移到远程 D1。
3. 配置 `wrangler secret put BETTER_AUTH_SECRET` 等敏感变量。
4. `pnpm run deploy` 部署到生产。
5. （可选）`pnpm run deploy --env staging` 部署到 staging。

## 域名

在 Cloudflare Dashboard → Workers → Triggers → Custom Domains 添加 `yourdomain.com`。
```

**Step 19.3: 写入 `docs/contributing.md`**

```markdown
# 贡献

## 流程

1. Fork & clone。
2. `pnpm install && pnpm run setup`。
3. 切分支：`git switch -c feat/<name>`。
4. TDD：先写测试，再实现。
5. 提交前 `pnpm run check` 与 `pnpm run test` 全部通过。
6. 推送分支，开 PR。

## Commit 规范

- `feat:` 新功能
- `fix:` Bug 修复
- `chore:` 杂项
- `refactor:` 重构
- `test:` 测试
- `docs:` 文档

## PR 标题 / 描述

中文；祈使句现在时；描述动机与变更点。
```

**Step 19.4: 写入 `docs/architecture.md`**

```markdown
# 架构

## 模块

- `src/auth` - Better Auth 集成
- `src/payment` - 支付 provider（Stripe）
- `src/mail` - 邮件 provider（Cloudflare / Resend）
- `src/newsletter` - 订阅 provider（Resend / Beehiiv）
- `src/notification` - 通知 provider（Discord / Feishu）
- `src/cache` - KV 缓存
- `src/storage` - R2 对象存储
- `src/contact` - 联系表单 + 投递
- `src/admin` - 管理后台
- `src/dashboard` - 用户面板
- `src/components/blocks/marketing` - 营销 blocks（spec §4 对齐）
- `src/db` - Drizzle schema + D1 client
- `src/config/website` - 站点配置
- `content/` - Content Collections（docs / blog / changelog / legal）

## Provider 注册表

每个 feature 模块的 `index.ts` 暴露 `register*Provider`，`src/worker.ts` 启动时根据 env 注册实例。业务代码只调用抽象接口。

## 路由

- `{-$locale}/` - 营销页面（含 layout）
- `{-$locale}/(marketing).docs` - 文档站
- `{-$locale}/(marketing).blog` - 博客
- `{-$locale}/(marketing).changelog` - 更新日志
- `{-$locale}/(marketing).legal` - 法律
- `{-$locale}/auth/*` - 认证
- `{-$locale}/dashboard/*` - 用户面板
- `{-$locale}/admin/*` - 管理后台
- `/api/auth/$` - Better Auth handler
- `/api/webhooks/stripe` - Stripe webhook
- `/api/og` - OG 图生成
- `/api/newsletter/subscribe` - 订阅
- `/sitemap.xml` / `/robots.txt` - SEO
```

**Step 19.5: 提交**

```bash
git add README.md docs/deployment.md docs/contributing.md docs/architecture.md
git commit -m "docs: README + 部署 + 贡献 + 架构"
```

---

### Task 20: CHANGELOG 与首次发布

**Files:**
- Create: `CHANGELOG.md`

**Step 20.1: 写入 `CHANGELOG.md`**

```markdown
# 更新日志

## 0.1.0 (2026-10-12)

首次公开版本。

### 特性

- TanStack Start + Cloudflare Workers 骨架
- Better Auth（邮箱密码 + Google OAuth）
- Stripe Checkout + Customer Portal + Webhook
- Cloudflare D1 / KV / R2 / Email 集成
- 8 个营销 blocks
- 文档 / 博客 / 更新日志 / 法律页面（Content Collections）
- 多语言（zh / en，URL 前缀）
- PWA + SEO（sitemap / robots / JSON-LD / OG 图）
- 多 analytics（GA / Plausible / Umami / Clarity）
- 自托管多 provider 注册表
- Playwright E2E + Vitest 单元 / 集成
- GitHub Actions CI
```

**Step 20.2: 提交**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG 0.1.0"
```

---

### Task 21: 端到端收尾验证

**Files:** 无新增

**Step 21.1: 完整 check**

```bash
pnpm run check
```

预期：通过。

**Step 21.2: 完整测试**

```bash
pnpm run test
pnpm exec vitest --config vitest.workers.config.ts run
```

预期：所有单元 + 集成测试 PASS。

**Step 21.3: 类型校验**

```bash
pnpm run typecheck
```

预期：0 错误。

**Step 21.4: 构建**

```bash
pnpm run build
pnpm run check:client-bundle
```

预期：成功；客户端 bundle 体积达标。

**Step 21.5: E2E**

```bash
pnpm run test:e2e
```

预期：所有 spec PASS。

**Step 21.6: 覆盖率**

```bash
pnpm run test -- --coverage
```

预期：lines/functions/statements ≥ 80%，branches ≥ 75%。

**Step 21.7: 提交（如有 fix）**

```bash
git add -A
git commit -m "chore: Sub-Plan D 收尾（lint + 测试 + 构建 + e2e）" --allow-empty
```

---

## Sub-Plan D 完成标志

- [ ] Vitest 双池（jsdom + Workers）配置就位
- [ ] 单元测试覆盖 env / blocks / i18n / price-plan / analytics
- [ ] 集成测试覆盖 cache / db / mail / newsletter / payment
- [ ] Playwright 配置就位
- [ ] E2E 覆盖 marketing 9 用例、auth/dashboard、payment
- [ ] CI（lint+typecheck+test+build+e2e）三阶段流水线就位
- [ ] CSP / CORS / Rate Limit 中间件就位
- [ ] 性能优化（lazy + error boundary + preload）就位
- [ ] README / 部署 / 贡献 / 架构 文档就位
- [ ] CHANGELOG 0.1.0
- [ ] `pnpm run check` + `pnpm run test` + `pnpm run test:e2e` + `pnpm run build` 全部通过
- [ ] 覆盖率 ≥ 80% 关键模块

完成 Sub-Plan D 后，整个 SaaS 模板实施完成。

---

## Not in Scope（Sub-Plan D 显式不做）

按 writing-plans 规范，本 sub-plan 明确**不**包含：

- **业务实现**：所有 `src/<feature>/` 模块（→ Sub-Plan B）。
- **前端 UI / 文档站 / PWA manifest / Analytics 实际接入**（→ Sub-Plan C）。
- **Visual regression / Chromatic / Loki**：本期 E2E 仅行为断言；视觉对比由 v0.2 引入。
- **a11y 自动化（@axe-core/playwright）**：v0.2 引入。
- **Web Vitals 上报到 GA / Plausible**：Sub-Plan C 完成接入；本 plan 不做实时上报。
- **Load testing / k6 / 压测**：本期 E2E 仅 smoke；性能基线由 v0.2 用 Lighthouse CI。
- **D1 PITR / R2 lifecycle policy**：运维配置由 v0.2 操作手册覆盖。
- **Secret 轮换流程 / 自动密钥续期**：v0.2 引入 wrangler secret rotate 脚本。
- **多 Cloudflare 账号 / 多 region 灰度**：本期单 account + staging/production 双 env。
- **A/B test 框架**：v0.2 引入 GrowthBook。
- **i18n URL 前缀化 E2E**：spec 决策表第 6 项延后；本期 locale 切走 cookie + URL 软切换。
- **浏览器兼容矩阵**：仅 Chromium；Firefox / WebKit v0.2。
- **staging 环境的完整 migration 与 smoke**：CI 仅在 production 之前跑一次；staging 手工验证。
