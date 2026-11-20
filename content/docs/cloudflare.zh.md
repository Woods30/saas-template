---
title: 部署到 Cloudflare
description: 从账号与 Token 到首次部署与自动部署
locale: zh
order: 5
group: deploy
updated: 2026-11-03
---

站点跑在 **Cloudflare Workers** 上。这页带你配好账号与 Token、完成首次部署，并接上发布
Release 后的自动部署；数据库、缓存、存储各自的接线见后续三页。

## 步骤

1. **创建 API Token。** 在 [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   点 **Create Token** → **Create Custom Token**，按需勾权限：

   | 权限 | 何时需要 |
   |---|---|
   | Account → Workers Scripts → Edit | **必需**，部署 Worker |
   | Account → D1 → Edit | 用 D1 时 |
   | Account → Workers KV Storage → Edit | 用 KV 缓存时 |
   | Account → Workers R2 Storage → Edit | 用 R2 存储时 |
   | Account → Workers Routes → Edit | 绑自定义域名时 |
   | Account → Email Routing Addresses → Edit | 用 Cloudflare Email 发信时 |

   把 `CLOUDFLARE_ACCOUNT_ID` 与 `CLOUDFLARE_API_TOKEN` 写进 `.env`，再用
   `pnpm exec wrangler whoami` 验证。

2. **配置 workers.dev 子域。** 它决定线上地址 `<worker 名>.<账号子域>.workers.dev`。
   `wrangler whoami` 不显示子域，用 API 查：

   ```bash
   curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
   ```

   返回 `code 10007` 表示还没建，改用 `PUT` 同一路径创建即可。**子域建后不能经 API 改名**，
   只能去 Dashboard 改，第一次就取个满意的名字。

3. **配置项目名。** `wrangler.jsonc` 的 `name` 决定 Worker 名与线上地址，与 `package.json`
   的 `name` 无关：

   ```jsonc title="wrangler.jsonc"
   { "name": "<your-worker-name>" }
   ```

4. **首次部署。** `pnpm deploy` 依次跑生产 env 校验 → 构建 → 客户端 bundle 泄漏检查 →
   `wrangler deploy`。部署前先备好三样：`.env.production` 的 `VITE_BASE_URL` 是真实 HTTPS
   域名；`wrangler.jsonc` 的 D1 与 KV 绑定 ID 已回填；运行时 secret 已设置
   （`pnpm exec wrangler secret put BETTER_AUTH_SECRET`，值从管道喂进去，别留在命令历史里）。
   成功时输出里会带线上地址。

5. **绑定自定义域名（可选）。** 域名必须托管在**同一个 Cloudflare 账号**，然后加路由：

   ```jsonc title="wrangler.jsonc"
   "routes": [{ "pattern": "<your-domain.com>", "custom_domain": true }]
   ```

   改完同步更新 `.env.production` 的 `VITE_BASE_URL` 与 `BETTER_AUTH_URL` 并**重新部署**。
   跨账号把 CNAME 指向 `workers.dev` 会被 Cloudflare 拦截（错误 1014）。

6. **接上自动部署。** 仓库 **Settings → Environments** 建 `production` 环境，按下表填值。

## 自动部署

| 触发 | 行为 |
|---|---|
| 推送或合并 `main` | 只跑 CI，不部署 |
| 发布 GitHub Release（tag 与 `package.json` 版本一致） | 部署生产 |
| 手动 `gh workflow run deploy.yml`（ref 必须是 `main`） | 部署生产 |

两条入口都要求该提交在 `main` 上的 CI 已成功。工作流按名字在目标账号里查找或创建 D1 与
KV、把资源 ID 回填 `wrangler.jsonc`，然后**先应用远程 D1 迁移**再部署，最后冒烟检查 `/`
与 `/pricing`。

`production` 环境里填什么：

| 类型 | 名称 | 说明 |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | 部署 token，权限按上面的表勾 |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID |
| Variable | `VITE_BASE_URL` | 生产站点完整 origin，不带路径 |
| Secret | `BETTER_AUTH_SECRET` | 至少 32 字符；已有站点沿用原值以免会话失效 |
| Secret | `CONFIG_ENCRYPTION_KEY` | 配置密钥的加密口令（≥ 16 字符）；缺失时后台存不了密钥 |
| Variable | `BETTER_AUTH_URL` | 可选，缺省取 `VITE_BASE_URL` |
| Variable | `ADMIN_EMAILS` | 管理员邮箱列表 |
| Variable | `DEPLOY_SKIP_CUSTOM_DOMAIN` | 设为 `true` 时只发到 `workers.dev`，不绑自定义域名 |

工作流只上传白名单里的运行时字段。**业务凭据（Resend / Stripe / Creem / GA / Discord 等）不在
这里**：它们部署后在后台「系统设置」里填写（加密入库），或用带 env 的 `pnpm db:seed` 写进
远端库。首部署后到后台把支付、邮件配好，站点才算完整可用。

## 构建期变量与运行时 secret

| 类型 | 怎么设 | 何时生效 | 例子 |
|---|---|---|---|
| 构建期（`VITE_*`） | 本地 `.env.production` / GitHub Variables | `vite build` 时**内联进 bundle** | `VITE_BASE_URL` |
| 运行时 | `wrangler secret put` / 部署时上传 | Worker 执行期经 `env` 读取 | `BETTER_AUTH_SECRET` |

**构建期变量改了必须重新构建并部署才生效**——它们已经是客户端 JS 里的字面量。
`BETTER_AUTH_SECRET` 两处都出现但用途不同：`.env.production` 那份只为让生产校验通过，
运行时读的是 Worker secret，**两者必须是同一个值**。

业务凭据是第三种：部署后写入数据库，改完保存即生效，既不用重建也不用改 secret。

## 验证

`pnpm run check:env:prod` 是生产环境变量校验（deploy 的前置），`pnpm run check:client-bundle`
在构建后扫描客户端 bundle 是否泄露服务端字段。线上再确认 `/` 与 `/pricing` 返回 200，且 `/api/auth/get-session`
正常响应（认证模块默认开启）。

## 注意事项

- 账号级 Token 调 `GET /user/tokens/verify` 会返回 `code 1000 Invalid API Token`，这是预期行为，用 `wrangler whoami` 验证即可。
- `wrangler deploy` 不会清除已有 secret；删掉 GitHub Secret 也不会删远端同名值，要停用得去 Cloudflare 单独删。
- 只在 Cloudflare 改了值的话，下次自动部署会被 GitHub 配置覆盖回来。
