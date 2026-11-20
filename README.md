# SaaS Template

构建在 **Cloudflare Workers** 上的 **TanStack Start** SaaS 起步模板。

克隆 → 装依赖 → 建库写配置 → 部署。营销页、认证、支付、文档站、工作台、多语言、
测试与 CI 都已就位，开箱即可上线。

> **Jerbix 是示例品牌。** 品牌名、SEO、模块开关都能在后台改，步骤见
> [文档站 · 网站配置](content/docs/configuration.zh.md)。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | TanStack Start / Router / Query，React 19 |
| 运行时 | Cloudflare Workers（D1 / R2 / KV） |
| 构建 | Vite 8，pnpm |
| UI | Tailwind v4 + shadcn/ui（Base UI 基座、Tabler 图标） |
| i18n | Paraglide JS（zh / en） |
| 数据 | Drizzle ORM，多方言（SQLite / D1 / PostgreSQL） |
| 质量 | TypeScript strict、Biome、Vitest、Playwright |

## 快速开始

需要 Node.js 22 / 24（偶数 LTS）与 pnpm。

```bash
pnpm install
pnpm db:setup        # 按 DATABASE_PROVIDER 生成 schema 与首份基线迁移
pnpm run setup       # 交互式创建 D1 / KV，写入 .env 与 wrangler.jsonc
pnpm db:migrate:local
pnpm db:seed -- --brand "Acme"
pnpm dev             # http://localhost:3000
```

没有 Cloudflare 账号也能先跑：`pnpm run setup` 可以跳过资源创建，本地用 D1 模拟。

`pnpm db:seed` 把站点配置的六组默认值写进数据库；品牌名、支持邮箱可以直接在命令行
给（`--brand` / `--email`），其余在后台「系统设置」页改。详见[文档站 · 网站配置](content/docs/configuration.zh.md)。

邮件模块默认开启，但**邮箱验证默认关闭**：注册后直接登录，不需要配置邮件服务。需要邮箱验证时，在后台「系统设置 → 认证」打开「注册后必须验证邮箱」，并配好 `RESEND_API_KEY` 与已验证域名下的 `MAIL_FROM`；缺少邮件配置时认证 API 返回 503。另请确保 `BETTER_AUTH_URL` 与 `VITE_BASE_URL` 一致（重置密码等邮件链接依赖它）；详见[Resend 接入](content/docs/email-resend.zh.md)。

## 改成你自己的项目

配置分两处：**代码里的出厂值**（`src/config/website.ts`）与**数据库里的生效配置**。
克隆后先跑一次 `pnpm db:seed`，再按下面的清单改代码里的那一小部分：

| 位置 | 改成什么 |
|---|---|
| `package.json` 的 `name` | 你的包名 |
| `public/manifest.json` 的 `name` / `short_name` | 你的站名（PWA 应用名） |
| `messages/zh.json`、`messages/en.json` 里的品牌字样 | 你的站名（长文案仍编译期） |
| `src/config/products.ts` | 你要卖的商品与价格引用 |
| `src/config/website.ts` | Logo、OG 图、主题色等素材路径 |

品牌名、SEO、社交链接、支付渠道、邮件与模块开关**不用改代码**：后台「系统设置」页
保存后即时生效，见[文档站 · 网站配置](content/docs/configuration.zh.md)。

## 数据库

`DATABASE_PROVIDER` 决定连什么库，也决定生成哪份 schema：

| provider | 连什么 | 备注 |
|---|---|---|
| `sqlite`（默认） | 本地 SQLite 文件 | 本地开发与自托管 |
| `d1` | Cloudflare D1 | 与 sqlite 同方言；**没有交互式事务** |
| `postgres` | PostgreSQL | 生产推荐；真事务 + 按请求作用域建连接 |

```bash
DATABASE_PROVIDER=postgres DATABASE_URL=postgres://... pnpm db:setup
```

schema 入口 `src/core/db/schema.ts` 与迁移目录 `src/core/db/migrations/` 都是**本地生成物，不入库**：
库结构的事实源是手写 schema，迁移生成后手工 apply。详见[文档站 · 数据库](content/docs/database.zh.md)。

## 部署

```bash
pnpm deploy   # 生产 env 校验 → 构建 → bundle 泄漏检查 → wrangler deploy
```

合并到 `main` 只运行 CI；发布正式 GitHub Release 后，校验 tag 对应提交的 CI，再部署该版本。
GitHub `production` Environment 的变量与 secrets 配置见 [文档站 · Cloudflare](content/docs/cloudflare.zh.md#自动部署)。

## 包含什么

- **三层架构（`core / modules / routes`）**：基础设施在 `src/core/`，15 个业务模块在 `src/modules/`（只暴露 `service.ts`），页面与接口在 `src/routes/`，由 `scripts/check-boundaries.ts` 强制守护
- **credits-only 计费闭环**：积分账本（`credits`，FIFO 扣减、批次过期、幂等退款与退款反扣）、订阅（`subscriptions`，购买与续期自动发积分、自助期末取消、后台退款）与核销收款（`manual-payments`）
- **权限与安全**：细粒度角色与权限点（`rbac`，含权限天花板保护）、业务 API Key 校验（`apikeys`）与操作审计日志（`audit`）
- **AI 原语**：轻量 `core/ai` 网关（Fal / Replicate / Mock 同步与异步队列适配）与 `ai-tasks`（积分预扣、轮询完成、失败自动退回 revoke）
- **九类运营后台 + 审计**：用户管理、角色与权限、系统设置、营收看板、订单、订阅、核销队列、积分账本、AI 任务、内容与分类（CMS）、客服工单与邀请码、审计日志
- **营销与内容**：落地页、定价、数据库 CMS（文章 `posts`、更新日志 `changelog`、分类与标签 `taxonomy`）与可选文件型文档站（`docs`，默认关闭）
- **多方言数据库**：手写 `schema.sqlite.ts` 与 `schema.postgres.ts`，由 `pnpm db:setup` 按 `DATABASE_PROVIDER` 生成当前方言 schema；生产 schema 迁移在本地生成后手工 apply（`deploy.yml` 不自动执行线上 schema 变更）

## 面向 AI 的站点索引

面向 AI 抓取器的两份纯文本，随站点内容自动生成：

| 路径 | 内容 |
|---|---|
| `/llms.txt`、`/llms.zh.txt` | 站点索引：产品定位、技术栈、包含什么、价格与文档清单 |
| `/llms-full.txt`、`/llms-full.zh.txt` | 全部文档正文（纯 Markdown），模型不必逐页抓取 |

文案在 `src/config/llms.ts`，正文来自 `content/`——改了配置或文档，两份文件跟着变。
`robots.txt` 显式放行主流 AI 爬虫。

## 文档

| 主题 | 位置 |
|---|---|
| 快速开始（克隆到部署一条线） | [content/docs/getting-started.zh.md](content/docs/getting-started.zh.md) |
| 网站配置 | [content/docs/configuration.zh.md](content/docs/configuration.zh.md) |
| Cloudflare 与自动部署 | [content/docs/cloudflare.zh.md](content/docs/cloudflare.zh.md) |
| 支付（Stripe / Creem 各自一页） | [content/docs/payment.zh.md](content/docs/payment.zh.md) |
| 目录结构与「改哪里」 | [content/docs/project-structure.zh.md](content/docs/project-structure.zh.md) |
| 设计系统 | [DESIGN.md](DESIGN.md) |
| 架构决策 | [docs/adr/](docs/adr/) |
| 贡献指南 | [docs/contributing.md](docs/contributing.md) |
| 术语表与不变量 | [CONTEXT.md](CONTEXT.md) |

完整文档在站点的 `/docs` 路径下，按「开始 / 配置 / 部署 / 认证与账户 / 支付 / 邮件 / 通知 /
分析 / 开发」分组，互斥的接入方式（如 Stripe 与 Creem）各占一页。

## 面向 AI 编程代理

[`AGENTS.md`](AGENTS.md) 是**所有 AI 编程代理**（Claude Code、Codex、Cursor、Copilot、
Gemini CLI 等）的统一入口：命令、目录地图、关键不变量、工作方式与需确认操作。
`CLAUDE.md` 转发到它。新增或修改项目规约时改 `AGENTS.md`。

## 许可

MIT，见 `LICENSE`。
