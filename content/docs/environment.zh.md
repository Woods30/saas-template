---
title: 环境变量
description: 启动必需项、种子初值与生产配置
locale: zh
order: 4
group: config
updated: 2026-11-19
---

环境变量只剩**启动必需项**。支付 / 邮件 / 通知 / 分析的凭据都在数据库配置里，
env 只在 `pnpm db:seed` 时作为初值写进去，运行期不再读取——见
[网站配置](./configuration) 与 `docs/adr/0010-settings-in-database.md`。

业务代码**不得**直接读 `process.env` / `import.meta.env`，一律经
`src/core/env/public.ts`、`src/core/env/server.ts`。

| 文件 | 内容 |
|---|---|
| `src/core/env/public.ts` | 公开项，构建时内联进客户端 bundle；现在只有 `VITE_BASE_URL` |
| `src/core/env/server.ts` | `ServerEnv`（启动必需）+ `ManagedEnv`（由数据库配置派生的凭据形状） |

**`VITE_` 变量会出现在浏览器里。** 它在构建时被写死进客户端 JS，任何访客打开页面都能看到。
secret 绝不能带 `VITE_` 前缀：`pnpm check:client-bundle` 会扫描 `dist/client` 的文本产物，
发现服务端字段就失败（它需要先跑 `pnpm build`）。

## 启动必需项

| 变量 | 约束 | 说明 |
|---|---|---|
| `VITE_BASE_URL` | URL | 站点根地址，用于 canonical、OG 与 sitemap；生产必须是 HTTPS 域名 |
| `BETTER_AUTH_SECRET` | ≥ 32 字符 | 认证，**生产必填** |
| `BETTER_AUTH_URL` | URL | 认证回调的绝对地址；留空时从请求 origin 推断 |
| `CONFIG_ENCRYPTION_KEY` | ≥ 16 字符 | 配置密钥的加密口令；缺失时后台拒绝保存含密钥的配置组 |
| `DATABASE_PROVIDER` | `sqlite` / `d1` / `postgres` | 运行时连什么库、构建期生成哪份 schema |
| `DATABASE_URL` | 连接串 | `postgres` 时必填 |
| `SQLITE_DATABASE_URL` | 文件路径 | `sqlite` 时的本地库文件 |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | — | 部署与资源 API |
| `ADMIN_EMAILS` | 逗号分隔 | `/api/email` 的收件人白名单 |
| `NODE_ENV` | `development` / `production` / `test` | 默认 `development` |

空字符串会被归一化为未设置，`.env` 里留空等同于不配。

`CONFIG_ENCRYPTION_KEY` 必须与数据库分开保管：它丢了，`settings` 表里的密文就再也解不开，
只能到后台重填。换库时不要连着换口令，否则旧密文全部失效。

Workers 的资源 binding（`DB` / `CACHE` / `BUCKET` / `EMAIL`）不走 env schema，由
`wrangler.jsonc` 声明。

## 种子初值

`.env.example` 里还有一组带 `envKey` 的字段（`RESEND_API_KEY`、`STRIPE_SECRET_KEY`、
`VITE_GA_ID` 等）。它们**只在 `pnpm db:seed` 时被读一次**，抄进 `settings` 表后以数据库为准：

```bash
cp .env.example .env   # 填写凭据
pnpm db:setup
pnpm db:seed           # 写入数据库；之后改配置走后台「系统设置」
```

留空的项保持注册表默认值。想改已写入的值，后台保存即可；要重新以 env 覆盖，跑
`pnpm db:seed --force`。

## 本地文件与生产文件

本地开发值放 `.env`（从 `.env.example` 复制而来），生产值放 `.env.production`：

```bash
cp .env.example .env.production
```

`pnpm check:env:prod` 在 `.env.production` **存在时**以它为准，不回退 `.env`——否则生产配置
写错会被本地合法值掩盖。它只校验启动必需项：服务凭据在数据库里，静态校验读不到。
`vite build` 则两个文件都加载，同名键以 `.env.production` 为准。
两个文件都已被 git 忽略，不得入库。优先级（高 → 低）：进程 env → `.env.production` →
`.env`，所以 CI 里不必创建该文件，直接用 workflow 的 `env:` 块即可。

## 生产怎么配

两种入口，都不经过仓库里的文件：

- **GitHub Environment。** 在仓库 Settings → Environments → `production` 里放 Secret 与
  Variable，`deploy.yml` 在发布 Release 或手动触发时读取它们，并只把白名单里的运行时字段
  上传到 Worker。启用新的启动必需项时要同步往工作流的 `env:` 与上传白名单里加字段，
  否则配了也不生效。
- **手工部署。** 先在 Worker 上设置运行时 secret：

  ```bash
  printf '%s' "<your-secret>" | pnpm exec wrangler secret put BETTER_AUTH_SECRET
  ```

  构建期变量（`VITE_*`）改了必须**重新构建并部署**才生效；运行时 secret 改完即生效。

业务凭据（Stripe / Resend / GA 等）在部署后的后台「系统设置」里填写，或带 env 在本地跑
`pnpm db:seed` 写远端库。

配好后可以接着看[部署到 Cloudflare](./cloudflare)。
