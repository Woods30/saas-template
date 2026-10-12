# Sub-Plan A：基础设施 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 TanStack Start + Cloudflare Workers + Drizzle + Biome + i18n + 基础 UI 的项目骨架，使得 `pnpm dev` 可以启动空首页，`pnpm build` 与 `pnpm deploy` 通过本地校验。

**Architecture:** 单仓单包。Vite 驱动 TanStack Start 构建；Cloudflare `@cloudflare/vite-plugin` 把 server bundle 打成 Worker；Drizzle 编译期 schema + wrangler 注入的 D1 binding；Paraglide JS 做编译期 i18n 树摇；Biome 统一 lint/format；shadcn/ui CLI 生成 UI 组件；env 通过 Zod 在 `src/env/` 校验后导出，**禁止**业务代码直接读 `process.env`。

**Tech Stack:** TanStack Start, Vite, Cloudflare Workers, D1, Drizzle ORM, Better Auth（占位配置，不在本 sub-plan 实现具体页面），Biome, Tailwind CSS v4, shadcn/ui, Base UI, Paraglide JS (Inlang), TypeScript strict, pnpm, Vitest, Playwright.

## Global Constraints

- 包管理：**pnpm**。任何命令前缀使用 `pnpm run <script>` 或 `pnpm <cmd>`。
- TypeScript：**strict**，`tsconfig.json` 启用 `strict: true`、`noUncheckedIndexedAccess: true`。
- Node：≥ 22.12.0（`vitest@5` 排除 Node 20，`wrangler` 要求 ≥22，`@tanstack/react-start` 要求 ≥22.12.0；`engine-strict=true` 下低于此值安装失败）。
- 所有依赖版本以**最新稳定版**为准。生成代码前通过 context7 拉取精确版本；如不可达，使用 npm registry 兜底。
- Lint/Format：**Biome**（仅 Biome；不引入 ESLint / Prettier）。
- CSS：Tailwind v4，CSS-first config；shadcn/ui CLI 自动生成组件。
- i18n：**Paraglide JS (Inlang)**，`project.inlang/settings.json` 的 `baseLocale: 'zh'`，`locales: ['zh', 'en']`。
- 文档语言：项目内文档（README、docs、ADR、注释）**默认中文**；中文与半角英数字间一个半角空格；技术术语保留英文。
- 文件命名：kebab-case 用于目录与配置文件；React 组件 PascalCase；server functions camelCase。
- 提交纪律：每个 task 末尾独立 commit，类型 `feat:` / `chore:` / `test:` / `docs:` / `fix:`；单一逻辑工作单元。
- 严禁：业务代码直接读 `process.env` / `import.meta.env`；必须从 `src/env/{public,server}.ts` 导入。

---

## 文件结构总览（Sub-Plan A 范围）

```
saas-template/
├── AGENTS.md                                   # 已存在
├── CLAUDE.md                                   # 已存在
├── README.md                                   # 新建（中文）
├── CONTRIBUTING.md                             # 新建（中文）
├── LICENSE                                     # 新建（MIT）
├── .editorconfig                               # 新建
├── biome.json                                  # 新建
├── content-collections.ts                      # 占位（Sub-Plan C 详细化）
├── drizzle.config.ts                            # 占位（Sub-Plan B 详细化）
├── drizzle.config.local.ts                     # 占位
├── vitest.config.ts                            # 新建
├── playwright.config.ts                        # 占位（Sub-Plan D 详细化）
├── playwright.production.config.ts             # 占位
├── vite.config.ts                              # 新建
├── tsconfig.json                               # 新建
├── package.json                                # 新建
├── pnpm-workspace.yaml                         # 不存在（单包）
├── wrangler.jsonc                              # 新建
├── .env.example                                # 新建（中文注释）
├── .gitignore                                  # 新建
├── public/
│   └── manifest.json                           # 占位（Sub-Plan C）
├── messages/                                   # 新建（Paraglide 消息源）
│   ├── zh.json
│   └── en.json
├── project.inlang/                             # 新建
│   ├── settings.json
│   └── paraglide.config.ts
├── src/
│   ├── env/                                    # 新建
│   │   ├── public.ts
│   │   └── server.ts
│   ├── lib/                                    # 新建（占位文件）
│   │   ├── utils.ts
│   │   ├── locale.ts
│   │   └── seo.ts
│   ├── locale/                                 # 新建
│   │   ├── middleware.ts
│   │   └── paraglide/                          # .gitignore
│   ├── components/
│   │   ├── ui/                                 # shadcn 生成（占位）
│   │   └── layout/
│   │       └── LocaleSwitcher.tsx              # 占位
│   ├── config/
│   │   ├── website.ts                          # 最小骨架（Sub-Plan B/C 扩展）
│   │   └── blocks.ts                           # 占位
│   ├── routes/
│   │   ├── __root.tsx
│   │   └── index.tsx                           # 最小 hello
│   └── styles/
│       └── globals.css
├── tests/
│   └── unit/
│       └── env.test.ts                         # env 校验测试
└── scripts/
    └── check-client-bundle.ts                  # 占位（Sub-Plan D）
```

---

### Task 1: 初始化 package.json 与 pnpm

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.npmrc`

**Step 1.1: 写入 `.gitignore`**

```gitignore
node_modules
.output
.wrangler
dist
.content-collections
src/locale/paraglide
*.log
.env
.env.local
.DS_Store
```

**Step 1.2: 写入 `.npmrc`**

```
auto-install-peers=true
shamefully-hoist=false
engine-strict=true
```

**Step 1.3: 写入 `package.json`（占位，下一 task 填充依赖）**

```json
{
  "name": "saas-template",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {}
}
```

**Step 1.4: 启用 pnpm（若尚未启用）**

运行：`corepack enable && corepack prepare pnpm@latest --activate`
预期：`pnpm --version` 输出 ≥ 9。

**Step 1.5: Commit**

```bash
git add .gitignore .npmrc package.json
git commit -m "chore: 初始化 pnpm 与 gitignore"
```

---

### Task 2: TypeScript strict 配置

**Files:**
- Create: `tsconfig.json`

**Step 2.1: 写入 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": false,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"],
      "content-collections": ["./.content-collections/generated"]
    },
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts", "scripts"],
  "exclude": ["node_modules", "dist", ".wrangler", ".content-collections"]
}
```

> **注意**：TypeScript 7 已**移除** `baseUrl`，保留会报 `TS5102`。`paths` 自 TS 4.4 起相对
> `tsconfig.json` 解析，无需 `baseUrl`。`types` 需含 `node`（脚本使用 `node:fs` 等），`include` 需含
> `vitest.config.ts`。

**Step 2.2: Commit**

```bash
git add tsconfig.json
git commit -m "chore: 启用 TypeScript strict + path alias"
```

---

### Task 3: Biome 配置

**Files:**
- Create: `biome.json`

**Step 3.1: 写入 `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": [
      "**",
      "!**/node_modules",
      "!**/dist",
      "!**/.wrangler",
      "!**/.content-collections",
      "!**/src/locale/paraglide",
      "!**/pnpm-lock.yaml",
      "!**/routeTree.gen.ts"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded",
      "trailingCommas": "all"
    }
  },
  "css": {
    "parser": { "tailwindDirectives": true }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "style": {
        "useImportType": "warn",
        "useNamingConvention": "off"
      }
    }
  }
}
```

> **Biome 2.x 与 1.x 的差异**：`files.ignore` 已移除，改为 `files.includes` 并用 `!` 前缀表示否定；
> linter 预设由 `"recommended": true` 改为 `"preset": "recommended"`。`css.parser.tailwindDirectives`
> 必须开启，否则 Biome 在 `globals.css` 的 `@theme` 处报 parse 错误。

**Step 3.2: 安装 Biome（待 Task 6 安装所有 dev 依赖）**

暂不执行；占位标记。

**Step 3.3: 写入 `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

**Step 3.4: Commit**

```bash
git add biome.json .editorconfig
git commit -m "chore: 配置 Biome + EditorConfig"
```

---

### Task 4: env 两层模型 + Vitest 单元测试

**Files:**
- Create: `src/env/public.ts`
- Create: `src/env/server.ts`
- Create: `tests/unit/env.test.ts`
- Create: `vitest.config.ts`

**Step 4.1: 安装 Vitest 依赖（Task 6 统一安装，本 task 先写测试）**

写入占位标记；依赖安装推迟到 Task 6。

**Step 4.2: 写入 `vitest.config.ts`**

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
  },
});
```

> **注意**：`package.json` 为 `"type": "module"`，ESM 下 `__dirname` 不存在（会抛 `ReferenceError`），
> 必须改用 `fileURLToPath(new URL(...))`。

**Step 4.3: 写入 `src/env/public.ts`**

```ts
import { z } from 'zod';

const schema = z.object({
  VITE_BASE_URL: z.url().default('http://localhost:3000'),
  VITE_PAYMENT_PROVIDER: z.enum(['stripe']).optional(),
  VITE_STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  VITE_STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  VITE_STRIPE_PRICE_LIFETIME: z.string().optional(),
  VITE_GA_ID: z.string().optional(),
  VITE_PLAUSIBLE_DOMAIN: z.string().optional(),
  VITE_UMAMI_ID: z.string().optional(),
  VITE_CLARITY_ID: z.string().optional(),
  VITE_TURNSTILE_SITE_KEY: z.string().optional(),
});

export type PublicEnv = z.infer<typeof schema>;

export function parsePublicEnv(raw: unknown): PublicEnv {
  return schema.parse(raw);
}
```

**Step 4.4: 写入 `src/env/server.ts`**

```ts
import { z } from 'zod';

const schema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET 必须 ≥ 32 字符').optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_EMAIL_SENDER: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_AUDIENCE_ID: z.string().optional(),
  BEEHIIV_API_KEY: z.string().optional(),
  BEEHIIV_PUBLICATION_ID: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.url().optional(),
  FEISHU_WEBHOOK_URL: z.url().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type ServerEnv = z.infer<typeof schema>;

export function parseServerEnv(raw: unknown): ServerEnv {
  return schema.parse(raw);
}

export function validateProdServerEnv(raw: unknown): ServerEnv {
  const env = schema.parse(raw);
  if (env.NODE_ENV === 'production') {
    if (!env.BETTER_AUTH_SECRET) {
      throw new Error('生产环境必须设置 BETTER_AUTH_SECRET');
    }
  }
  return env;
}
```

**Step 4.5: 写入 `tests/unit/env.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { parsePublicEnv, parseServerEnv, validateProdServerEnv } from '@/env/public';

describe('parsePublicEnv', () => {
  it('使用默认 VITE_BASE_URL', () => {
    const env = parsePublicEnv({});
    expect(env.VITE_BASE_URL).toBe('http://localhost:3000');
  });

  it('拒绝非法 VITE_BASE_URL', () => {
    expect(() => parsePublicEnv({ VITE_BASE_URL: 'not-a-url' })).toThrow();
  });

  it('仅接受 stripe 作为支付 provider', () => {
    expect(() => parsePublicEnv({ VITE_PAYMENT_PROVIDER: 'creem' })).toThrow();
  });
});

describe('parseServerEnv', () => {
  it('生产模式拒绝缺失 BETTER_AUTH_SECRET', () => {
    expect(() =>
      validateProdServerEnv({ NODE_ENV: 'production' }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('开发模式允许缺失 BETTER_AUTH_SECRET', () => {
    const env = validateProdServerEnv({ NODE_ENV: 'development' });
    expect(env.NODE_ENV).toBe('development');
  });

  it('生产模式接受 ≥32 字符的 BETTER_AUTH_SECRET', () => {
    const env = validateProdServerEnv({
      NODE_ENV: 'production',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
    });
    expect(env.BETTER_AUTH_SECRET).toHaveLength(32);
  });
});
```

> 注：上方 `import` 路径是占位示意，Task 6 实际安装 Vitest 后应改为：

```ts
import { describe, expect, it } from 'vitest';
import { parsePublicEnv } from '@/env/public';
import { parseServerEnv, validateProdServerEnv } from '@/env/server';
```

**Step 4.6: Commit（仅源码）**

```bash
git add src/env tests/unit vitest.config.ts
git commit -m "feat(env): 引入 publicEnv/serverEnv 两层 Zod 校验"
```

---

### Task 5: 拼装 package.json 的 scripts 与依赖占位

**Files:**
- Modify: `package.json`

**Step 5.1: 完整 `package.json`（先写依赖，运行 Task 6 后会校验）**

```json
{
  "name": "saas-template",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "vite dev --port 3000",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "pnpm run check:env:prod && pnpm run build && pnpm run check:client-bundle && wrangler deploy",
    "check": "pnpm run locale:compile && biome check . && tsc --noEmit && pnpm run check:env && pnpm run locale:check",
    "check:env": "tsx scripts/check-env.ts",
    "check:env:prod": "tsx scripts/check-env-prod.ts",
    "check:client-bundle": "tsx scripts/check-client-bundle.ts",
    "check:locale": "pnpm run locale:compile && pnpm run locale:check",
    "locale:check": "tsx scripts/check-locale.ts",
    "locale:compile": "paraglide-js compile --project ./project.inlang",
    "locale:sort": "tsx scripts/locale-sort.ts",
    "typecheck": "pnpm run locale:compile && tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "format": "biome format --write .",
    "lint": "biome lint .",
    "lint:fix": "biome check --write ."
  },
  "dependencies": {
    "@tanstack/react-router": "TBD-locked",
    "@tanstack/react-start": "TBD-locked",
    "@tanstack/react-query": "TBD-locked",
    "react": "TBD-locked",
    "react-dom": "TBD-locked",
    "zod": "TBD-locked"
  },
  "devDependencies": {
    "@biomejs/biome": "TBD-locked",
    "@cloudflare/vite-plugin": "TBD-locked",
    "@inlang/paraglide-js": "TBD-locked",
    "@tailwindcss/vite": "TBD-locked",
    "@types/node": "TBD-locked",
    "@types/react": "TBD-locked",
    "@types/react-dom": "TBD-locked",
    "tailwindcss": "TBD-locked",
    "typescript": "TBD-locked",
    "vite": "TBD-locked",
    "vite-tsconfig-paths": "TBD-locked",
    "vitest": "TBD-locked",
    "tsx": "TBD-locked",
    "wrangler": "TBD-locked"
  }
}
```

**Step 5.2: 暂不安装**（Task 6 统一执行 `pnpm install`）。

**Step 5.3: Commit**

```bash
git add package.json
git commit -m "chore: 草拟 package.json scripts 与依赖占位"
```

---

### Task 6: 安装依赖并锁定精确版本

**Files:**
- Modify: `package.json`（去掉 `"latest"`，替换为精确版本）
- Create: `pnpm-lock.yaml`（自动生成）

**Step 6.1: 解析精确版本**

通过 context7 拉取以下包的最新稳定版本（写 plan 阶段已查询）：
- `@tanstack/react-start`、`@tanstack/react-router`、`@tanstack/react-query`
- `react`、`react-dom`
- `zod`
- `@biomejs/biome`
- `@cloudflare/vite-plugin`
- `@inlang/paraglide-js`
- `typescript`、`vite`、`vitest`、`wrangler`、`tsx`

将 `"latest"` 替换为 registry 实际解析出的版本号。下方为实施时锁定的实际版本（`pnpm view` 核实）：

```json
"@tanstack/react-start": "^1.168.61",
"@tanstack/react-router": "^1.170.42",
"@tanstack/react-query": "^5.104.2",
"react": "^19.3.0",
"react-dom": "^19.3.0",
"zod": "^4.6.6",
"@biomejs/biome": "^2.5.15",
"@cloudflare/vite-plugin": "^1.0.0",
"@inlang/paraglide-js": "^2.27.0",
"typescript": "^7.0.2",
"vite": "^8.3.4",
"vitest": "^5.0.3",
"wrangler": "^4.149.0",
"tsx": "^4.19.0"
```

> **注意**：`zod@4` 中 `z.string().url()` 已弃用，改用 `z.url()`。`typescript@7` 移除 `baseUrl`
> （见 Task 2）。`vitest@5` 的 `defineConfig` 从 `vitest/config` 导入。`pnpm` 11+ 默认
> `minimumReleaseAge` 为 1440 分钟，宽松模式会把不成熟的选择持久化到 `minimumReleaseAgeExclude`。

**Step 6.2: 安装**

```bash
pnpm install
```

预期：`pnpm-lock.yaml` 创建，无 `WARN ... unmet peer` 致命错误。

**Step 6.3: 校验版本**

```bash
pnpm run typecheck
```

预期：因尚未创建 `src/routes/__root.tsx` 与 worker 入口，可能有少量错误，先记录。

**Step 6.4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: 锁定依赖精确版本"
```

---

### Task 7: Vite + Cloudflare + TanStack Start 配置

**Files:**
- Create: `vite.config.ts`
- Create: `wrangler.jsonc`
- Create: `src/router.tsx`（TanStack Start 必需）
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`
- Create: `src/styles/globals.css`

> **不创建 `src/worker.ts`**：`@tanstack/react-start@1.168.61` 的 `createStartHandler()` 无参调用是类型错误。
> 框架默认 server-entry 由 `wrangler.jsonc` 的 `main` 直接指向包导出即可（见 Step 7.2）。

**Step 7.1: 写入 `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import viteReact from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
    tsconfigPaths(),
  ],
});
```

> 顺序说明（@tanstack/react-start 1.x 官方约定）：`cloudflare` 必须在最前以注入 `cloudflare:env` 等虚拟模块；`tanstackStart` 在中；`viteReact` 提供 Start dev 所需的 `/@react-refresh`；`tsconfigPaths` 在后处理路径别名。Task 8 追加 Tailwind 时插在 `tanstackStart` 之后、`viteReact` 之前。

> **注意**：`tanstackStart({ target: 'cloudflare-module' })` 在 1.168.61 中**不存在**该选项。

**Step 7.2: 写入 `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "saas-template",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "vars": {
    "NODE_ENV": "production"
  },
  "observability": { "enabled": true }
}
```

> DB/CACHE/BUCKET/EMAIL/AI bindings 在 Sub-Plan B/C 添加。

> **前向变更**：Task 9 接入 Paraglide 时，因需用 `paraglideMiddleware` 包装 Start 处理器，
> 会新增 `src/server.ts` 并将本文件的 `main` 改为 `"src/server.ts"`。此处先用框架默认
> server-entry，Task 9 再切换。

**Step 7.3: 写入 `src/router.tsx`**

```tsx
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({ routeTree });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

> **导出名必须是 `getRouter`**，Start 1.168.61 按此名发现路由；`createRouter` 是 Router 包自身的构造器。

**Step 7.4: 写入 `src/routes/__root.tsx`**

```tsx
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'SaaS Template' },
      { name: 'description', content: '基于 TanStack Start + Cloudflare Workers 的 SaaS 起步模板' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
});

// shellComponent 是必需文档外壳：Start 不会自动注入 <html>/<head>/<body>，
// 缺少它 SSR 会输出无 <html> 的片段。
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  return <Outlet />;
}
```

**Step 7.5: 写入 `src/routes/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>SaaS Template</h1>
      <p>基础设施就绪。后续 sub-plan 将填充业务模块。</p>
    </main>
  );
}
```

**Step 7.6: 写入 `src/styles/globals.css`（Tailwind v4 占位）**

```css
@import 'tailwindcss';

:root {
  --background: #ffffff;
  --foreground: #000000;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

**Step 7.7: 启动 dev server 验证**

```bash
pnpm exec vite dev --port 3010
```

预期：浏览器访问 `http://localhost:3010` 显示 "SaaS Template" 标题与提示文字，且 SSR HTML 含
`<html lang="zh-CN">`。验证后停止自己启动的服务。

**Step 7.8: Commit**

```bash
git add vite.config.ts wrangler.jsonc src/router.tsx src/routes src/styles
git commit -m "feat(scaffold): 集成 Vite + TanStack Start + Cloudflare"
```

---

### Task 8: Tailwind v4 + shadcn/ui CLI

**Files:**
- Create: `src/styles/globals.css`（更新）
- Create: `components.json`（shadcn 配置）
- Create: `src/components/ui/`（shadcn 生成）

**Step 8.1: 安装 Tailwind v4 与 Vite 插件**

```bash
pnpm add tailwindcss@latest @tailwindcss/vite@latest
```

**Step 8.2: 更新 `vite.config.ts` 添加 Tailwind 插件**

```ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),  // 必须最先
    tanstackStart(),
    tailwindcss(),
    viteReact(),                                        // Start dev 依赖 /@react-refresh，必需
    tsconfigPaths(),
  ],
});
```

> **注意**：`tanstackStart({ target: 'cloudflare-module' })` 在 `@tanstack/react-start@1.168.61` 中**不存在**
> 该选项。`@vitejs/plugin-react` 必须保留，否则 `pnpm dev` 因缺 `/@react-refresh` provider 失败。

**Step 8.3: 更新 `src/styles/globals.css` 引入 shadcn token（最小版）**

必须采用 shadcn v4 的**两层约定**：`@theme inline` 只做 `--color-x: var(--x)` 映射，裸变量定义在
`:root`，深色在媒体查询内以普通 `:root` 覆盖取值。**不得**把 `@theme` 嵌进媒体查询——Tailwind v4
要求 theme 变量定义在顶层，嵌套会静默失效（浅深色值合并，页面恒为深色）。`@theme` 之外的裸
变量是组件（如 `bg-secondary`、`focus-visible:ring-ring`）真正引用的来源，缺一即该类不生成。

```css
@import 'tailwindcss';

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-ring: var(--ring);
  /* 其余组件用到的 secondary / accent / destructive / input 等同样补齐 */

  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
}

:root {
  --background: #ffffff;
  --foreground: #0a0a0a;
  --primary: #0070f3;
  --primary-foreground: #ffffff;
  --muted: #f4f4f5;
  --muted-foreground: #71717a;
  --border: #e4e4e7;
  --ring: #0a0a0a;
  --radius: 0.5rem;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
    --primary: #3291ff;
    --primary-foreground: #0a0a0a;
    --muted: #27272a;
    --muted-foreground: #a1a1aa;
    --border: #27272a;
    --ring: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

**Step 8.4: 生成 shadcn 配置**

`shadcn@latest init` 为交互式，无法无人值守；改为手写 `components.json`（`style: "base-nova"`、
`baseColor: "neutral"`、`cssVariables: true`、`rsc: false`、`tsx: true`、`iconLibrary: "tabler"`、
`tailwind.css` 指向 `src/styles/globals.css`、aliases 走 `@/*`），随后只跑非交互的 `add`。
用 `pnpm dlx shadcn@latest info` 确认配置被识别（framework `tanstack-start`、tailwindVersion `v4`）。

**Step 8.5: 添加按钮组件作为验证**

```bash
pnpm dlx shadcn@latest add button -y
```

预期：`src/components/ui/button.tsx` 创建。注意 shadcn 4.21.4 默认 primitive 已是 **Base UI**
（`@base-ui/react`），不再生成 `src/lib/utils.ts`——组件 `import { cn } from "cn"` 直接依赖 npm 包 `cn`。
registry 元数据未声明 `class-variance-authority`，需手动 `pnpm add class-variance-authority`。
`biome.json` 需加 `css.parser.tailwindDirectives: true`，否则 `@theme` 处报 parse 错误。

**Step 8.6: 在 `src/routes/index.tsx` 引入按钮验证**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 className="text-3xl font-bold">SaaS Template</h1>
      <Button className="mt-4">基础设施就绪</Button>
    </main>
  );
}
```

**Step 8.7: dev server 验证**

```bash
pnpm exec vite dev --port 3010
```

预期：首页显示蓝色按钮，Tailwind 类生效。`dev` 脚本已硬编码 `--port 3000`，端口被占用时须显式
指定空闲端口。验证后停止自己启动的服务。

**Step 8.8: Commit**

```bash
git add vite.config.ts src/styles components.json src/components/ui
git commit -m "feat(ui): 接入 Tailwind v4 + shadcn/ui CLI"
```

---

### Task 9: Paraglide JS i18n（Inlang）

**Files:**
- Create: `project.inlang/settings.json`
- Create: `project.inlang/paraglide.config.ts`
- Create: `messages/zh.json`
- Create: `messages/en.json`
- Create: `src/locale/middleware.ts`
- Create: `src/lib/locale.ts`
- Create: `scripts/locale-sort.ts`
- Create: `scripts/check-locale.ts`
- Create: `src/components/layout/LocaleSwitcher.tsx`

**Step 9.1: 写入 `project.inlang/settings.json`**

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "baseLocale": "zh",
  "locales": ["zh", "en"],
  "modules": ["./node_modules/@inlang/plugin-message-format/dist/index.js"],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{locale}.json"
  }
}
```

> **路径注意**：`pathPattern` 相对 `project.inlang/` 的**父目录**（即仓库根）解析。`@inlang/sdk` 的
> `absolutePathFromProject` 先对 project 路径取 `dirname`，再 resolve `pathPattern`。因此消息文件位于
> 仓库根 `messages/`，而非 `project.inlang/messages/`；写成后者会**静默编译出 0 条消息**且不报错。
> 必须配置 `plugin.inlang.messageFormat`，否则 CLI 不会读取任何消息文件。

**Step 9.2: 写入 `messages/zh.json`**

```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format",
  "site_name": "SaaS Template",
  "site_title": "SaaS 起步模板",
  "site_description": "基于 TanStack Start 与 Cloudflare Workers 的 SaaS 起手模板",
  "nav_home": "首页",
  "nav_pricing": "价格",
  "nav_docs": "文档",
  "nav_dashboard": "控制台"
}
```

**Step 9.3: 写入 `messages/en.json`**

```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format",
  "site_name": "SaaS Template",
  "site_title": "SaaS Starter",
  "site_description": "A SaaS starter built on TanStack Start and Cloudflare Workers",
  "nav_home": "Home",
  "nav_pricing": "Pricing",
  "nav_docs": "Docs",
  "nav_dashboard": "Dashboard"
}
```

**Step 9.4: 配置 `package.json` scripts**

在 `scripts` 中加入：

```json
"locale:compile": "paraglide-js compile --project ./project.inlang",
"locale:sort": "tsx scripts/locale-sort.ts",
"locale:check": "tsx scripts/check-locale.ts"
```

`outdir`、`strategy`、`cookieName` 等编译选项集中于 `project.inlang/paraglide.config.ts`，CLI 与 Vite 插件
共用同一份配置，避免两处策略漂移、互相覆写。`typecheck` 与 `check` 需前置 `pnpm run locale:compile`，
使全新 checkout 无需手工编译即可通过类型检查（生成目录已 gitignore）。

**Step 9.5: 编译 Paraglide**

```bash
pnpm run locale:compile
```

预期：`src/locale/paraglide/messages.js` 等生成；这些文件已被 `.gitignore` 排除。

**Step 9.6: 写入 `src/lib/locale.ts`**

```ts
export type Locale = 'zh' | 'en';

export const localeConfig = {
  zh: { flag: '🇨🇳', name: '中文', hreflang: 'zh-CN' },
  en: { flag: '🇺🇸', name: 'English', hreflang: 'en' },
} as const satisfies Record<Locale, { flag: string; name: string; hreflang: string }>;

export const defaultLocale: Locale = 'zh';

export function parseLocale(value: string | undefined): Locale {
  return value === 'en' ? 'en' : 'zh';
}
```

**Step 9.7: 写入 `src/locale/middleware.ts`**

```ts
import { parseLocale, defaultLocale } from '@/lib/locale';

export function resolveLocale(req: Request): ReturnType<typeof parseLocale> {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  if (match) return parseLocale(decodeURIComponent(match[1]));
  const accept = req.headers.get('accept-language') ?? '';
  if (accept.toLowerCase().startsWith('en')) return 'en';
  return defaultLocale;
}
```

**Step 9.8: 写入 `src/components/layout/LocaleSwitcher.tsx`**

```tsx
import { localeConfig, type Locale } from '@/lib/locale';
import { useRouter } from '@tanstack/react-router';

interface Props {
  value: Locale;
}

export function LocaleSwitcher({ value }: Props) {
  const router = useRouter();
  function switchTo(locale: Locale) {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`;
    router.invalidate();
  }
  return (
    <select
      value={value}
      onChange={(e) => switchTo(e.target.value as Locale)}
      className="rounded border px-2 py-1 text-sm"
    >
      {Object.entries(localeConfig).map(([code, cfg]) => (
        <option key={code} value={code}>
          {cfg.flag} {cfg.name}
        </option>
      ))}
    </select>
  );
}
```

**Step 9.9: 写入 `scripts/locale-sort.ts`**

```ts
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'messages';
for (const file of readdirSync(dir)) {
  const path = join(dir, file);
  const data = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>;
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(data).sort()) {
    sorted[key] = data[key];
  }
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`sorted ${path}`);
}
```

**Step 9.10: 写入 `scripts/check-locale.ts`**

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'messages';
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const allKeys = new Map<string, Set<string>>();

for (const file of files) {
  const data = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as Record<string, string>;
  allKeys.set(file, new Set(Object.keys(data)));
}

const baseFile = files.find((f) => f.startsWith('zh')) ?? files[0];
if (!baseFile) throw new Error('未找到 base locale 文件');
const baseKeys = allKeys.get(baseFile);
if (!baseKeys) throw new Error(`无法读取 ${baseFile}`);

let failed = false;
for (const [file, keys] of allKeys) {
  if (file === baseFile) continue;
  const missing = [...baseKeys].filter((k) => !keys.has(k));
  if (missing.length > 0) {
    console.error(`❌ ${file} 缺失键：${missing.join(', ')}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('✅ 所有 locale 键配对一致');
```

**Step 9.11: 在 `src/routes/__root.tsx` 集成 LocaleSwitcher**

```tsx
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import { resolveLocale } from '@/locale/middleware';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'SaaS Template' },
      { name: 'description', content: '基于 TanStack Start + Cloudflare Workers 的 SaaS 起步模板' },
    ],
  }),
  component: RootLayout,
});

function RootLayout() {
  const locale = resolveLocale(new Request('http://localhost/'));
  return (
    <>
      <header style={{ padding: 12, borderBottom: '1px solid var(--color-border)' }}>
        <LocaleSwitcher value={locale} />
      </header>
      <Outlet />
    </>
  );
}
```

> 注：实际生产中 locale 解析需接入 TanStack Start 的 `requestMiddleware`；本 task 提供纯函数 + 占位 UI。

**Step 9.12: 校验**

```bash
pnpm run locale:check
pnpm run typecheck
pnpm dev
```

预期：dev server 启动；浏览器中 LocaleSwitcher 切换并写入 cookie。

**Step 9.13: Commit**

```bash
git add project.inlang messages src/lib/locale.ts src/locale src/components/layout scripts/locale-sort.ts scripts/check-locale.ts package.json
git commit -m "feat(i18n): 接入 Paraglide JS（Inlang）双 zh/en"
```

---

### Task 10: 最小化 websiteConfig 与 SEO helper

**Files:**
- Create: `src/config/website.ts`
- Create: `src/lib/seo.ts`
- Create: `src/lib/urls.ts`
- Create: `src/lib/utils.ts`

**Step 10.1: 写入 `src/lib/utils.ts`**

```ts
// shadcn 4.x 的组件统一从 npm 包 `cn` 导入（clsx + tailwind-merge 的合并替代品），
// 不再生成此文件。这里只做 re-export，保持 `@/lib/utils` 的既有约定，
// 切勿另写朴素的 join 实现，也不要重复引入 clsx / tailwind-merge。
export { cn } from 'cn';
```

> **注意**：Task 8 起 `src/components/ui/*` 直接 `import { cn } from 'cn'`，本文件仅为约定
> 路径提供 re-export。若确认无消费方，可省去该文件；但**不要**用 `classes.filter(Boolean).join(' ')`
> 之类的实现替代，它不处理 Tailwind 类冲突合并。

**Step 10.2: 写入 `src/lib/urls.ts`**

```ts
import { parsePublicEnv } from '@/env/public';

const env = parsePublicEnv({});

export function getBaseUrl(): string {
  return env.VITE_BASE_URL;
}

export function getCanonicalUrl(path: string): string {
  const base = getBaseUrl().replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
```

> 注：实际应用 `parsePublicEnv(import.meta.env)`；为避免 SSR 时 `import.meta.env` 缺失，此处用占位。

**Step 10.3: 写入 `src/lib/seo.ts`**

```ts
import { getCanonicalUrl } from '@/lib/urls';

interface SeoOptions {
  title: string;
  description?: string;
  image?: string;
  type?: 'website' | 'article';
}

export function seo(path: string, options: SeoOptions) {
  const url = getCanonicalUrl(path);
  return {
    meta: [
      { title: options.title },
      ...(options.description
        ? [{ name: 'description', content: options.description }]
        : []),
      { property: 'og:title', content: options.title },
      { property: 'og:type', content: options.type ?? 'website' },
      { property: 'og:url', content: url },
      ...(options.description
        ? [{ property: 'og:description', content: options.description }]
        : []),
      ...(options.image ? [{ property: 'og:image', content: options.image }] : []),
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: url }],
  };
}
```

**Step 10.4: 写入 `src/config/website.ts`（最小骨架）**

```ts
import { parsePublicEnv } from '@/env/public';

const env = parsePublicEnv({});

export const websiteConfig = {
  baseUrl: env.VITE_BASE_URL,
  metadata: {
    name: 'SaaS Template',
    title: 'SaaS 起步模板',
    description: '基于 TanStack Start 与 Cloudflare Workers 的 SaaS 起手模板',
    images: {
      ogImage: '/og.png',
      logoLight: '/logo-light.png',
      logoDark: '/logo-dark.png',
    },
  },
  features: {
    enableFileUpload: false,
    enableApiKeys: false,
    enableDocs: false,
    enableI18n: true,
    enableNewsletter: false,
    enableContact: false,
    enableAdmin: false,
    enableAIGateway: false,
  },
} as const;

export type WebsiteConfig = typeof websiteConfig;
```

**Step 10.5: 在 `src/routes/index.tsx` 使用 seo() helper**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { seo } from '@/lib/seo';

export const Route = createFileRoute('/')({
  head: () => seo('/', { title: 'SaaS Template', description: '...', type: 'website' }),
  component: HomePage,
});

function HomePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 className="text-3xl font-bold">SaaS Template</h1>
      <Button className="mt-4">基础设施就绪</Button>
    </main>
  );
}
```

**Step 10.6: 校验**

```bash
pnpm run typecheck
pnpm dev
```

预期：dev server 启动；首页 `<head>` 包含 OG 与 canonical。

**Step 10.7: Commit**

```bash
git add src/lib/utils.ts src/lib/seo.ts src/lib/urls.ts src/config/website.ts src/routes/index.tsx
git commit -m "feat(config): 引入 websiteConfig 骨架 + seo() helper"
```

---

### Task 11: README 与 LICENSE

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`

**Step 11.1: 写入 `LICENSE`（MIT）**

```
MIT License

Copyright (c) 2026 saas-template contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Step 11.2: 写入 `README.md`（中文）**

```markdown
# SaaS Template

构建在 **Cloudflare Workers** 上的 **TanStack Start** SaaS 起步模板。

## 已实现（Sub-Plan A）

- TanStack Start + Cloudflare Workers 骨架（Vite 8、React 19、TypeScript 7 strict）
- Tailwind v4 + shadcn/ui（Base UI 基座、Tabler 图标、两层主题变量）
- 多语言（zh / en，Paraglide JS，SSR 与 hydration 一致）
- 站点配置与 SEO helper（canonical / OG）
- Biome 校验、Vitest 单元测试、env 校验与客户端 bundle 检查脚本

## 后续计划

- Sub-Plan B：认证、订阅与支付、文件存储、邮件、联系表单
- Sub-Plan C：营销页面与文档站
- Sub-Plan D：端到端测试与 CI

## 快速开始

```bash
pnpm install
cp .env.example .env
pnpm dev              # http://localhost:3000
```

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm deploy` | 校验环境 → 构建 → 客户端 bundle 检查 → 部署到 Workers |
| `pnpm test` | 跑单元测试 |
| `pnpm typecheck` | 编译 locale 后跑 `tsc --noEmit` |
| `pnpm check` | locale 编译 + Biome + TypeScript + env + locale 校验 |

完整文档见 `docs/superpowers/specs/2026-10-12-saas-template-design.md`。

## 许可

MIT。
```

> **注意**：README 只能描述**当前已实现**的能力，未实现的模块须明确列为后续计划。命令表必须
> 从 `package.json` 的 `scripts` 实际提取——`setup` / `db:migrate:local` / `test:e2e` 等属后续
> sub-plan，当前不存在，**不得**写入。Node 下限见 `package.json` 的 `engines`（≥ 22.12.0），建议
> 使用偶数 LTS（22 / 24）。

**Step 11.3: 写入 `CONTRIBUTING.md`（中文）**

```markdown
# 贡献指南

## 文档规约

- 项目内文档默认中文；技术术语、命令、路径、库名保留英文。
- 中文与半角英数字之间添加一个半角空格。
- 中文使用全角标点。

## 多语言

- `messages/zh.json` 为源（中文优先）。
- 新增键必须在两个 locale 文件中同时存在。
- 修改前运行 `pnpm locale:sort` 与 `pnpm locale:check`。

## Markdown 文档站（Sub-Plan C）

> 以下约定属后续 Sub-Plan C，当前仓库尚无 `content/docs/**`，先记录以备后续实现。

- `content/docs/**` 为英文源；中文版使用 `*.zh.md` 后缀。
- 新增页面必须中英两份；缺失中文时 CI 失败。
- Frontmatter 必须含 `title`、`description`，可选 `order`、`category`。

## 提交规范

- 单一逻辑工作单元
- TDD：先写失败测试，再写实现，再 commit
- 提交消息格式：`<type>(<scope>): <subject>`
- 所有提交前运行 `pnpm check` 与 `pnpm test`（`pnpm check` 依赖 Task 12 交付的
  `scripts/check-env.ts`，在该任务落地前会在 `check:env` 处失败）
```

**Step 11.4: Commit**

```bash
git add README.md LICENSE CONTRIBUTING.md
git commit -m "docs: README、CONTRIBUTING、LICENSE"
```

---

### Task 12: 客户端 bundle 校验脚本

**Files:**
- Create: `scripts/check-env.ts`
- Create: `scripts/check-env-prod.ts`
- Create: `scripts/check-client-bundle.ts`

> **下方代码为意图示意，实施须按以下修正**（详见 `task-12-context.md`）：
> - `statSync(target, { throwIfNotExists: false })` —— Node 的正确选项名是 **`throwIfNoEntry: false`**，
>   写成前者会抛 `TypeError`。且必须校验目录**非空**（含真实 js/html），否则空产物假通过。
> - `check-env` 不能只验证 `.env` 存在；须复用 `src/env` 的 Zod schema 校验非法 URL/enum/secret，
>   并处理 `.env.example` 中 optional 字段为空串的情况（空串应可直接复制为 `.env` 并通过开发检查）。
> - 生产校验须强制 `NODE_ENV=production`，不信任 `.env` 中的 `NODE_ENV=development`。
> - env 解析**禁止** `raw.split('=')`；用 `node:util` 的 `parseEnv` 或 Vite `loadEnv`，正确处理引用、
>   注释、空白与「进程 env 覆盖 .env」的优先级。
> - 诊断只显示变量名与错误原因，**不得**打印值、文件内容或 Zod 的原始输入。
> - bundle 扫描应覆盖 schema 中**全部** secret 字段（至少 brief 三项），并递归扫描实际
>   `dist/client`；不得把整个服务端 schema 导入客户端。

**Step 12.1: 写入 `scripts/check-env.ts`**

```ts
import { existsSync } from 'node:fs';

if (!existsSync('.env')) {
  console.error('❌ 缺少 .env 文件。复制 .env.example → .env 后重试。');
  process.exit(1);
}
console.log('✅ .env 存在');
```

**Step 12.2: 写入 `scripts/check-env-prod.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs';

if (!existsSync('.env')) {
  console.error('❌ 缺少 .env 文件');
  process.exit(1);
}

const raw = readFileSync('.env', 'utf-8');
const lines = raw.split('\n').filter(Boolean);

function readVar(name: string): string | undefined {
  const line = lines.find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : undefined;
}

const secret = readVar('BETTER_AUTH_SECRET');
if (!secret || secret.length < 32) {
  console.error('❌ 生产部署要求 BETTER_AUTH_SECRET ≥ 32 字符');
  process.exit(1);
}
if (secret === 'better-auth-secret') {
  console.error('❌ BETTER_AUTH_SECRET 仍为占位值，请重新生成');
  process.exit(1);
}
console.log('✅ 生产环境变量校验通过');
```

**Step 12.3: 写入 `scripts/check-client-bundle.ts`**

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const forbidden = ['STRIPE_SECRET_KEY', 'BETTER_AUTH_SECRET', 'RESEND_API_KEY'];
const target = 'dist/client';

if (!statSync(target, { throwIfNoEntry: false })) {
  console.error(`❌ 目录 ${target} 不存在，请先运行 pnpm build`);
  process.exit(1);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

let failed = false;
for (const file of walk(target)) {
  if (!file.endsWith('.js') && !file.endsWith('.html')) continue;
  const content = readFileSync(file, 'utf-8');
  for (const key of forbidden) {
    if (content.includes(key)) {
      console.error(`❌ ${file} 包含禁止的密钥 ${key}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('✅ 客户端 bundle 不含敏感字段');
```

**Step 12.4: 写入 `.env.example`**

```bash
# Site
VITE_BASE_URL=http://localhost:3000

# Payment（Stripe）
VITE_PAYMENT_PROVIDER=
VITE_STRIPE_PRICE_PRO_MONTHLY=
VITE_STRIPE_PRICE_PRO_YEARLY=
VITE_STRIPE_PRICE_LIFETIME=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Auth
BETTER_AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_EMAIL_SENDER=

# Email (alternative)
RESEND_API_KEY=

# Newsletter
RESEND_AUDIENCE_ID=
BEEHIIV_API_KEY=
BEEHIIV_PUBLICATION_ID=

# Notification
DISCORD_WEBHOOK_URL=
FEISHU_WEBHOOK_URL=

# Analytics（任填启用）
VITE_GA_ID=
VITE_PLAUSIBLE_DOMAIN=
VITE_UMAMI_ID=
VITE_CLARITY_ID=

# Captcha（可选）
VITE_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Runtime
NODE_ENV=development
```

**Step 12.5: Commit**

```bash
git add scripts .env.example
git commit -m "feat(scripts): env/bundle 校验脚本 + .env.example"
```

---

### Task 13: 类型校验与构建端到端验证

**Files:** 无新增

**Step 13.1: 类型校验**

```bash
pnpm run typecheck
```

预期：0 错误。

**Step 13.2: Biome 检查**

```bash
pnpm run lint
pnpm run format
```

预期：无错误。

**Step 13.3: 完整 check**

```bash
pnpm run check
```

预期：env、locale、biome、tsc 全部通过。

**Step 13.4: 单元测试**

```bash
pnpm run test
```

预期：env.test.ts 全部 PASS。

**Step 13.5: 构建**

```bash
pnpm run build
```

预期：`dist/client` 与 `dist/server` 产出；不报超时。

**Step 13.6: 客户端 bundle 校验**

```bash
pnpm run check:client-bundle
```

预期：✅ 通过。

**Step 13.7: 启动 dev server 冒烟**

```bash
pnpm dev
```

`curl -s http://localhost:3000 | head -30` 应看到 `<title>SaaS Template</title>` 与 h1。

**Step 13.8: Commit（如有格式改动）**

```bash
git add -A
git commit -m "chore: Sub-Plan A 收尾（格式化与文档同步）" --allow-empty
```

---

## Sub-Plan A 完成标志

- [ ] `pnpm dev` 启动，`http://localhost:3000` 显示首页
- [ ] `pnpm run build` 产出构建结果
- [ ] `pnpm run check` 全部通过
- [ ] `pnpm run test` 全部通过
- [ ] Paraglide locale 切换工作
- [ ] shadcn Button 组件渲染并应用 Tailwind 类
- [ ] `pnpm run check:client-bundle` 通过
- [ ] 所有任务独立 commit，无 WIP

进入 Sub-Plan B 之前，确保以上所有项就位。

---

## Not in Scope（Sub-Plan A 显式不做）

按 writing-plans 规范，本 sub-plan 明确**不**包含以下内容；它们在其他 sub-plan 或后续版本：

- **业务模块**：认证、支付、邮件、订阅、文件存储、通知、联系表单、管理后台（→ Sub-Plan B）。
- **前端营销页面与文档站**：8 个 marketing blocks、Content Collections、Paraglide 文案使用、SEO 端点、PWA manifest、Analytics Provider（→ Sub-Plan C）。
- **测试套件**：集成测试、E2E、CI 流水线、覆盖率阈值（→ Sub-Plan D）。
- **多币种 / 试用周期 / 折扣码**（→ Sub-Plan B 之后另立 plan）。
- **D1 schema 表设计**：除 env 解析外不写业务表（→ Sub-Plan B Task 4）。
- **Service Worker**：spec §17 YAGNI 显式排除；仅在 Sub-Plan C 维护 PWA manifest。
- **`pages/`，`app/`，Next.js 风格目录**：本项目仅 TanStack Start `src/routes/`。
- **i18n 切换走 URL 前缀**：spec 决策表第 6 项；本期 `getServerLocale` 留作占位（已在 Task 9 注释中说明），URL 前缀化留待 v0.2。
- **PWA push 通知**（spec §17 显式排除）。
- **管理后台 / RBAC**（→ Sub-Plan B Task 11）。
- **AI Gateway / LLM 调用**（spec §3 提点；本期仅预留 schema 占位）。
- **Tailwind dark mode 完整主题切换 UI**：仅在 `globals.css` 提供 CSS 变量骨架。