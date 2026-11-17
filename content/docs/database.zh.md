---
title: 数据库
description: Cloudflare D1 的创建、迁移与表结构变更
locale: zh
order: 6
group: deploy
updated: 2026-11-03
---

数据存在 **Cloudflare D1**（SQLite），经 **Drizzle ORM** 访问。表结构在 `src/core/db/schema.ts`，
迁移文件在 `src/core/db/migrations/`。

## 步骤

1. **创建 D1 数据库。** 最省事的是跑 `pnpm run setup`：它会在账号下建好 D1 与 KV、把资源 ID
   回填 `wrangler.jsonc`、并写好 `.env`。手动建则是：

   ```bash
   pnpm exec wrangler d1 create <your-db-name>
   ```

   把输出里的 `database_id` 回填到 `wrangler.jsonc`：

   ```jsonc title="wrangler.jsonc"
   {
     "d1_databases": [
       {
         "binding": "DB",
         "database_name": "<your-db-name>",
         "database_id": "<your-database-id>",
         "migrations_dir": "./src/core/db/migrations"
       }
     ]
   }
   ```

   命令问「是否帮你写入配置」时**选否、手工回填**——它经 JSON 序列化写入，会把
   `wrangler.jsonc` 里的注释全抹掉。`binding` 是代码里读的名字（`env.DB`），须与
   `src/types/cloudflare.d.ts` 一致。

2. **应用迁移。** 本地与远程分开：

   ```bash
   pnpm run db:migrate:local    # 本地开发库
   pnpm run db:migrate:remote   # 远程生产库
   ```

3. **改表结构。** 改完 `src/core/db/schema.ts` 先生成迁移，再应用：

   ```bash
   pnpm run db:generate
   pnpm run db:migrate:local
   ```

## 用法

Drizzle 实例由 `createDb(env.DB)` 按 D1 binding 创建，不读全局单例：

```ts
// src/core/db/index.ts
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}
```

`src/core/auth/auth.ts` 的 `createAuth(env)` 里调 `createDb(env.DB)`，实例按 binding 复用，保证
Workers 的多请求并发下不串数据。

## 验证

```bash
pnpm exec wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

应看到 `users`、`sessions`、`accounts`、`verifications`、`subscriptions`、`payments`、
`checkout_reservations`、`files`、`apikey`、`newsletter_subscriptions`、`webhook_events`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm run db:generate` | 由 schema 变更生成迁移文件 |
| `pnpm run db:migrate:local` | 应用迁移到本地库 |
| `pnpm run db:migrate:remote` | 应用迁移到远程库 |
| `pnpm run db:studio:local` | 本地 Drizzle Studio |
| `pnpm run db:studio:remote` | 远程 Drizzle Studio |
| `pnpm exec wrangler d1 execute DB --remote --command "..."` | 远程执行任意 SQL |

## 注意事项

- **检查生成的 SQL 再提交。** `db:generate` 对重命名列会理解成「删旧列 + 加新列」，会丢数据；加列比重命名列安全。
- 远程 Studio 直接读 `process.env`，需要环境里有 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_DATABASE_ID`、`CLOUDFLARE_API_TOKEN`。
- 自动部署会先应用远程迁移再部署，发布前自己审一遍迁移。
- `pnpm dev` 用的是 `.wrangler/state` 下的本地 SQLite，与远程库完全隔离。
