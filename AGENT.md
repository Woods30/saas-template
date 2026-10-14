# AGENT.md

本文件是本仓库面向 **所有 AI 编程代理** 的统一指导文件（single source of truth）。
Claude Code 经 `CLAUDE.md` 引用本文件；其他代理（Codex、Cursor、Copilot、Gemini CLI 等）
直接读取本文件。

> 若你的工具约定使用 `AGENTS.md`，请同样以本文件为准——两者的内容只在本文件维护。

---

## 项目定位

`saas-template`（品牌名 **Jerbix**）是一个构建在 **Cloudflare Workers** 上的
**TanStack Start** SaaS 起步模板。目标流程：`git clone` → 修改 `src/config/website.ts`
→ 部署。

技术栈：TanStack Start / Router / Query、React 19、TypeScript strict、Tailwind CSS v4、
shadcn/ui（Base UI 基座 / Tabler 图标）、Paraglide JS（zh / en）、Zod、Drizzle ORM + D1、
Vitest + Playwright。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器（Vite，端口 3000） |
| `pnpm build` | 生产构建；`pnpm preview` 预览产物 |
| `pnpm check` | locale 编译 + Biome + TypeScript + env + locale 校验（提交前必跑） |
| `pnpm test` | Vitest 单元测试 |
| `pnpm test:watch` | watch 模式 |
| `pnpm typecheck` | 编译 locale 后跑 `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` / `pnpm format` | Biome |
| `pnpm exec vitest run --config vitest.components.config.ts` | 组件测试（jsdom） |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm check:env` / `pnpm check:env:prod` | 开发 / 生产环境变量校验 |
| `pnpm check:client-bundle` | 检查客户端 bundle 不含服务端 secret |
| `pnpm deploy` | 生产 env 校验 → 构建 → bundle 检查 → `wrangler deploy` |

## 架构要点

- **入口**：`src/server.ts` 是自定义 server entry（`wrangler.jsonc` 的 `main` 指向它）。
  每个请求生成 CSP nonce、解析主题，把归一化后的 env 与 nonce 写入 AsyncLocalStorage
  （`src/lib/server-context.ts`），再用 Paraglide 的 `paraglideMiddleware` 写入语言上下文。
- **路由**：文件路由在 `src/routes/`；根路由经 `shellComponent` 提供 HTML 文档。
  `src/routeTree.gen.ts` 由框架生成，**不得手改**。
- **配置**：`src/config/website.ts` 是站点集中配置的唯一入口，模块加载期求值，只放语言
  无关值；需随请求语言变化的文案必须在工厂调用、组件 render 或路由 `head()` 内求值。
- **env**：`src/env/public.ts`（`VITE_` 前缀，客户端可见）与 `src/env/server.ts`
  （服务端 secret）两层 Zod 校验，是读取 env 的**唯一出口**。
- **i18n**：`src/lib/locale.ts` 为纯逻辑（URL 前缀 → cookie → `Accept-Language` → 默认
  `zh`），`src/locale/middleware.ts` 接入 Paraglide；消息源在仓库根 `messages/{zh,en}.json`。
- **provider**：`src/{mail,newsletter,notification,payment}/index.ts` 暴露按请求构建的
  provider 注册表，业务代码只调用抽象接口。
- **内容**：Content Collections 读 `content/{docs,blog,changelog,legal}/`，构建期生成到
  `.content-collections/`（git-ignored 但在版本控制中，勿手改）。
- **模块门禁**：`src/lib/module-access.ts`（页面，`beforeLoad` 抛 `notFound()`）、
  `src/lib/module-access.server.ts`（API，关闭 → `404 MODULE_DISABLED`，配置不全 →
  `503 SERVICE_UNAVAILABLE`）。门禁必须早于 body 解析、鉴权、限流与 provider 调用。
- **认证**：`src/auth/auth.ts` 的 `getAuth(env)` 每请求可重入；社交登录可见性经
  `src/auth/providers.ts` 的 server function 判定（服务端 secret 不得进客户端 bundle）。

## 关键不变量

违反以下任一条即为缺陷，评审会阻断：

1. **env 两层模型**：业务代码**不得**直接读 `process.env` / `import.meta.env`，一律经
   `src/env/public.ts`、`src/env/server.ts`。
2. **`VITE_` 前缀 = 公开**：`VITE_` 变量构建时进入客户端 bundle，任何人可见，**不得**
   存放 secret。
3. **服务端 secret**：仅经 Workers binding / 服务端读取，**绝不能**设成 `VITE_` 前缀
   （如 `BETTER_AUTH_SECRET`、`STRIPE_SECRET_KEY`）。
4. **消息键配对**：新增消息键必须在所有 locale 文件中同时存在，由
   `scripts/check-locale.ts` 双向校验；改完跑 `pnpm locale:sort`。
5. **不手改生成物**：`src/routeTree.gen.ts`、`src/locale/paraglide/**`、
   `.content-collections/generated/**` 均不得手工编辑。
6. **Workers 运行时**：非 Node.js，含 native binding 的包不可用（见
   `docs/adr/0001-why-cloudflare-workers.md`）。
7. **`src/components/ui` 只放上游原件**：该目录下的文件是 shadcn registry 的原样拷贝，
   **一律不本地修改**，以便直接跟随上游更新。需要调整外观时在调用处传 `className`，
   或用组合件包一层，不要改原件本身。

## 项目规约

### 文档语言

- 所有项目内文档（`README.md`、`docs/`、`content/docs/`、设计文档、注释、ADR）默认使用
  **中文**编写；`content/` 下的英文版为对应的 `.md`，中文版为 `.zh.md`。
- 技术专有名词、命令、代码标识符、库名保留英文原文，无需翻译。
- 中文与半角英数字、符号之间添加一个半角空格，例如：`使用 `pnpm` 安装依赖`。
- 标点符号使用标准中文全角标点。
- API、CLI、配置项等机器可读字段的键名仍使用英文，仅其说明文字使用中文。

### UI 组件

**硬规则：先找现成组件，找不到才自己写。**

- 编写任何页面前，先确认 shadcn / Base UI 是否已有对应组件；**有就直接用**，仅在确实
  没有可用组件时才手写。
- 本仓是 shadcn 的 **Base UI** 风格工程（`components.json` 的 `style: base-nova`、
  `iconLibrary: tabler`）。新增组件用 CLI 安装，不要手抄源码：

  ```bash
  pnpm dlx shadcn@latest add <component> -y
  ```

- 组件装入 `src/components/ui/`，视为上游原件，**不本地修改**（见「关键不变量」第 7 条）。
- 破坏性操作确认用 `AlertDialog`，不要用 `window.confirm`；空态用 `Empty` / `Spinner`；
  状态标记用 `Badge`——不要手写等价物。
- 表单统一用 **TanStack Form + Zod `validators` + `Field` 组合件**，见
  `content/docs/forms.zh.md`。

### 变更纪律

- **行为修改先写失败测试**，确认失败原因后再实施最小修改。
- **结构整理与行为修改分开提交**，不在同一提交里混合。
- 提交仅在全部测试通过、Linter 警告为零、代表单一逻辑工作单元时执行；提交消息末尾附
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 不新增依赖前先确认既有依赖无法满足需求。

### 需要确认的操作

以下操作影响面广，执行前须向用户确认：创建新文件（用户已明确要求的除外）、删除重要
文件、架构或目录结构的大规模调整、引入新的外部服务或库、认证与授权实现、数据库
schema / 迁移变更、生产环境与部署设置变更。

## 参考文档

| 主题 | 位置 |
|---|---|
| 网站配置全字段 | `content/docs/configuration.zh.md` |
| 导航 / 页脚 / 社交菜单 | `content/docs/navigation.zh.md` |
| 邮件 / 订阅 / 支付 / 通知 / 分析 | `content/docs/integrations.zh.md` 及各模块单页 |
| 身份认证与个人中心 | `content/docs/auth.zh.md`、`content/docs/auth-account.zh.md` |
| 表单约定（TanStack Form） | `content/docs/forms.zh.md` |
| 环境变量与两层校验 | `content/docs/environment.zh.md` |
| 术语表与不变量清单 | `CONTEXT.md` |
| 架构与路由表 | `docs/architecture.md` |
| 部署步骤 | `docs/deployment.md` |
| 决策记录 | `docs/adr/` |

## Agent skills

本仓库为这些 skill 提供了项目侧配置：

### Issue tracker

GitHub Issues via `gh` CLI。Issue / PR 标题、正文、评论统一使用中文。
See `docs/agents/issue-tracker.md`.

### Triage labels

默认五标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` /
`wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs

单仓 single-context：根 `CONTEXT.md` + `docs/adr/`。See `docs/agents/domain.md`.

## 与用户级指导文件的关系

本文件只描述**本仓库特有**的规约，不覆盖用户在 `~/.claude/CLAUDE.md` 等用户级文件中
定义的全局行为（TDD 周期、提交纪律、确认规则、语言偏好等）。用户级规则优先适用；
本文件在其之上补充项目细节。
