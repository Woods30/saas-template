# SaaS Template

构建在 **Cloudflare Workers** 上的 **TanStack Start** SaaS 起步模板。

- **框架**：TanStack Start + TanStack Router + TanStack Query
- **运行时**：Cloudflare Workers（`wrangler.jsonc`，`main` 指向 `src/server.ts`）
- **构建**：Vite 8，包管理 pnpm
- **UI**：Tailwind v4 + shadcn/ui（Base UI 基座、Tabler 图标）
- **i18n**：Paraglide JS（zh / en）
- **语言**：TypeScript strict
- **质量**：Biome（lint / format）+ Vitest

## 已实现（Sub-Plan A）

- TanStack Start + Cloudflare Workers 骨架（Vite 8、React 19、TypeScript strict）
- Tailwind v4 + shadcn/ui（Base UI 基座、Tabler 图标、两层主题变量）
- 多语言（zh / en，Paraglide JS，SSR 与 hydration 一致，cookie / `Accept-Language` 协商）
- 站点配置（`src/config/website.ts`）与 SEO helper（`src/lib/seo.ts`，canonical / OG）
- 环境变量两层校验（`src/env/public.ts`、`src/env/server.ts`，Zod）
- 质量脚本与单元测试（`scripts/`、`tests/unit/`）

## 后续计划

- **Sub-Plan B**：认证、订阅与支付、文件存储、邮件、Newsletter、联系表单、管理后台
- **Sub-Plan C**：营销页面与文档站（`content/docs/**`）
- **Sub-Plan D**：端到端测试（Playwright）与 CI

> 上列能力**尚未实现**，当前仓库不包含相应代码、依赖或命令。

## 快速开始

前置要求：

- **Node.js ≥ 22.12.0**（`package.json` 的 `engines`，受 `vitest@5`、`wrangler` 与 `@tanstack/react-start` 约束；建议使用偶数 LTS，如 22 / 24）
- **pnpm**（仓库用 pnpm 开发与验证，当前验证版本为 pnpm 12.4.2；`pnpm-workspace.yaml` 为 pnpm 11+ 的配置格式）

```bash
pnpm install
cp .env.example .env   # 照抄示例即可启动，optional 字段留空
pnpm dev               # http://localhost:3000
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
| `pnpm test` | 运行单元测试（Vitest） |
| `pnpm test:watch` | 以 watch 模式运行测试 |
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
├── config/website.ts     # 站点集中配置（名称、资源路径、功能开关）
├── env/                  # public.ts / server.ts，两层 Zod 校验
├── lib/                  # locale、seo、urls、utils
├── locale/               # middleware.ts 与 Paraglide 生成产物
├── routes/               # 文件路由（__root.tsx、index.tsx）
├── components/           # layout / ui 组件
├── server.ts             # 自定义 server entry（Paraglide 中间件）
└── styles/globals.css    # Tailwind 主题变量
messages/{zh,en}.json     # 消息源（仓库根，zh 为源语言）
scripts/                  # locale / env / bundle 校验脚本
tests/unit/               # Vitest 单元测试
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

- 设计稿：`docs/superpowers/specs/2026-10-12-saas-template-design.md`
- 实施计划：`docs/superpowers/plans/`
- 决策记录：`docs/adr/`
- 贡献指南：`CONTRIBUTING.md`
