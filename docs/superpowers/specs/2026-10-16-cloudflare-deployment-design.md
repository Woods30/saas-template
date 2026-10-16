# Cloudflare 完整部署与配置文档设计

日期：2026-10-16。
状态：对话设计已获用户批准；本文件记录实施规格。

## 1. 目标与总体分工

把 Jerbix 完整部署到 Cloudflare Workers，并把配置方法整理成文档站的四章配置文档。
四块工作相互独立，可分别提交：

1. **生产环境变量模型**——引入 `.env.production`，让「校验的值」与「打进 bundle 的值」同源。
2. **Cloudflare 资源与部署**——创建 D1 / KV / R2，回填 `wrangler.jsonc`，应用远程迁移，部署 Worker。
3. **自动部署流水线**——CI 绿后自动部署。
4. **文档站配置文档**——新增 Cloudflare / 数据库 / 存储 / 缓存四章，补充身份认证一章。

用户已确定：

- 部署目标：先到 `*.workers.dev` 子域，暂不绑自定义域名。
- 启用模块：**都不启用**，只跑核心（D1 + R2 + KV + Worker + 认证密钥）。
  邮件 / 支付 / 订阅 / 通知 / 分析全部保持 `enabled: false`。
- 生产 env 用**方案 B**：引入 `.env.production`（git-ignored），`check-env-prod.ts` 读它。
- `BETTER_AUTH_URL`：**删除**（游离字段，schema 未声明、代码未读）。
- 既有缺陷：补 `db:migrate:local` / `db:migrate:remote` 脚本并修文档引用。
- 凭据形态：Scoped API Token。
- 文档落点：`content/docs/`，**先只写中文**；英文版等流程与格式确认后另行补齐。
- 先写 spec + plan，再实施。

## 2. 当前源码事实

以下均已实测确认，不是推断：

**阻塞部署的硬伤**

- `wrangler.jsonc` 的 `d1_databases[0].database_id` 与 `kv_namespaces[0].id` 均为
  `REPLACE_ME`。`wrangler deploy --dry-run` 跑得通，但输出里
  `env.CACHE (REPLACE_ME)`、`env.EMAIL (REPLACE_ME)` 会被原样部署上去。
- `send_email[0].destination_address` 为 `REPLACE_ME`，**不是合法投递地址**。
- `docs/deployment.md:12` 让用户跑 `pnpm run db:migrate:remote`，但 `package.json` 的
  `scripts` 里**没有** `db:migrate:local` / `db:migrate:remote` 任何一个。
  `scripts/setup.ts:195` 直接调 `wrangler d1 migrations apply DB --local`，未走 npm script。
- 本机 `wrangler` 未登录（token 已过期，非交互环境无法刷新）。

**游离与脱节**

- `.env` 含 `BETTER_AUTH_URL=http://localhost:3000`。它在 `src/env/public.ts` 与
  `src/env/server.ts` 两个 schema 里都未声明，**本仓源码**也确实无人读取；但
  **better-auth 内部会读**：`@better-auth/core/dist/env/env-impl.mjs` 的 `env` 是
  `globalThis.process.env` 的 Proxy，`dist/utils/url.mjs:71` 的 `getBaseURL` 会取
  `env.BETTER_AUTH_URL`。因此它是一个「第三方隐式消费、本仓未声明」的字段——
  不是纯粹的死字段，措辞需准确。
  **删除是安全的**：`getBaseURL` 在无该值时回退到 `getOrigin(request.url)`，dev 下
  请求 origin 同样是 `http://localhost:3000`，取值不变。生产环境本来就没有该 secret，
  一直是靠请求推断。本次不启用 Google OAuth，故无需显式 `baseURL`。
- `.gitignore` 只忽略 `.env` 与 `.env.local`，**未忽略 `.env.production`**。
  照参照站建该文件会被 `git add -A` 直接带进仓库。

**已确认的机制**

- Vite 在 `vite build`（mode=production）时读 `.env.production`，且优先级**高于** `.env`；
  进程 env 又高于两者。已在 `/tmp` 用 vite@8 真实验证三个优先级。
- `scripts/lib/env-file.ts` 的 `resolveRawEnv(path)` **本来就接受文件路径参数**
  （默认 `.env`）。因此该文件**无需改动**，改动只落在 `check-env-prod.ts`。
  （此前设计中的「给 resolveRawEnv 加参数」一项据此撤销。）
- `resolveRawEnv` 已是「进程 env 覆盖文件」语义，且只吞 `ENOENT`。
- `check-env-prod.ts` 强制 `NODE_ENV: 'production'`，而 `validateProdServerEnv` 在该值下
  **要求 `BETTER_AUTH_SECRET` 存在**。故 `.env.production` 必须含该键，否则
  `pnpm deploy` 第一步就失败。
- `wrangler deploy` 不会清除已存在的 Worker secret，重复部署是幂等的。
- `e2e/docs.spec.ts:149` 的侧边栏条目数断言由 `content/docs/*.zh.md` 的**文件数派生**，
  新增文档不必改断言；`:143` 的分组标题断言为 `['开始','配置','功能模块']`，新文档若归入
  既有 `config` 分组则不变。
- 全仓**没有**任何测试或脚本校验 `content/docs/` 的 zh / en 配对。`scripts/check-locale.ts`
  只管 `messages/*.json`。因此只写中文版不会让任何检查失败。
- `content/` 的约定是**无后缀 = en，`.zh.md` = zh**（见 `src/lib/content-locale.ts`
  的 `BASE_LOCALE`），与 Paraglide 的 `baseLocale: zh` 不是同一个概念。
- `wrangler kv namespace create` / `wrangler d1 create` 均支持 `--update-config`，
  可直接把 ID 写回配置文件；但本仓 `wrangler.jsonc` 带注释，**不使用**该选项，
  改为手工回填以免注释被 JSON 序列化抹掉。
- `wrangler whoami` 不显示 workers.dev 子域。子域需经 API 查：
  `GET /accounts/{account_id}/workers/subdomain`。这解决了「先要有 URL 才能过
  `check:env:prod`，但 URL 要部署后才知道」的先后矛盾。

## 3. 全局约束

沿用 `AGENT.md` 既有规约，重申与本设计相关的几条：

- 业务代码不得直接读 `process.env` / `import.meta.env`，一律经 `src/env/public.ts`、
  `src/env/server.ts`。
- `VITE_` 前缀变量进入客户端 bundle，**不得**存放 secret。
- `src/components/ui/` 是 shadcn 上游原件，不本地修改。
- 不手改 `src/routeTree.gen.ts`、`src/locale/paraglide/**`、`.content-collections/generated/**`。
- 行为修改先写失败测试；结构整理与行为修改**分开提交**。
- 提交消息末尾附 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 文档用中文；中文与半角英数字之间加半角空格。
- 涉及生产环境与部署设置的变更须向用户确认（本设计已确认）。
- `wrangler.jsonc` 属核心区（`scripts/core-paths.ts`），改动会触发全量回归 + e2e。

## 4. 生产环境变量模型（方案 B）

### 4.1 分层

| 层 | 载体 | 何时生效 | 本次需要的键 |
|---|---|---|---|
| 构建期公开 | `.env.production` | `vite build` 内联进客户端 bundle | `VITE_BASE_URL` |
| 构建期校验 | `.env.production` | `pnpm check:env:prod` | 同上 + `BETTER_AUTH_SECRET` |
| Worker 运行时 | `wrangler secret put` | Worker 执行期经 `env` 注入 | `BETTER_AUTH_SECRET` |
| 资源绑定 | `wrangler.jsonc` | 部署时解析 | `DB` / `CACHE` / `BUCKET` |

关键点：`BETTER_AUTH_SECRET` **同时**出现在 `.env.production` 与 Worker secret 里，但用途不同——
前者只为让 `check:env:prod` 通过，后者才是运行时真正读到的值。二者必须是**同一个值**。

### 4.2 `.env.production` 的解析

`check-env-prod.ts` 改为：`.env.production` 存在则读它，否则回退 `.env`。

```ts
const raw = existsSync('.env.production') ? resolveRawEnv('.env.production') : resolveRawEnv()
```

**回退是安全的**：本地 `.env` 的 `VITE_BASE_URL` 是 `http://localhost:3000`，会被
`isProductionBaseUrl()` 拒绝，不会静默带着 localhost 部署。

**回退也是必要的**：`tests/unit/check-env-scripts.test.ts` 有约 20 个用例在隔离临时目录里
只写 `.env` 就运行 `check-env-prod.ts`。有了回退，这些用例**无需修改**即可继续通过。

### 4.3 其他改动

- `.gitignore` 补 `.env.production`，附中文注释说明它含生产 secret、不得入库。
- `.env.example` 末尾补一段说明：生产部署应复制为 `.env.production`，并提示
  「该文件含生产 secret，已 git-ignored」。
- 删除 `.env` 里的 `BETTER_AUTH_URL`。它是本地文件、不入库，故无提交。理由见 §2：
  本仓源码不读它，better-auth 内部会读，但删除后回退到请求 origin，dev 行为不变。
  **不要**把 `BETTER_AUTH_URL` 加进 `src/env/server.ts` 的 schema 或 `.env.example`——
  那会让它看起来像本仓管理的配置，而实际消费方是第三方库的内部约定。

## 5. Cloudflare 资源与 wrangler.jsonc

### 5.1 要创建的资源

| 资源 | 名称 | 绑定 | 写入位置 |
|---|---|---|---|
| D1 | `saas-template-db` | `DB` | `d1_databases[0].database_id` |
| KV | `saas-template-cache` | `CACHE` | `kv_namespaces[0].id` |
| R2 | `saas-template-uploads` | `BUCKET` | 已是真实名，无需改 |

名称沿用 `wrangler.jsonc` 现值，不新造命名。创建前先 `wrangler d1 list` /
`wrangler kv namespace list` 查重，已存在则复用其 ID 而非重复创建。

### 5.2 `send_email` 块

`mail.enabled` 为 `false`，而 `destination_address: REPLACE_ME` 不是合法投递地址。
**将整个 `send_email` 块注释掉**，并在注释里写明重新启用的前置条件（需 DNS MX 指向的
已验证地址 + 在 Dashboard 配置 Email Routing）。

运行时行为不受影响：`src/server.ts:133` 的 `if (env.EMAIL && mailFrom)` 在无绑定时跳过，
`src/config/service-status.ts` 对 `bindings.email !== false` 的判定也只影响部署提示。

### 5.3 部署顺序

1. `wrangler whoami` 确认身份与账号。
2. 经 API 查 workers.dev 子域，拼出 `VITE_BASE_URL=https://saas-template.<子域>.workers.dev`。
3. 创建 D1 / KV / R2，解析出 ID。
4. 回填 `wrangler.jsonc`。
5. `pnpm run db:migrate:remote` 应用两个迁移（`0000_nosy_smasher`、`0001_orange_sue_storm`）。
6. `wrangler secret put BETTER_AUTH_SECRET`（值取 `.env` 里已有的那个，保证两侧一致）。
7. 写 `.env.production`。
8. `pnpm deploy`。

## 6. 自动部署流水线

新增 `.github/workflows/deploy.yml`。

- **触发**：`workflow_run`，`workflows: [CI]`、`types: [completed]`、`branches: [main]`，
  且 `github.event.workflow_run.conclusion == 'success'`。这样「CI 绿」是部署的硬前置，
  而不是靠两个 workflow 各跑各的。
- **并发**：`concurrency: { group: deploy-production, cancel-in-progress: false }`，
  避免两次 push 的部署互相覆盖。
- **步骤**：checkout → `pnpm/action-setup`（版本由 `package.json` 的 `packageManager`
  提供，**不硬编码**）→ `setup-node` → `pnpm install --frozen-lockfile` →
  `pnpm deploy` → 冒烟检查线上 URL。
- **变量传递用 `env:` 块直接引用 `secrets.*`，不在 CI 里物化 `.env.production` 文件**。
  理由：`resolveRawEnv` 已是「进程 env 覆盖文件」，`check-env-prod.ts` 在
  `.env.production` 不存在时回退 `.env`、再回退到进程 env，因此 `env:` 块足以让
  `check:env:prod` 通过；同时避免把 secret 写到 CI 磁盘上。这也已在 `/tmp` 实测
  （进程 env 优先于 `.env.production`）。

**需要写入 GitHub Secrets 的键**（均通过 `gh secret set`）：

| Secret | 用途 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | `wrangler deploy` 认证 |
| `CLOUDFLARE_ACCOUNT_ID` | 账号定位 |
| `VITE_BASE_URL` | 构建期内联 |
| `BETTER_AUTH_SECRET` | 仅为让 `check:env:prod` 通过 |

**本次不引入 `sync-worker-secrets` 脚本**（参照站有，但本仓只跑核心、运行时 secret 仅
`BETTER_AUTH_SECRET` 一个，手工设一次即可，重复部署不会清除它）。这一点在
`content/docs/cloudflare.zh.md` 里写明，并说明后续接入 Stripe / Resend 时该补什么。

## 7. 文档站配置文档

### 7.1 新增四章（仅中文）

| 文件 | slug | order | group | 内容 |
|---|---|---|---|---|
| `content/docs/cloudflare.zh.md` | `cloudflare` | 14 | `config` | 账号、Scoped API Token 权限清单、Worker 部署、自动部署流水线、workers.dev 与自定义域名 |
| `content/docs/database.zh.md` | `database` | 15 | `config` | D1 创建、远程迁移、Drizzle 接线、`db:generate` / `studio` 命令 |
| `content/docs/storage.zh.md` | `storage` | 16 | `config` | R2 创建与绑定、`uploadFile` / `deleteFile` / `listUserFiles` 用法、限制 |
| `content/docs/cache.zh.md` | `cache` | 17 | `config` | KV 创建与绑定、`getOrSetCache` / `deleteCache` / `deleteCacheByPrefix`、TTL 常量 |

`order` 接在 `forms`(13) 之后；`group` 用既有的 `config`，**不新增消息键**，
因此不触发 `pnpm locale:sort`，也不改变 `e2e/docs.spec.ts:143` 的分组标题断言。

### 7.2 修改身份认证一章

`content/docs/auth.zh.md` 补一节「生产环境」：`BETTER_AUTH_SECRET` 用
`wrangler secret put` 而非 `.env`；说明未设 `baseURL` 时 better-auth 从请求推断
（`getBaseURL` 的 `fromEnv` 分支取不到 `BETTER_AUTH_URL` 时回退 `getOrigin(request.url)`）；
说明本次未接 Google OAuth 时 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 留空即可。

### 7.3 文档图标

`src/components/docs/doc-icons.ts` 的 `DOC_ICON` 补四个 slug 的图标，与既有条目风格一致
（从 `@tabler/icons-react` 选语义相近的图标）。不补也不报错（有 `DOC_FALLBACK_ICON` 兜底），
但侧边栏与搜索弹窗会出现四枚相同的通用图标，与其余条目不一致。

### 7.4 每章的固定结构

参照站各章都是「设置 → 核心功能 → 使用方法 → 最佳实践 → 下一步」。本仓文档统一为：

```
## 设置          （前置 + 分步命令）
## 使用方法      （代码示例，从 @/xxx 导入）
## 最佳实践
## 参考资料      （指向 Cloudflare 官方文档）
## 下一步        （相对链接指向本仓其他章）
```

`## 下一步` 会被 `splitNextSteps()` 解析成卡片，链接必须用相对形式（`./database`）
且指向**确实存在**的文档，否则卡片指向 404。

## 8. 顺带修复的既有缺陷

| 缺陷 | 修法 |
|---|---|
| `docs/deployment.md` 引用不存在的 `db:migrate:remote` | `package.json` 补 `db:migrate:local` / `db:migrate:remote` 两个脚本；`docs/deployment.md` 与 `content/docs/getting-started.zh.md` 的引用对齐 |
| `.env` 里的 `BETTER_AUTH_URL`（本仓未声明，第三方隐式消费） | 删除；理由与安全性见 §2 与 §4.3 |
| `.gitignore` 未忽略 `.env.production` | 补上 |
| `send_email` 的 `REPLACE_ME` 投递地址 | 注释掉该块 |
| `docs/operations/wrangler-bindings.md` 的「手动设置」段落未提远程迁移 | 补上 `db:migrate:remote` 步骤 |

新增的两个脚本内容：

```jsonc
"db:migrate:local": "wrangler d1 migrations apply DB --local",
"db:migrate:remote": "wrangler d1 migrations apply DB --remote"
```

## 9. 需要用户提供的凭据

一个 Scoped API Token，权限清单：

| 范围 | 权限 | 用途 |
|---|---|---|
| Account | Workers Scripts → Edit | 部署 Worker |
| Account | D1 → Edit | 建库、跑迁移 |
| Account | Workers KV Storage → Edit | 建 namespace |
| Account | Workers R2 Storage → Edit | 建 bucket |
| User | User Details → Read | `wrangler whoami` |

外加 Account ID。**不需要** Zone / Workers Routes 权限（本次不绑自定义域名）。

传递方式：用户经 `!` 前缀在本会话设成环境变量，不写入任何文件、不贴进聊天正文。

## 10. 验证清单

部署后逐项确认：

1. `wrangler deploy` 输出里的 binding 不含任何 `REPLACE_ME`。
2. 线上首页返回 200。
3. `/docs/getting-started` 返回 200 且渲染中文标题「快速开始」。
4. `/docs/cloudflare` 等四个新章节均 200。
5. `/api/auth/*` 返回业务错误（如 400 / 422）而非 500 —— 500 说明
   `BETTER_AUTH_SECRET` 未生效或 D1 未连上。
6. `pnpm check:client-bundle` 通过（无服务端 secret 泄漏进客户端）。
7. `pnpm check` / `pnpm test` / `pnpm build` 本地全绿。
8. 合并后 CI 绿 → deploy workflow 触发并成功。

## 11. 风险与回退

| 风险 | 应对 |
|---|---|
| Worker 名 `saas-template` 在账号下已被占用 | 部署前先查；冲突则改名并同步更新文档 |
| D1 / KV 同名资源已存在 | 先 list 查重，复用已有 ID 而非重复创建 |
| 首次部署失败 | 不改动任何既有资源；创建出的资源可 `wrangler d1 delete` / `kv namespace delete` / `r2 bucket delete` 回收 |
| 改了 `wrangler.jsonc`（核心区）触发全量回归 | 属预期；本地先跑 `pnpm test` 与 `pnpm test:e2e` 再提交 |
| `.env.production` 被误提交 | 已加入 `.gitignore`；提交前 `git status` 复核 |

## 12. 提交划分

按「结构变更与行为变更分开」的纪律，拆成若干提交：

1. 结构：`.gitignore` 补 `.env.production`；删除 `.env` 的 `BETTER_AUTH_URL`（本地文件，不入库）。
2. 行为：`check-env-prod.ts` 读 `.env.production`（含回退）+ 对应测试。
3. 行为：`package.json` 补两个迁移脚本 + `docs/deployment.md` / `docs/operations/wrangler-bindings.md` / `content/docs/getting-started.zh.md` 引用对齐。
4. 配置：`wrangler.jsonc` 回填 ID、注释 `send_email`。
5. 文档：四章新增 + `auth.zh.md` 补充 + `doc-icons.ts` 图标。
6. 行为：`.github/workflows/deploy.yml` 新增。
