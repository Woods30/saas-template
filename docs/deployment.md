# 部署

面向维护者的部署步骤。面向模板使用者的版本见文档站
`content/docs/cloudflare.zh.md`（含 API Token 权限清单与自动部署流水线）。

## 前置

- Cloudflare 账号
- Scoped API Token，写入 `.env` 的 `CLOUDFLARE_API_TOKEN`；Account ID 写入
  `CLOUDFLARE_ACCOUNT_ID`。所需权限见 `content/docs/cloudflare.zh.md`
- 一个 workers.dev 子域（首次部署前创建；**创建后无法经 API 改名**，只能去
  Dashboard → Workers & Pages → Your subdomain → Change）

## 步骤

### 1. 创建资源并回填绑定

```bash
pnpm exec wrangler d1 create saas-template-db
pnpm exec wrangler kv namespace create saas-template-cache
pnpm exec wrangler r2 bucket create saas-template-uploads   # 需先在 Dashboard 开通 R2
```

把 D1 的 `database_id` 与 KV 的 `id` 回填到 `wrangler.jsonc`。
**不要**用 `wrangler d1 create --update-config`——它会经 JSON 序列化抹掉该文件的注释。

`pnpm run setup` 可交互式完成以上步骤，但它同样会重写 `wrangler.jsonc`（丢注释），
且默认只跑本地迁移。生产部署建议手工执行本节命令。

> R2 未开通时 API 返回 `code 10042`，`r2_buckets` 块在仓库里默认被注释掉。
> 开通后取消注释再部署。

### 2. 应用迁移

```bash
pnpm run db:migrate:remote
```

### 3. 配置运行时 secret

```bash
printf '%s' "$BETTER_AUTH_SECRET" | pnpm exec wrangler secret put BETTER_AUTH_SECRET
printf '%s' "https://<your-domain>" | pnpm exec wrangler secret put BETTER_AUTH_URL
```

`wrangler deploy` 不会清除已有 secret，重复部署幂等。启用其他模块时按需追加：
`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`RESEND_API_KEY`、`DISCORD_WEBHOOK_URL`。

### 4. 准备生产环境变量

```bash
cp .env.example .env.production
```

至少改两处：`VITE_BASE_URL` 设为真实 HTTPS 域名、`BETTER_AUTH_SECRET` 填生产密钥。
该文件已被 `.gitignore` 忽略。`check-env-prod.ts` 与 `vite build` 都读它。

### 5. 部署

```bash
pnpm deploy
```

依次执行：生产 env 校验 → 构建 → 客户端 bundle 泄漏检查 → `wrangler deploy`。

## 部署后验证

```bash
B=https://<your-domain>
curl -s -o /dev/null -w '%{http_code}\n' "$B/"                      # 200
curl -s -o /dev/null -w '%{http_code}\n' "$B/docs/getting-started"  # 200
curl -s "$B/api/auth/get-session"                                   # null（无会话）
```

`/api/auth/*` 返回 500 通常意味着 `BETTER_AUTH_SECRET` 未生效（Worker secret 没设，
或 `NODE_ENV` 被 `wrangler.jsonc` 的 `vars` 定为 `production` 而 secret 缺失）。

部署前可用 `pnpm exec wrangler deploy --dry-run` 检查实际绑定的资源，能提前发现
`REPLACE_ME` 这类占位符。

## 本地预览

```bash
pnpm build
pnpm preview
```

## 自动部署

`main` 的 CI 通过后由 `.github/workflows/deploy.yml` 自动部署。所需 GitHub Secrets
见 `content/docs/cloudflare.zh.md`。

## Workers 绑定

详见 [docs/operations/wrangler-bindings.md](operations/wrangler-bindings.md)。
