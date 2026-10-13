# SaaS Template

构建在 **Cloudflare Workers** 上的 **TanStack Start** SaaS 起步模板。

- **框架**：TanStack Start + TanStack Router + TanStack Query
- **运行时**：Cloudflare Workers（`wrangler.jsonc`，`main` 指向 `src/server.ts`）
- **构建**：Vite 8，包管理 pnpm
- **UI**：Tailwind v4 + shadcn/ui（Base UI 基座、Tabler 图标）
- **i18n**：Paraglide JS（zh / en）
- **语言**：TypeScript strict
- **质量**：Biome（lint / format）+ Vitest

## 已实现（Sub-Plans A + B + C + D）

- **A**：TanStack Start + Cloudflare Workers 骨架（Vite 8、React 19、TypeScript strict）+ Tailwind v4 + shadcn/ui + 多语言（zh / en，Paraglide JS）+ 站点配置与 SEO + 两层 env 校验
- **B**：认证（Better Auth）、订阅与支付（Stripe）、文件存储（R2）、邮件（Resend / Cloudflare Email）、Newsletter（Resend）、联系表单、Discord 通知、Drizzle ORM + D1
- **C**：营销页面（8 个 blocks：Hero / Features / Stats / Pricing / FAQ / Testimonials / NewsletterCTA / CTA）+ 文档站 / 博客 / 更新日志（Content Collections，根目录 `content/`）
- **D**：端到端测试（Playwright，9 测试用例）+ CI（GitHub Actions）+ Workers 单元测试（Vitest pool）+ CSP 安全 header

## 快速开始

前置要求：

- **Node.js** `^22.12.0 || ^24.0.0 || >=26.0.0`（`package.json` 的 `engines`，受 `vitest@5` 约束排除奇数大版本 23 / 25，故非简单 `>=`；`wrangler` 要求 ≥22、`@tanstack/react-start` 要求 ≥22.12.0；建议使用偶数 LTS，如 22 / 24）
- **pnpm**（仓库用 pnpm 开发与验证，当前验证版本为 pnpm 12.4.2）
- **wrangler**（`pnpm dlx wrangler --version` 确认已登录 Cloudflare）

```bash
pnpm install
pnpm run setup   # 交互式创建 D1 / R2 / KV 并注入 .env 与 wrangler.jsonc
pnpm dev         # http://localhost:3000
```

> `pnpm check` 会校验本地 `.env`；生产部署所需的 secrets 需另行在 Cloudflare 配置，
> 本地 `.env` 校验不代表云端已配置。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动开发服务器（Vite，端口 3000） |
| `pnpm build` | 生产构建 |
| `pnpm preview` | 预览构建产物 |
| `pnpm deploy` | 生产 env 校验 → 构建 → 客户端 bundle 检查 → `wrangler deploy` |
| `pnpm check` | locale 编译 + Biome + TypeScript + env + locale 校验 |
| `pnpm check:env` | 校验本地 `.env` |
| `pnpm check:env:prod` | 校验生产环境变量 |
| `pnpm check:client-bundle` | 检查客户端 bundle 不含服务端 secret |
| `pnpm check:locale` | locale 编译 + 消息键配对校验 |
| `pnpm locale:compile` | 把 `project.inlang` 编译到 `src/locale/paraglide` |
| `pnpm locale:sort` | 按字典序重排 `messages/*.json` |
| `pnpm locale:check` | 校验各 locale 消息键与源一致 |
| `pnpm typecheck` | 编译 locale 后跑 `tsc --noEmit` |
| `pnpm test` | 运行单元测试（Vitest，239 单元 + 25 组件） |
| `pnpm test:watch` | 以 watch 模式运行测试 |
| `pnpm test:e2e` | 运行 Playwright E2E 测试（9 测试用例） |
| `pnpm test:e2e:ui` | 以 UI 模式运行 Playwright |
| `pnpm test:workers` | Workers 单元测试（Vitest pool） |
| `pnpm db:generate` | 生成 Drizzle migration |
| `pnpm db:studio:local` | 本地 Drizzle Studio |
| `pnpm db:studio:remote` | 远程 Drizzle Studio |
| `pnpm setup` | 交互式创建 Cloudflare 资源（D1 / R2 / KV）并写入 `.env` 与 `wrangler.jsonc` |
| `pnpm content:build` | 构建 Content Collections |
| `pnpm format` | 用 Biome 格式化 |
| `pnpm lint` | 用 Biome 检查 lint |
| `pnpm lint:fix` | 用 Biome 自动修复 |

> `pnpm check:client-bundle` 需先运行 `pnpm build`；`pnpm check:env:prod` 校验生产所需
> secrets 是否齐备（本地 `.env` 或进程 env 提供）。

## 环境变量

环境变量分两层，业务代码**不得**直接读取 `process.env` / `import.meta.env`，一律经
`src/env/public.ts`、`src/env/server.ts` 校验后使用。

- **公开变量**（`VITE_` 前缀）：构建时进入客户端 bundle，任何人均可见，**不得**存放 secret。
  例如 `VITE_BASE_URL`。
- **服务端 secret**：仅从 Workers binding 或服务端读取，**绝不能**设成 `VITE_` 前缀。
  例如 `BETTER_AUTH_SECRET`、`STRIPE_SECRET_KEY`。

## 目录结构

```text
src/
├── auth/                 # Better Auth 集成
├── cache/                # KV 缓存抽象
├── contact/              # 联系表单 + 投递
├── db/                   # Drizzle schema + D1 client + migrations
├── mail/                 # 邮件 provider（Resend / Cloudflare Email）
├── newsletter/           # Newsletter provider（Resend / Beehiiv）
├── notification/         # 通知 provider（Discord / 飞书）
├── payment/              # 支付 provider（Stripe / Creem / Waffo）
├── storage/              # R2 对象存储抽象
├── config/website.ts     # 站点集中配置（名称、资源路径、功能开关）
├── config/blocks/        # 营销 blocks 配置（pricing、功能开关）
├── env/                  # public.ts / server.ts，两层 Zod 校验
├── lib/                  # locale、seo、urls、utils
├── locale/               # middleware.ts 与 Paraglide 生成产物
├── routes/               # 文件路由（TanStack Router，`routeTree.gen.ts`）
├── components/           # layout / ui / blocks 组件
├── server.ts             # 自定义 server entry（Paraglide 中间件）
└── styles/globals.css    # Tailwind 主题变量
content/                  # Content Collections（docs / blog / changelog / legal）
messages/{zh,en}.json     # 消息源（仓库根，zh 为源语言）
scripts/                  # locale / env / bundle 校验脚本
tests/unit/               # Vitest 单元测试
tests/e2e/                # Playwright E2E 测试
docs/                     # 设计稿、计划与 ADR（中文）
```

## 多语言

- 支持 `zh`、`en`，默认 `zh`，消息文件位于仓库根 `messages/{zh,en}.json`。
- 语言按 **cookie → `Accept-Language` → 默认语言** 的顺序协商，SSR 与 hydration 使用同一
  解析实现，保证两侧一致（见 `src/lib/locale.ts`、`src/locale/middleware.ts`）。
- 新增键须同时写入两个 locale 文件，改动后运行 `pnpm locale:sort` 与 `pnpm locale:check`。

## 许可

MIT，见 `LICENSE`。

## 更多文档

- [部署指南](docs/deployment.md)
- [架构文档](docs/architecture.md)
- [贡献指南](docs/contributing.md)
- 设计稿：`docs/superpowers/specs/2026-10-12-saas-template-design.md`
- 实施计划：`docs/superpowers/plans/`
- 决策记录：`docs/adr/`
