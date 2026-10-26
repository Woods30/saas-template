---
title: Cloudflare
description: 账号、Token、资源、首次部署与自动部署
locale: zh
order: 5
group: deploy
updated: 2026-10-21
---

站点跑在 **Cloudflare Workers** 上。这页带你配好账号与 Token，完成首次部署，并接上
推送到 `main` 就自动发布的流水线。

数据库、存储、缓存各自的接线见后续三页——先按这页配好凭据与 Token 权限，那几页才能执行。

## 前提条件

- 一个 Cloudflare 账号（[注册](https://dash.cloudflare.com/sign-up)，免费套餐够用）
- 本地已跑通 `pnpm dev`，见[快速开始](./getting-started)

## 设置

### 1. 创建 API Token

`wrangler` 支持两种认证：`wrangler login`（OAuth，交互式）与 API Token（非交互，CI
必需）。CI 用后者，本页讲后者。

在 [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) 点
**Create Token** → **Create Custom Token**，按需勾选：

| 范围 | 权限 | 何时需要 |
|---|---|---|
| Account | Workers Scripts → Edit | **必需**，部署 Worker |
| Account | D1 → Edit | 用 D1 时 |
| Account | Workers KV Storage → Edit | 用 KV 缓存时 |
| Account | Workers R2 Storage → Edit | 用 R2 存储时 |
| Account | Workers Routes → Edit | 绑自定义域名时 |
| Account | Email Routing Addresses → Edit | 用 Cloudflare Email 发信时 |

只跑核心（D1 + KV + Worker）不需要 Zone 与 R2 权限。

把 **Account ID** 与 **Token** 写进 `.env`：

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
```

验证：

```bash
pnpm exec wrangler whoami
```

输出应显示账号名与 ID，并注明 Token 来自环境变量。

> `GET /user/tokens/verify` 对 Account-scoped Token 会返回 `code 1000 Invalid API Token`。
> 这是**预期行为**，不代表 Token 无效。用 `wrangler whoami` 验证。

### 2. 配置 workers.dev 子域

首次部署前账号需要一个 workers.dev 子域，它决定线上地址：

```
<worker 名>.<账号子域>.workers.dev
```

`wrangler whoami` **不显示**子域。查：

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

返回 `code 10007` 说明尚未创建。经 API 创建：

```bash
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"subdomain":"your-subdomain"}'
```

> **子域创建后无法经 API 修改**——`PUT` 返回 `code 10036`，`PATCH` 返回 `code 10405`。
> 改名只能在 Dashboard 的 Workers & Pages → **Your subdomain** → **Change** 操作。
> **第一次就取一个满意的名字。**

子域是**单层标签**（如 `saas-template-demo`）。`demo.saas-template-demo.workers.dev`
拆开是「worker 名 = `demo`」+「账号子域 = `saas-template-demo`」。

### 3. 配置项目名

`wrangler.jsonc` 的 `name` 决定 Worker 名，进而决定线上地址：

```jsonc title="wrangler.jsonc"
{
  // 配账号子域 saas-template-demo → https://demo.saas-template-demo.workers.dev
  "name": "demo"
}
```

它与 `package.json` 的 `name` 是**两个独立字段**，后者只是 npm 包名。

### 4. 首次部署

```bash
pnpm deploy
```

依次执行：生产 env 校验 → 构建 → 客户端 bundle 泄漏检查 → `wrangler deploy`。

部署前必须完成三件事，否则会失败或产生坏配置：

1. `.env.production` 已建好，`VITE_BASE_URL` 是真实 HTTPS 域名（见[环境变量](./environment)）；
2. `wrangler.jsonc` 的 binding ID 已回填，**不含 `REPLACE_ME`**（见[数据库](./database)与[缓存](./cache)）；
3. 运行时 secret 已设置：

```bash
printf '%s' "$BETTER_AUTH_SECRET" | pnpm exec wrangler secret put BETTER_AUTH_SECRET
```

`wrangler deploy` **不会**清除已有的 secret，重复部署是幂等的。

首次成功后输出里会有线上地址：

```
Deployed demo triggers
  https://demo.saas-template-demo.workers.dev
```

### 5. 绑定自定义域名（可选）

域名需已托管在 Cloudflare（NS 指向 Cloudflare），然后在 `wrangler.jsonc` 加：

```jsonc title="wrangler.jsonc"
"routes": [
  { "pattern": "your-domain.com", "custom_domain": true }
]
```

绑定后同步改 `.env.production` 的 `VITE_BASE_URL` 与 `BETTER_AUTH_URL` 并**重新部署**
——前者在构建期内联，不改不生效。

> 绑自定义域名需要 Token 有 **Workers Routes → Edit** 权限，workers.dev 不需要。

## 自动部署

`main` 分支的 CI 通过后自动部署。用 `workflow_run` 而非独立的 `push` 触发器，是为了让
「CI 绿」成为部署的硬前置——两个 workflow 各跑各的时，CI 红了部署照样会发。

配置四个 GitHub Secret：

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set VITE_BASE_URL
gh secret set BETTER_AUTH_SECRET
```

| Secret | 用途 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | `wrangler deploy` 认证 |
| `CLOUDFLARE_ACCOUNT_ID` | 账号定位 |
| `VITE_BASE_URL` | 构建期内联进客户端 bundle |
| `BETTER_AUTH_SECRET` | 让 `check:env:prod` 通过 |

> CI 里**不创建** `.env.production` 文件，而是用 workflow 的 `env:` 块直接引用
> `secrets.*`。进程 env 优先级最高，`check-env-prod.ts` 在文件不存在时会回退到它，
> 这样 secret 不会落到 CI 磁盘上。

## 构建期变量与运行时 secret

这是本模板最容易踩的坑：

| 类型 | 怎么设 | 何时生效 | 例子 |
|---|---|---|---|
| **构建期**（`VITE_*`） | `.env.production` / GitHub Secret | `vite build` 时**内联进 bundle** | `VITE_BASE_URL` |
| **运行时** | `wrangler secret put` | Worker 执行期经 `env` 读取 | `BETTER_AUTH_SECRET` |

**构建期变量改了必须重新构建并部署才生效**——它们已经是客户端 JS 里的字面量了。

`BETTER_AUTH_SECRET` 在两处都出现但用途不同：`.env.production` 里那份只为让生产校验
通过，运行时读的是 Worker secret。**两者必须是同一个值。**

## 参考资料

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

## 下一步

- [数据库](./database)——D1 的创建与迁移
- [存储](./storage)——R2
- [缓存](./cache)——KV
- [环境变量](./environment)——`.env.production` 与两层校验
