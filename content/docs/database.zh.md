---
title: 数据库
description: Cloudflare D1 的创建、迁移与 Drizzle 接线
locale: zh
order: 15
group: config
updated: 2026-10-16
---

数据存在 **Cloudflare D1**（SQLite），经 **Drizzle ORM** 访问。表结构在 `src/db/schema.ts`，
迁移文件在 `src/db/migrations/`。

## 设置

### 配置 API Token

Token 需含 **Account → D1 → Edit**。见 [Cloudflare](./cloudflare)。

### 创建数据库

```bash
pnpm exec wrangler d1 create saas-template-db
```

输出里的 `database_id` 要回填到 `wrangler.jsonc`：

```jsonc title="wrangler.jsonc"
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "saas-template-db",
      "database_id": "f0aed9d8-0cca-4cb7-9ec6-be6b67ce7e69",
      "migrations_dir": "./src/db/migrations"
    }
  ]
}
```

`wrangler d1 create` 会问「是否帮你写入配置」。**选否，手工回填**——该命令经 JSON 序列化写入，会把 `wrangler.jsonc` 里的注释全部抹掉。

> **注意事项**：`binding` 是代码里读的名字（`env.DB`），必须与 `src/types/cloudflare.d.ts` 的声明一致。`database_name` 只是标识，改名不影响代码。

### 应用迁移

本地与远程分开：

```bash
pnpm run db:migrate:local    # 本地开发库
pnpm run db:migrate:remote   # 远程生产库
```

远程迁移会要求确认，非交互环境自动跳过。每个迁移成功后输出 ✅。

> **含 `DROP TABLE` 的迁移先查数据**：`0002` 用 `apikey` 表替换了旧的 `api_keys`，会
> `DROP TABLE api_keys`。上远程前先确认该表无数据，否则会丢：
>
> ```bash
> pnpm exec wrangler d1 execute DB --remote --command "SELECT COUNT(*) FROM api_keys;"
> ```
>
> **若非 0，先停止并备份**（`wrangler d1 export DB --remote --output backup.sql`），
> 再决定是否迁移。旧的 `api_keys` 是模板占位表，正常从未写入过数据。

验证表结构：

```bash
pnpm exec wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

应看到 `users`、`sessions`、`accounts`、`verifications`、`apikey`、`files`、`payments`、
`subscriptions`、`newsletter_subscriptions`、`webhook_events` 十张业务表。

`sessions` 表含 `impersonated_by` 列（better-auth admin 插件记录 impersonate 发起者）。

### 本地开发库

`pnpm dev` 用的是 `.wrangler/state` 下的本地 SQLite，与远程库完全隔离。首次需建表：

```bash
pnpm run db:migrate:local
```

## 使用方法

### 代码侧

Drizzle 实例按请求创建，不读全局单例：

```ts
// src/db/index.ts
import { drizzle } from 'drizzle-orm/d1'

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}
```

`src/auth/auth.ts` 在每次请求里 `createDb(env.DB)`，保证 Workers 的多请求并发下不串数据。

### 改表结构

改 `src/db/schema.ts` 后生成迁移：

```bash
pnpm run db:generate
```

它按 `drizzle.config.local.ts` 的配置，把 schema 与 `src/db/migrations/` 的现状做 diff，
产出一个新的 `.sql`。**检查生成的 SQL 后再提交**——`generate` 对重命名列会理解成「删旧列 + 加新列」，会丢数据。

然后 `pnpm run db:migrate:local` 与 `db:migrate:remote` 分别应用。

### 可视化

```bash
pnpm run db:studio:local    # 本地库
pnpm run db:studio:remote   # 远程库（需 CLOUDFLARE_* 三个字段）
```

远程 Studio 读 `drizzle.config.ts` 的 `dbCredentials`，要求 `.env` 里有
`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_DATABASE_ID`、`CLOUDFLARE_API_TOKEN`。

## 命令一览

| 命令 | 作用 |
|---|---|
| `pnpm run db:generate` | 由 schema 变更生成迁移文件 |
| `pnpm run db:migrate:local` | 应用迁移到本地库 |
| `pnpm run db:migrate:remote` | 应用迁移到远程库 |
| `pnpm run db:studio:local` | 打开本地 Drizzle Studio |
| `pnpm run db:studio:remote` | 打开远程 Drizzle Studio |
| `pnpm exec wrangler d1 execute DB --remote --command "..."` | 远程执行任意 SQL |

## 最佳实践

- **迁移文件入库**：`src/db/migrations/` 必须提交，否则别的环境无法重建表结构。
- **不用 `db:push` 改生产**：直接推 schema 会绕过迁移历史，多环境无法对齐。
- **改表前先备份**：`wrangler d1 export DB --remote --output backup.sql`。
- **迁移是单向的**：D1 不支持回滚，写迁移前想清楚。加列比重命名列安全。
- **本地先跑通再上远程**：`db:migrate:local` 验证 SQL 无误后再 `db:migrate:remote`。

## 参考资料

- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/)
- [Wrangler d1 命令](https://developers.cloudflare.com/workers/wrangler/commands/#d1)
- [Drizzle <> Cloudflare D1](https://orm.drizzle.team/docs/connect-cloudflare-d1)
- [Drizzle Kit 迁移](https://orm.drizzle.team/docs/kit-overview)

## 下一步

- [Cloudflare](./cloudflare)——API Token 与部署流程
- [缓存](./cache)——KV 缓存
- [身份认证](./auth)——用户 / 会话表的使用方
- [环境变量](./environment)——`CLOUDFLARE_*` 字段
