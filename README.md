# SaaS Template

构建在 **Cloudflare Workers** 上的 **TanStack Start** SaaS 起步模板。

克隆 → 改 `src/config/website.ts` → 部署。营销页、认证、支付、文档站、工作台、
多语言、测试与 CI 都已就位，开箱即可改名上线。

> **Jerbix 是示例品牌。** 名称、Logo、文案都可以替换，步骤见
> [文档站 · 网站配置](content/docs/configuration.zh.md)。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | TanStack Start / Router / Query，React 19 |
| 运行时 | Cloudflare Workers（D1 / R2 / KV） |
| 构建 | Vite 8，pnpm |
| UI | Tailwind v4 + shadcn/ui（Base UI 基座、Tabler 图标） |
| i18n | Paraglide JS（zh / en） |
| 数据 | Drizzle ORM + D1 |
| 质量 | TypeScript strict、Biome、Vitest、Playwright |

## 快速开始

需要 Node.js 22 / 24（偶数 LTS）与 pnpm。

```bash
pnpm install
pnpm run setup   # 交互式创建 D1 / R2 / KV，写入 .env 与 wrangler.jsonc
pnpm dev         # http://localhost:3000
```

没有 Cloudflare 账号也能先跑：`pnpm run setup` 可以跳过资源创建，本地用 D1 模拟。

当前默认启用 Resend 和注册邮箱验证。使用注册、登录前，在 `.env` 填写 `RESEND_API_KEY` 与已验证域名下的 `MAIL_FROM`，并确保 `BETTER_AUTH_URL` 与 `VITE_BASE_URL` 一致。缺少邮件配置时认证 API 返回 503；详见[邮件配置](content/docs/email.zh.md#resend-配置)。

## 部署

```bash
pnpm deploy   # 生产 env 校验 → 构建 → bundle 泄漏检查 → wrangler deploy
```

合并到 `main` 只运行 CI；发布正式 GitHub Release 后，校验 tag 对应提交的 CI，再部署该版本。
GitHub `production` Environment 的变量与 secrets 配置见 [文档站 · Cloudflare](content/docs/cloudflare.zh.md#自动部署)。

## 包含什么

- **营销站**：落地页、定价、功能、关于、联系、路线图、候补名单
- **文档站**：Markdown 内容 + 侧边栏 + ⌘K 搜索 + 中英双语
- **认证**：Better Auth（邮箱密码 + Google OAuth）、个人中心、会话管理
- **付费**：Stripe 结账、订阅、账单页、webhook
- **服务模块**：邮件、订阅、通知、分析、文件存储——各自有 provider 抽象与开关
- **工程**：两层 env 校验、模块门禁、CSP、SEO、单元 / 组件 / E2E 三层测试、CI

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
| 目录结构与「改哪里」 | [content/docs/project-structure.zh.md](content/docs/project-structure.zh.md) |
| 设计系统 | [DESIGN.md](DESIGN.md) |
| 架构决策 | [docs/adr/](docs/adr/) |
| 贡献指南 | [docs/contributing.md](docs/contributing.md) |
| 术语表与不变量 | [CONTEXT.md](CONTEXT.md) |

完整文档在站点的 `/docs` 路径下。

## 面向 AI 编程代理

[`AGENTS.md`](AGENTS.md) 是**所有 AI 编程代理**（Claude Code、Codex、Cursor、Copilot、
Gemini CLI 等）的统一入口：命令、目录地图、关键不变量、工作方式与需确认操作。
`CLAUDE.md` 转发到它。新增或修改项目规约时改 `AGENTS.md`。

## 许可

MIT，见 `LICENSE`。
