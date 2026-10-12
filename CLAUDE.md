# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目状态

Sub-Plan A（基础设施）已落地：TanStack Start + Cloudflare Workers 骨架、Tailwind v4 +
shadcn/ui（Base UI 基座 / Tabler 图标）、多语言（Paraglide JS，zh / en）、`websiteConfig`
与 `seo()` helper、两层 env 校验、locale 脚本与单元测试。认证、支付、存储、邮件、文档站、
E2E、CI 等属后续 sub-plan，尚未实现。

### 构建 / 检查 / 测试命令

- `pnpm dev` —— 启动开发服务器（Vite，端口 3000）
- `pnpm build` —— 生产构建；`pnpm preview` 预览产物
- `pnpm deploy` —— 生产 env 校验 → 构建 → 客户端 bundle 检查 → `wrangler deploy`
- `pnpm check` —— locale 编译 + Biome + TypeScript + env + locale 校验（依赖 Task 12 交付的
  `scripts/check-env.ts`，落地前会在 `check:env` 一步失败）
- `pnpm test` / `pnpm test:watch` —— Vitest 单元测试
- `pnpm typecheck` —— 编译 locale 后跑 `tsc --noEmit`
- `pnpm lint` / `pnpm lint:fix` / `pnpm format` —— Biome

### 架构说明

- **入口**：`src/server.ts` 为自定义 server entry（`wrangler.jsonc` 的 `main` 指向它），用
  Paraglide 的 `paraglideMiddleware` 为每个请求写入语言上下文。
- **路由**：文件路由在 `src/routes/`；根路由经 `shellComponent` 提供 HTML 文档。
- **配置**：`src/config/website.ts` 为站点集中配置，模块加载期求值，只放语言无关值。
- **env**：`src/env/public.ts` 与 `src/env/server.ts` 两层 Zod 校验，是读取 env 的唯一出口；
  业务代码不得直接读 `process.env` / `import.meta.env`。
- **i18n**：`src/lib/locale.ts` 为纯逻辑（cookie → `Accept-Language` → 默认语言），
  `src/locale/middleware.ts` 接入 Paraglide；消息源在仓库根 `messages/{zh,en}.json`。
- **关键不变量**：`VITE_` 变量构建时进入客户端 bundle，不得存放 secret；服务端 secret 仅经
  Workers binding / 服务端读取，绝不能设成 `VITE_` 前缀。

## 项目规约

### 文档语言

- 所有项目内文档（`README.md`、`docs/` 目录下的 Markdown、设计文档、注释、ADR 等）默认使用**中文**编写。
- 技术专有名词、命令、代码标识符、库名保留英文原文，无需翻译。
- 中文与半角英数字、符号之间添加一个半角空格，例如：`使用 `pnpm` 安装依赖`。
- 标点符号使用标准中文全角标点。
- 面向最终用户的产品文案遵循上述规则；面向开发者的内联代码注释同样使用中文。
- API、CLI、配置项等机器可读字段的键名仍使用英文，仅其说明文字使用中文。

### 与用户级 CLAUDE.md 的关系

仓库级 CLAUDE.md 不覆盖用户在 `~/.claude/CLAUDE.md` 中定义的全局行为（如 TDD 周期、提交纪律、确认规则等），仅补充本项目特有的规约。全局规则优先适用。

## Agent skills

### Issue tracker

GitHub Issues via `gh` CLI。Issue / PR 标题、正文、评论统一使用中文。See `docs/agents/issue-tracker.md`.

### Triage labels

默认五标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs

单仓 single-context：根 `CONTEXT.md`（Sub-Plan A 后已回填）+ `docs/adr/`。See `docs/agents/domain.md`.