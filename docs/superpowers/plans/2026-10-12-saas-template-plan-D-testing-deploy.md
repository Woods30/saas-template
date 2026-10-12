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
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    projects: ['./vitest.workers.config.ts'],
  },
});
```

> 注意：Vitest 4.x 起 `workspace` 顶层字段已 deprecated；多配置用根 `vitest.config.ts` 的 `test.projects` 数组。`vitest.workers.config.ts` 通过相对路径被引用。

> 备选：保留 `vitest.workspace.ts` 但使用 `vitest.config.ts` 显式 `test.projects` 加载。CI 跑 `pnpm test` 时只命中根 config，集成池通过 `pnpm test:workers` 单独跑。

**Step 1.3: 扩展根 `vitest.config.ts`（unit + component）**

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
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

### Task 2: 单元测试 - env

**Files:**
- Create: `tests/unit/env.test.ts`

**Step 2.1: 测试用例**

```ts
import { describe, expect, it } from 'vitest';
import { parsePublicEnv, publicEnvSchema } from '@/env/public';
import { parseServerEnv } from '@/env/server';

describe('publicEnv', () => {
  it('默认 base url 合法', () => {
    const result = parsePublicEnv({});
    expect(result.VITE_BASE_URL).toMatch(/^https?:\/\//);
  });

  it('payment provider 可选', () => {
    const result = parsePublicEnv({ VITE_PAYMENT_PROVIDER: 'stripe' });
    expect(result.VITE_PAYMENT_PROVIDER).toBe('stripe');
  });

  it('非法 payment provider 抛错', () => {
    expect(() => parsePublicEnv({ VITE_PAYMENT_PROVIDER: 'invalid' as never })).toThrow();
  });
});

describe('serverEnv', () => {
  it('缺失 BETTER_AUTH_SECRET 在生产抛错', () => {
    expect(() => parseServerEnv({ NODE_ENV: 'production', BETTER_AUTH_SECRET: '' })).toThrow();
  });

  it('dev 模式允许空 secret', () => {
    const result = parseServerEnv({ NODE_ENV: 'development', BETTER_AUTH_SECRET: 'dev-secret' });
    expect(result.NODE_ENV).toBe('development');
  });

  it('Zod schema 拒绝未知字段', () => {
    expect(publicEnvSchema.safeParse({ VITE_UNKNOWN: 'x' }).success).toBe(true); // unknown fields ignored
  });
});
```

**Step 2.2: 运行**

```bash
pnpm exec vitest run tests/unit/env.test.ts
```

预期：全部 PASS。

**Step 2.3: 提交**

```bash
git add tests/unit/env.test.ts
git commit -m "test(env): 双层 env 解析单元测试"
```

---

### Task 3: 单元测试 - blocks

**Files:**
- Create: `tests/unit/blocks-render.test.tsx`
- Create: `tests/unit/test-utils.tsx`

**Step 3.1: 写入 `tests/unit/test-utils.tsx`**

```tsx
import { render, type RenderOptions } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ReactElement } from 'react';

/**
 * Block 测试用最小 router；不依赖 TanStack Router（避免整套 routeTree.gen 编译）。
 * blocks 是 props-driven 纯展示组件，路由上下文只用 `useLocation` / `useNavigate`
 * 的回退实现足够。
 */
export function renderWithRouter(ui: ReactElement, options?: RenderOptions) {
  const router = createMemoryRouter([{ path: '*', element: ui }]);
  return render(<RouterProvider router={router} />, options);
}

export function renderBlock(ui: ReactElement) {
  return render(ui);
}
```

> 注意：原 plan 写 `react-router-dom@^7`（React Router 的），与项目用的 TanStack Router 是两套独立库；选 `react-router-dom@^7` 作为 **测试工具** 隔离，业务代码仍用 `@tanstack/react-router`。

**Step 3.2: 写入 `tests/unit/blocks-render.test.tsx`**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero, Features, Stats, Faq, Testimonials, NewsletterCta, Cta, Pricing } from '@/components/blocks/marketing';

// blocks 是 props-driven 纯展示，不需要 router context。
// Pricing block 的 `renderCta` 用 React Fragment 模拟。
describe('Hero block', () => {
  it('渲染标题与 CTA', () => {
    render(
      <Hero
        title="Hello"
        primaryCta={{ label: 'Go', href: '/dashboard' }}
        secondaryCta={{ label: 'More', href: '/pricing' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('Go')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });
});

describe('Features block', () => {
  it('渲染所有 item', () => {
    render(
      <Features
        title="Features"
        items={[
          { title: 'A', description: 'a' },
          { title: 'B', description: 'b' },
        ]}
      />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});

describe('Stats block', () => {
  it('渲染数值与标签', () => {
    render(<Stats items={[{ value: '10', label: 'users' }]} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('users')).toBeInTheDocument();
  });
});

describe('Faq block', () => {
  it('渲染问题与答案', () => {
    render(<Faq items={[{ question: 'Q?', answer: 'A.' }]} />);
    expect(screen.getByText('Q?')).toBeInTheDocument();
    expect(screen.getByText('A.')).toBeInTheDocument();
  });
});

describe('Testimonials block', () => {
  it('渲染引用与作者', () => {
    render(<Testimonials items={[{ quote: 'great', author: 'Alice' }]} />);
    expect(screen.getByText(/great/)).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });
});

describe('NewsletterCta block', () => {
  it('渲染输入框与按钮', () => {
    render(<NewsletterCta title="Subscribe" endpoint="resend" />);
    expect(screen.getByRole('heading', { name: 'Subscribe' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
  });
});

describe('Cta block', () => {
  it('渲染标题与按钮', () => {
    render(<Cta title="Go" primaryCta={{ label: 'Click', href: '/x' }} />);
    expect(screen.getByRole('heading', { name: 'Go' })).toBeInTheDocument();
    expect(screen.getByText('Click')).toBeInTheDocument();
  });
});

describe('Pricing block', () => {
  it('渲染所有 plan 与 feature', () => {
    render(
      <Pricing
        plans={[
          { id: 'free', name: 'Free', prices: [], features: ['A'], cta: { label: '免费', href: '/signup' } },
          { id: 'pro', name: 'Pro', prices: [{ amount: 990, currency: 'USD', interval: 'month' }], features: ['B', 'C'], cta: { label: '订阅', href: '/checkout' }, highlighted: true, badge: '推荐' },
        ]}
      />,
    );
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('推荐')).toBeInTheDocument();
  });
});
```

**Step 3.3: 运行**

```bash
pnpm exec vitest run tests/unit/blocks-render.test.tsx
```

预期：7/7 PASS。

**Step 3.4: 提交**

```bash
git add tests/unit/blocks-render.test.tsx tests/unit/test-utils.tsx package.json
git commit -m "test(blocks): 7 个 blocks 渲染测试"
```

---

### Task 4: 单元测试 - i18n

**Files:**
- Create: `tests/unit/i18n.test.ts`

**Step 4.1: 测试用例**

```ts
import { describe, expect, it } from 'vitest';
import { parseLocale, isSupportedLocale, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/lib/locale';
import { getAlternateLinks } from '@/lib/i18n';

describe('locale', () => {
  it('默认 zh', () => {
    expect(DEFAULT_LOCALE).toBe('zh');
  });

  it('支持 zh / en', () => {
    expect(SUPPORTED_LOCALES).toEqual(['zh', 'en']);
  });

  it('isSupportedLocale 严格判定', () => {
    expect(isSupportedLocale('zh')).toBe(true);
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });

  it('parseLocale 兜底为默认', () => {
    expect(parseLocale('fr')).toBe('zh');
    expect(parseLocale(undefined)).toBe('zh');
  });
});

describe('getAlternateLinks', () => {
  it('为所有 locale 生成链接', () => {
    const links = getAlternateLinks('/pricing');
    expect(links).toEqual([
      { hrefLang: 'zh', href: '/zh/pricing' },
      { hrefLang: 'en', href: '/en/pricing' },
    ]);
  });
});
```

**Step 4.2: 运行**

```bash
pnpm exec vitest run tests/unit/i18n.test.ts
```

**Step 4.3: 提交**

```bash
git add tests/unit/i18n.test.ts
git commit -m "test(i18n): locale 解析与 alternate 链接"
```

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

### Task 7: 集成测试 - cache

**Files:**
- Create: `tests/workers/cache.test.ts`

**Step 7.1: 测试用例**

```ts
import { describe, expect, it } from 'vitest';
import { applyD1Migrations } from '@cloudflare/vitest-pool-workers';
import { initCache, KVCacheProvider, getOrSetCache, createCacheKey } from '@/cache';
import { env } from 'cloudflare:test';

describe('KV cache', () => {
  it('set + get', async () => {
    initCache(new KVCacheProvider(env.CACHE));
    await getOrSetCache({ key: createCacheKey('test', 1), ttlSeconds: 60, fetcher: async () => 'hi' });
    const result = await getOrSetCache({ key: createCacheKey('test', 1), ttlSeconds: 60, fetcher: async () => 'changed' });
    expect(result).toBe('hi');
  });

  it('delete', async () => {
    initCache(new KVCacheProvider(env.CACHE));
    const key = createCacheKey('test', 'delete');
    await getOrSetCache({ key, ttlSeconds: 60, fetcher: async () => ({ x: 1 }) });
    await env.CACHE.delete(key);
    const fresh = await getOrSetCache({ key, ttlSeconds: 60, fetcher: async () => ({ x: 2 }) });
    expect(fresh).toEqual({ x: 2 });
  });
});
```

**Step 7.2: 运行**

```bash
pnpm exec vitest --config vitest.workers.config.ts run tests/workers/cache.test.ts
```

预期：PASS。

**Step 7.3: 提交**

```bash
git add tests/workers/cache.test.ts
git commit -m "test(cache): Workers pool 集成"
```

---

### Task 8: 集成测试 - db

**Files:**
- Create: `tests/workers/db.test.ts`

**Step 8.1: 测试用例**

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { applyD1Migrations } from '@cloudflare/vitest-pool-workers';
import { env } from 'cloudflare:test';
import { createDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

describe('D1 schema', () => {
  beforeAll(async () => {
    // 简易 migrate：先建表。生产用 applyD1Migrations(env.DB, migrations)
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0,
        name TEXT,
        image TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        banned INTEGER DEFAULT 0,
        ban_reason TEXT,
        ban_expires INTEGER,
        deleted_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
  });

  it('insert + select users', async () => {
    const db = createDb(env.DB);
    await db.insert(schema.users).values({ id: 'u1', email: 'a@example.com' });
    const users = await db.select().from(schema.users).where(eq(schema.users.email, 'a@example.com'));
    expect(users.length).toBe(1);
    expect(users[0].id).toBe('u1');
  });
});
```

**Step 8.2: 运行**

```bash
pnpm exec vitest --config vitest.workers.config.ts run tests/workers/db.test.ts
```

**Step 8.3: 提交**

```bash
git add tests/workers/db.test.ts
git commit -m "test(db): D1 schema 集成"
```

---

### Task 9: 集成测试 - mail

**Files:**
- Create: `tests/workers/mail.test.ts`

**Step 9.1: 测试用例**

```ts
import { describe, expect, it, vi } from 'vitest';
import { CloudflareEmailProvider } from '@/mail/provider/cloudflare';
import { renderTemplate } from '@/mail/render';

describe('mail templates', () => {
  it('render verifyEmail 返回 subject + html', async () => {
    const { subject, html } = await renderTemplate({
      to: 'a@example.com',
      template: 'verifyEmail',
      locale: 'zh',
      context: { username: 'A', actionUrl: 'https://example.com/verify' },
    });
    expect(subject).toBe('验证你的邮箱');
    expect(html).toContain('验证邮箱');
  });

  it('render forgotPassword 英文', async () => {
    const { subject } = await renderTemplate({
      to: 'a@example.com',
      template: 'forgotPassword',
      locale: 'en',
      context: { username: 'A', actionUrl: 'https://example.com/reset' },
    });
    expect(subject).toBe('Reset your password');
  });
});

describe('CloudflareEmailProvider', () => {
  it('API 失败返回 ok=false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('error') });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new CloudflareEmailProvider('acc', 'tok', 'sender@example.com');
    const result = await provider.sendTemplate({
      to: 'a@example.com',
      template: 'verifyEmail',
      locale: 'zh',
      context: { username: 'A', actionUrl: 'https://x' },
    });
    expect(result.ok).toBe(false);
  });
});
```

**Step 9.2: 运行**

```bash
pnpm exec vitest run tests/workers/mail.test.ts
```

**Step 9.3: 提交**

```bash
git add tests/workers/mail.test.ts
git commit -m "test(mail): 模板渲染 + Cloudflare provider 失败分支"
```

---

### Task 10: 集成测试 - newsletter

**Files:**
- Create: `tests/workers/newsletter.test.ts`

**Step 10.1: 测试用例**

```ts
import { describe, expect, it, vi } from 'vitest';
import { ResendNewsletterProvider } from '@/newsletter/provider/resend';

describe('ResendNewsletterProvider', () => {
  it('subscribe 成功返回 true', async () => {
    const createMock = vi.fn().mockResolvedValue({ data: { id: 'contact_1' }, error: null });
    const resend = { contacts: { create: createMock } };
    vi.stubGlobal('Resend', function () { return resend; });
    const provider = new ResendNewsletterProvider('key', 'audience');
    const result = await provider.subscribe({ email: 'a@example.com' });
    expect(result).toBe(true);
  });
});
```

**Step 10.2: 运行**

```bash
pnpm exec vitest run tests/workers/newsletter.test.ts
```

**Step 10.3: 提交**

```bash
git add tests/workers/newsletter.test.ts
git commit -m "test(newsletter): Resend 成功分支"
```

---

### Task 11: 集成测试 - payment（webhook 验签 + 路由）

**Files:**
- Create: `tests/workers/payment.test.ts`

**Step 11.1: 注入 stripe 事件 fixture + 真实签名**

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { StripePaymentProvider } from '@/payment/provider/stripe';
import Stripe from 'stripe';

const SECRET = 'whsec_test_secret_for_unit';

async function signPayload(payload: string): Promise<string> {
  // 用 Stripe 自身的 SDK 在测试中签名，避免手算 HMAC 飘移
  const stripe = new Stripe('sk_test_dummy', { apiVersion: '2025-09-30.clover' as Stripe.LatestApiVersion });
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: SECRET,
    timestamp: Math.floor(Date.now() / 1000),
  });
}

function buildEvent(overrides: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: overrides.id ?? 'evt_test_1',
    object: 'event',
    api_version: '2025-09-30.clover',
    created: Math.floor(Date.now() / 1000),
    type: 'checkout.session.completed',
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: 'cs_test_1',
        object: 'checkout.session',
        customer: 'cus_test',
        subscription: 'sub_test_1',
        metadata: { userId: 'u1' },
      } as Stripe.Checkout.Session,
    },
  } as Stripe.Event;
}

describe('StripePaymentProvider', () => {
  it('verifyWebhook 失败时返回 false（坏签名）', async () => {
    const provider = new StripePaymentProvider('sk_test_dummy', SECRET);
    expect(await provider.verifyWebhook('{}', 'bad-signature')).toBe(false);
  });

  it('parseWebhookEvent 抛错当签名错误', async () => {
    const provider = new StripePaymentProvider('sk_test_dummy', SECRET);
    await expect(provider.parseWebhookEvent('{}', 'bad-signature')).rejects.toThrow();
  });

  it('verifyWebhook 正确签名返回 true', async () => {
    const provider = new StripePaymentProvider('sk_test_dummy', SECRET);
    const payload = JSON.stringify(buildEvent());
    const sig = await signPayload(payload);
    expect(await provider.verifyWebhook(payload, sig)).toBe(true);
  });

  it('parseWebhookEvent 成功解析事件', async () => {
    const provider = new StripePaymentProvider('sk_test_dummy', SECRET);
    const payload = JSON.stringify(buildEvent());
    const sig = await signPayload(payload);
    const event = await provider.parseWebhookEvent(payload, sig);
    expect(event.id).toBe('evt_test_1');
    expect(event.type).toBe('checkout.session.completed');
  });

  it('重投：相同 payload + 新 timestamp 解析两次都成功（幂等性由 webhook_events 表保证）', async () => {
    const provider = new StripePaymentProvider('sk_test_dummy', SECRET);
    const payload = JSON.stringify(buildEvent());
    const sig1 = await signPayload(payload);
    // 模拟 Stripe 重投：更新 timestamp，重新签名
    await new Promise((r) => setTimeout(r, 1100)); // 跨过 1s tolerance 检查
    const sig2 = await signPayload(payload);
    const e1 = await provider.parseWebhookEvent(payload, sig1);
    const e2 = await provider.parseWebhookEvent(payload, sig2);
    expect(e1.id).toBe(e2.id);
  });
});
```

**Step 11.2: 运行**

```bash
pnpm exec vitest run tests/workers/payment.test.ts
```

**Step 11.3: 提交**

```bash
git add tests/workers/payment.test.ts
git commit -m "test(payment): Stripe webhook 验签失败"
```

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

### Task 14: E2E - Auth + Dashboard

**Files:**
- Create: `e2e/auth-flow.spec.ts`
- Create: `e2e/dashboard.spec.ts`

**Step 14.1: 写入 `e2e/auth-flow.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('register → email verification hint → login flow', async ({ page }) => {
  const email = `test-${Date.now()}@example.com`;

  await page.goto('/auth/register');
  await page.fill('input[name="name"]', 'Test User');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  // 期望停留在注册页或跳转到登录；具体以 Better Auth 配置为准
  await expect(page).toHaveURL(/\/(auth|dashboard)/);

  await page.goto('/auth/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
});
```

> 注意：Better Auth 启用 `requireEmailVerification: true` 时，未验证邮箱的登录会被拒；测试可在 dev 模式关闭该开关或使用 `auth:bypass` mock。

**Step 14.2: 写入 `e2e/dashboard.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('unauthenticated /dashboard redirects to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('sidebar contains all expected links', async ({ page }) => {
  // 通过 fixture 注入已登录态
  await page.addInitScript(() => {
    localStorage.setItem('e2e-test-session', 'true');
  });
  await page.goto('/dashboard');
  await expect(page.getByText('总览')).toBeVisible();
  await expect(page.getByText('订阅')).toBeVisible();
  await expect(page.getByText('文件')).toBeVisible();
});
```

> 实际认证 fixture 需配合 Better Auth cookie / session mock；本 task 给出骨架，
> 真实登录走 E2E fixture（见 Task 15）。

**Step 14.3: 运行**

```bash
pnpm exec playwright test e2e/auth-flow.spec.ts e2e/dashboard.spec.ts
```

**Step 14.4: 提交**

```bash
git add e2e/auth-flow.spec.ts e2e/dashboard.spec.ts
git commit -m "test(e2e): 注册/登录/未授权重定向"
```

---

### Task 15: E2E - Stripe Checkout 流

**Files:**
- Create: `e2e/payment.spec.ts`
- Create: `e2e/fixtures/auth.ts`

**Step 15.1: 写入 `e2e/fixtures/auth.ts`**

```ts
import { test as base, type Page, expect } from '@playwright/test';

/**
 * E2E 已登录 fixture — 真正创建 Better Auth session cookie。
 *
 * 流程：
 * 1. 调用 dev-only `/api/test/session`：在 D1 users + sessions 两张表插入行，
 *    返回 session token。
 * 2. 用 token + userId 在浏览器 context 中设置 Better Auth 默认 cookie
 *    `better-auth.session_token`。
 * 3. 后续 page.goto 即视为已登录。
 */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page, baseURL }, use) => {
    const res = await page.request.post('/api/test/session', { data: { email: `e2e-${Date.now()}@example.com` } });
    expect(res.ok()).toBeTruthy();
    const { sessionToken, userId } = (await res.json()) as { sessionToken: string; userId: string };
    const host = new URL(baseURL ?? 'http://localhost:3000').host;
    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: sessionToken,
        domain: host,
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await use(page);
  },
});
```

**Step 15.2: 创建 dev-only session 路由（写 users + sessions）**

Create: `src/routes/api/test/session.ts`

```ts
import { createFileRoute } from '@tanstack/react-router';
import { getAuth } from '@/auth/auth';

export const Route = createFileRoute('/api/test/session')({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        // 仅在非生产暴露
        if (context.cloudflare.env.NODE_ENV === 'production') {
          return new Response('forbidden', { status: 403 });
        }
        const env = context.cloudflare.env as Env;
        const auth = getAuth(env);
        const { email } = (await request.json()) as { email: string };

        // 1. 通过 Better Auth admin API 找/建 user
        // 2. 创建 session（30 天有效期）
        const newUser = await auth.api.signUpEmail({
          body: { email, password: 'e2e-test-password', name: 'E2E' },
          asResponse: false,
        });
        const session = await auth.api.createSession({ body: { userId: newUser.user.id } });
        return Response.json({
          sessionToken: session.token,
          userId: newUser.user.id,
        });
      },
    },
  },
});
```

> 关键修正：原 plan 只 `db.insert(users)` 不创建 session，导致后续 `authClient.getSession()` 拿不到登录态；dashboard / 任何受保护路由都会 302 到 `/auth/login`。新写法走 Better Auth 自己的 `signUpEmail` + `createSession`，确保 cookie 校验通过。

**Step 15.3: 写入 `e2e/payment.spec.ts`**

```ts
import { test, expect } from './fixtures/auth';

test('start checkout for pro plan', async ({ authedPage }) => {
  await authedPage.goto('/pricing');
  const subscribeBtn = authedPage.getByRole('button', { name: '订阅' }).first();
  await subscribeBtn.click();

  // 真实断言：必须跳到 stripe.com（或子域）
  // 不再吞错；任何 catch 都是测试失败。
  await authedPage.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 20_000 });
  expect(authedPage.url()).toMatch(/^https:\/\/checkout\.stripe\.com\//);
});
```

> 修正：移除 `waitForURL(...).catch(() => {})` 吞错，移除 `| pricing` 这种 OR 兜底 — 当 Stripe key 缺失 / env 未配置时，测试必须 fail，让 CI 暴露问题。

**Step 14.4: 运行**

```bash
pnpm exec playwright test e2e/payment.spec.ts
```

**Step 14.5: 提交**

```bash
git add e2e/payment.spec.ts e2e/fixtures/auth.ts src/routes/api/test/login.ts
git commit -m "test(e2e): Stripe checkout 触发流"
```

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
