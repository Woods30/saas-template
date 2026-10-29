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

合并到 `main` 只运行 CI。发布**正式 GitHub Release**（`release.published`）后，Deploy 工作流才部署；草稿、预发布、单独推送 tag 均不触发生产部署。

流程为：PR → 合并 `main` → 等该提交的 CI 成功 → 发布与 `package.json` 版本一致的 tag（如 `v0.2.0`）→ Deploy → 冒烟检查。工作流要求 tag 对应提交属于 `main`，且该提交在 `main` 的 push CI 已成功，再按不可变 SHA 部署。若发布时 CI 尚未完成，待 CI 成功后在 Actions 中重新运行 Deploy。

### GitHub 配置

在仓库 **Settings → Environments** 创建 `production`。若配置部署分支规则，需允许版本 tag（如 `v*`）。在这个 Environment 中填写下表；同名仓库级配置也可使用。不要把真实值写进仓库。

| 类型 | 名称 | 值与用途 |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | 有 Workers Scripts Edit、D1 Edit、账号读取权限的部署 token；使用 KV 或自定义域名时按需增加对应权限 |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID，与 `wrangler.jsonc` 绑定资源所属账号一致 |
| Variable | `VITE_BASE_URL` | 生产站点完整 HTTPS origin，例如当前 Worker 地址或自定义域名，不带路径 |
| Variable | `BETTER_AUTH_URL` | 可选；默认使用 `VITE_BASE_URL`，用于服务端认证回调 |
| Secret | `BETTER_AUTH_SECRET` | 至少 32 字符；已有站点沿用原值，避免会话失效 |
| Secret | `STRIPE_SECRET_KEY` | Stripe 正式环境 API secret key；仅明确使用测试支付的演示站点使用测试 key |
| Secret | `STRIPE_WEBHOOK_SECRET` | 同一 Stripe 环境、指向 `<VITE_BASE_URL>/api/webhooks/stripe` 的端点签名密钥（`whsec_…`） |
| Secret | `DISCORD_WEBHOOK_URL` | Discord 频道 Webhook URL；开启通知模块时必填，当前已关闭 |
| Variable | `VITE_GA_ID` | GA4 Measurement ID（`G-…`）；开启分析模块时必填，当前已关闭 |

现有仓库 Secrets 中的 `CLOUDFLARE_ACCOUNT_ID`、`VITE_BASE_URL` 仍兼容，不强制迁移。其他公开配置请使用 Variables。Stripe 中还需在相同环境配置启用的 `jerbix_template`、USD 99、一次性价格；Webhook 事件配置见[支付文档](./payment)。不使用通知或分析时在 `src/config/website.ts` 关闭对应模块并合并，不能仅留空变量。

按需配置：Google 登录使用 Variable `GOOGLE_CLIENT_ID` 和 Secret `GOOGLE_CLIENT_SECRET`；Turnstile 使用 Variable `VITE_TURNSTILE_SITE_KEY` 和 Secret `TURNSTILE_SECRET_KEY`；管理员邮件列表使用 Variable `ADMIN_EMAILS`。工作流已映射这些字段。以后启用邮件、其他通知或分析服务时，也要同步增加其 workflow env 与运行时上传字段。

可用 CLI 交互录入（不会把值写进命令历史）：

```bash
gh secret set STRIPE_SECRET_KEY --env production
gh secret set STRIPE_WEBHOOK_SECRET --env production
gh secret set DISCORD_WEBHOOK_URL --env production
gh variable set VITE_GA_ID --env production
```

### 部署与迁移边界

工作流执行生产 env 校验、构建和客户端敏感字段扫描；随后通过 `wrangler deploy --secrets-file` 将白名单中的运行时字段与 Worker 版本一起上传。GitHub 是自动部署配置来源，无需再手工同步同一批 Worker secrets。临时 JSON 文件权限为仅当前用户读写，任务退出时删除，不输出 secret 值；Cloudflare 部署 token 不进入 Worker。

**工作流不执行生产 D1 迁移。** 发布前独立备份和审查迁移。`0008_payment_simplification.sql` 要求空白支付表，不可直接用于包含历史支付数据的生产库。`wrangler.jsonc` 中的 D1 / KV 绑定仍需指向正确资源。

上传是增量操作，省略的 Worker secrets 会保留；删除 GitHub Secret 不会自动删除远端同名值，停用凭据时需另外在 Cloudflare 删除。若只在 Cloudflare 修改值，下次自动部署会再次使用 GitHub 配置覆盖。

## 构建期变量与运行时 secret

这是本模板最容易踩的坑：

| 类型 | 怎么设 | 何时生效 | 例子 |
|---|---|---|---|
| **构建期**（`VITE_*`） | 本地 `.env.production` / GitHub Variables | `vite build` 时**内联进 bundle** | `VITE_BASE_URL` |
| **运行时** | 本地 `wrangler secret put` / Release 部署自动上传 | Worker 执行期经 `env` 读取 | `BETTER_AUTH_SECRET` |

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
