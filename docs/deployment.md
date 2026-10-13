# 部署

## 前置

- Cloudflare 账号
- `wrangler` CLI（`pnpm dlx wrangler --version`）
- 域名（可选）

## 步骤

1. **`pnpm run setup`** — 交互式创建 D1 数据库、R2 bucket、KV namespace，并写入 `.env` 与 `wrangler.jsonc`。支持配置 Stripe、邮件 provider（Resend / Cloudflare Email）、Discord Webhook。
2. **`pnpm run db:migrate:remote`**（如需要）— 将 migrations 应用到远程 D1。setup 脚本默认已执行本地迁移。
3. 配置 secrets（`wrangler secret put <NAME>`）：
   - `BETTER_AUTH_SECRET`（setup 脚本已自动生成并写入 `.env`）
   - `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`（如使用 Stripe）
   - `RESEND_API_KEY`（如使用 Resend）
   - `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`（如使用 Cloudflare Email）
   - `DISCORD_WEBHOOK_URL`（如启用 Discord 通知）
4. **`pnpm run deploy`** — 生产 env 校验 → 构建 → 客户端 bundle 检查（确保无 secret 泄漏）→ `wrangler deploy`。
5. （可选）**`pnpm run deploy --env staging`** — 部署到 staging 环境。

## 本地预览

```bash
pnpm build
pnpm preview
```

## 域名

在 Cloudflare Dashboard → Workers → 你的 Worker → Triggers → Custom Domains 添加 `yourdomain.com`。

## Workers 绑定

详见 [docs/operations/wrangler-bindings.md](operations/wrangler-bindings.md)。
