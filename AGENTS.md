# AGENTS.md

本文件是**所有 AI 编程代理**（Claude Code、Codex、Cursor、Copilot、Gemini CLI…）的
统一入口。`CLAUDE.md` 转发到这里；新增或修改项目规约时**改本文件**，
不要在多处复制。

## 项目定位

`saas-template`（示例品牌 **Jerbix**）是一个构建在 **Cloudflare Workers** 上的
**TanStack Start** SaaS 起步模板。目标流程：`git clone` → 改
`src/config/website.ts` → 部署。

技术栈：TanStack Start / Router / Query、React 19、TypeScript strict、Tailwind CSS v4、
shadcn/ui（Base UI 基座 / Tabler 图标）、Paraglide JS（zh / en）、Zod、
Drizzle ORM + D1、Vitest + Playwright。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器（端口 3000） |
| `pnpm build` / `pnpm preview` | 构建 / 预览产物 |
| `pnpm check` | locale 编译 + Biome + tsc + env + locale 校验（提交前必跑） |
| `pnpm test` | Vitest 全部（unit + components 两个 project） |
| `pnpm test:affected` | 仅跑受影响测试 |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm lint` / `pnpm lint:fix` / `pnpm format` | Biome |
| `pnpm check:env` / `pnpm check:env:prod` | 开发 / 生产环境变量校验 |
| `pnpm check:client-bundle` | 检查客户端 bundle 不含服务端 secret |
| `pnpm deploy` | 生产 env 校验 → 构建 → bundle 检查 → `wrangler deploy` |
| `pnpm db:generate` / `pnpm db:migrate:local` | Drizzle 迁移 |
| `pnpm content:build` | 生成 `.content-collections/`（构建前置） |

> `pnpm test` 会先跑 `locale:compile`，在非交互环境可能被提问卡住。CI 里用
> `pnpm exec vitest run --project unit` 与 `--project components` 分开跑。

## 目录地图

```
src/
├── routes/          文件路由（`{-$locale}` 是可选的 locale 前缀）
├── config/          站点配置：website.ts（总开关）、pages/（页面文案与区块编排）
├── components/
│   ├── sections/    可复用内容区块（Hero / Features / Pricing…），单文件含类型
│   ├── marketing/   页面级装配（LandingPage / MarketingLayout / Navbar / Footer）
│   ├── docs/        文档站布局与侧边栏
│   ├── dashboard/   工作台骨架
│   ├── layout/      跨页面布局件（Logo / 语言切换 / 用户菜单）
│   └── ui/          shadcn 上游原件，不本地修改
├── auth/ cache/ contact/ mail/ newsletter/ notification/ payment/ storage/
│                    服务模块：每个目录一个 provider 注册表 + 抽象接口
├── db/              Drizzle schema 与迁移
├── env/             两层 env 校验（public / server），读 env 的唯一出口
├── lib/             纯逻辑：locale、seo、module-access、rate-limit…
├── locale/          Paraglide 生成物 + middleware
└── styles/          globals.css（设计 token）、mdx.css

content/             文档 / 博客 / 更新日志 / 法务（Markdown，`.zh.md` 为中文）
messages/            zh.json / en.json 界面文案
scripts/             构建与校验脚本
```

**改哪里**：站点信息 → `config/website.ts`；首页文案 → `config/pages/home.ts`；
界面文案 → `messages/*.json`；文档内容 → `content/docs/`；设计 token →
`styles/globals.css`（规则见 `DESIGN.md`）。

## 关键不变量

违反以下任一条即为缺陷：

1. **env 两层模型**：业务代码不得直接读 `process.env` / `import.meta.env`，一律经
   `src/env/public.ts`、`src/env/server.ts`。
2. **`VITE_` 前缀 = 公开**：构建时进入客户端 bundle，任何人可见，**不得**存放 secret。
3. **服务端 secret** 只经 Workers binding 读取，绝不能设成 `VITE_` 前缀。
4. **消息键配对**：新增消息键必须在所有 locale 文件中同时存在，改完跑 `pnpm locale:sort`。
5. **不手改生成物**：`src/routeTree.gen.ts`、`src/locale/paraglide/**`、
   `.content-collections/generated/**`。
6. **Workers 运行时**不是 Node.js，含 native binding 的包不可用。
7. **`src/components/ui` 只放上游原件**，不本地修改；调外观在调用处传 `className`。
8. **不硬编码颜色**：只用语义 token，规则见 `DESIGN.md`。

## 工作方式

- **先查官方文档**，再查本仓 `content/docs/`，最后看现有代码。三者冲突以官方文档为准，
  并顺手修正本仓文档。有意偏离官方推荐时在注释里写明原因。
- **先找现成组件**，没有才手写。新增 shadcn 组件用
  `pnpm dlx shadcn@latest add <component> -y`。
- **行为修改先写失败测试**；结构整理与行为修改分开提交。
- 提交前 `pnpm check` 与 `pnpm test` 必须全绿。提交消息写清改了什么、为什么，
  **不添加** `Co-Authored-By` 之类的工具署名行。
- **文档语言为中文**；技术名词、命令、代码标识符保留英文；中文与半角英数之间加空格。

## 需要先确认的操作

创建新文件（用户已明确要求的除外）、删除重要文件、架构或目录的大规模调整、
引入新的外部服务或库、认证与授权实现、数据库 schema / 迁移变更、生产环境与部署设置。

## 深入阅读

| 主题 | 位置 |
|---|---|
| 设计系统（颜色 / 字体 / 尺度 / Logo） | `DESIGN.md` |
| 快速开始与部署主线 | `content/docs/getting-started.zh.md` |
| 全部配置项 | `content/docs/configuration.zh.md` |
| Cloudflare 与自动部署 | `content/docs/cloudflare.zh.md` |
| 目录结构与「改哪里」 | `content/docs/project-structure.zh.md` |
| 测试分层 | `content/docs/testing.zh.md` |
| 架构决策 | `docs/adr/` |

## Agent skills

- **Issue tracker**：GitHub Issues via `gh` CLI，标题 / 正文 / 评论统一用中文。
  见 `docs/agents/issue-tracker.md`。
- **Triage labels**：`needs-triage` / `needs-info` / `ready-for-agent` /
  `ready-for-human` / `wontfix`。见 `docs/agents/triage-labels.md`。
- **Domain docs**：单仓 single-context，根 `CONTEXT.md` + `docs/adr/`。
  见 `docs/agents/domain.md`。

## 与用户级指导的关系

本文件只描述**本仓库特有**的规约，不覆盖用户在 `~/.claude/CLAUDE.md` 等用户级文件中
定义的全局行为。用户级规则优先适用，本文件在其之上补充项目细节。
