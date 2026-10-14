---
title: 快速开始
description: 从零跑起 Jerbix：环境准备、资源配置与部署检查
locale: zh
order: 1
group: start
updated: 2026-10-14
---

## 准备开发环境

需要 Node.js 22.12+ 的偶数 LTS（22 或 24）、pnpm，以及一个 Cloudflare 账号。

```bash
pnpm install
pnpm exec wrangler login
pnpm exec wrangler whoami
```

`wrangler login` 会打开浏览器完成授权；用 `whoami` 确认当前账号正确后再继续。

## 配置资源

```bash
pnpm run setup
```

脚本会创建或查找 D1 数据库、R2 bucket、KV namespace，生成认证密钥，并写入本地 `.env` 与 `wrangler.jsonc`。

> 脚本创建的资源属于你的 Cloudflare 账号。运行前先检查现有配置，避免覆盖需要保留的值。

Stripe、邮件、通知等可选服务可以在脚本中配置，也可以稍后补。部署前仍需按所用模块补齐凭据。

## 启动本地开发

```bash
pnpm dev
```

打开 `http://localhost:3000`。数据库使用 D1（SQLite）与 Drizzle，脚本会尝试执行本地迁移；若未成功可手动重试：

```bash
pnpm exec wrangler d1 migrations apply DB --local
```

## 修改站点

| 要改什么 | 改哪里 |
|---|---|
| 站点名称、Logo、模块开关 | `src/config/website.ts` |
| 界面文案 | `messages/zh.json`、`messages/en.json` |
| 页面路由 | `src/routes/` |
| 营销区块 | `src/components/blocks/marketing/` |
| 文档 / 博客内容 | `content/` |

配置字段的完整说明见[网站配置](./configuration)。

## 检查与部署

```bash
pnpm check
pnpm test
pnpm exec vitest run --config vitest.components.config.ts
pnpm build
pnpm check:client-bundle
```

```bash
pnpm deploy
```

`pnpm deploy` 会依次做生产 env 校验、构建、客户端 bundle 检查，最后执行 `wrangler deploy`。

> 本地 `.env` **不会**自动成为生产环境的 secret。部署前须另行用 `wrangler secret put` 配置，且**不得**把 secret 放进 `VITE_` 变量——它们会进入浏览器 bundle。

## 下一步

- [网站配置](./configuration)——`websiteConfig` 全字段与开关语义
- [导航与菜单](./navigation)——Navbar、页脚、文档侧边栏
- [功能集成](./integrations)——邮件、支付、订阅、通知、分析
- [环境变量](./environment)——两层校验与 `VITE_` 规则
