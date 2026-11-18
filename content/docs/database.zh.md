---
title: 数据库
description: 数据库形态的选择、schema 生成、迁移与表结构变更
locale: zh
order: 6
group: deploy
updated: 2026-11-18
---

数据经 **Drizzle ORM** 访问，支持三种形态：**本地 SQLite**、**Cloudflare D1**、**PostgreSQL**。
形态由环境变量 `DATABASE_PROVIDER` 决定，它同时决定「运行时连什么库」与「构建期生成哪份
schema」。

## 选形态

| provider | 连什么 | 迁移目录 | 适用 |
|---|---|---|---|
| `sqlite`（默认） | 本地 SQLite 文件 | `src/core/db/migrations/sqlite` | 本地开发、自托管 |
| `d1` | Cloudflare D1 | `src/core/db/migrations/sqlite` | 部署在 Cloudflare |
| `postgres` | PostgreSQL | `src/core/db/migrations/postgres` | 生产推荐 |

```bash
# .env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgres://user:pass@host:5432/dbname
```

`DATABASE_PROVIDER` 填错会直接报错，不会静默退回 sqlite。

## schema 是生成物

方言由 Drizzle 的 `sqlite-core` 与 `pg-core` 决定，两者的表定义不通用，因此本仓**手写两份**
schema：

| 文件 | 内容 |
|---|---|
| `src/core/db/schema.sqlite.ts` | SQLite / D1 方言 |
| `src/core/db/schema.postgres.ts` | PostgreSQL 方言 |

`src/core/db/schema.ts` 是**生成物**，内容只有一行重导出（`export * from './schema.sqlite'`），
由 `pnpm db:setup` 产出：

```bash
pnpm db:setup
```

它做两件事：写出 schema 入口；在该方言还没有迁移时生成首份基线迁移。两者都**不入库**
（`.gitignore` 已忽略），换方言时重跑一次即可。

运行时会校验方言：`DATABASE_PROVIDER` 与生成物的方言不一致时直接抛错并提示重跑
`pnpm db:setup`。不一致时 SQL 会静默跑错方言，错误往往出现在很远的调用栈上。

## 迁移

迁移同样不入库——**库结构的事实源是手写 schema**，迁移是本地生成的产物：

```bash
pnpm run db:generate          # 由 schema 变更生成迁移文件
pnpm run db:migrate:local     # 应用到本地 D1
pnpm run db:migrate:remote    # 应用到远程 D1
pnpm run db:migrate:pg        # 应用到 PostgreSQL
```

> **发布清单里的一条硬要求**：生产 schema 变更必须本地生成迁移后手工 apply。迁移不入库，
> 线上库不会自动跟着代码走——忘了 apply，线上会静默落后于代码。

## 种子数据

```bash
pnpm db:seed -- --brand "Acme" --email hi@acme.dev
pnpm db:seed:remote
pnpm db:seed:pg
```

种子写入站点配置的逐字段默认值（注册表 + `.env` 初值），只补缺失的（`DO NOTHING`），
不覆盖后台改过的值；`--force`
才覆盖。后续里程碑的 RBAC 权限点、分类等也在这里追加。

## 用法

Drizzle 实例按 provider 建立：

```ts
// src/core/db/index.ts
export function createDbFromEnv(env: DbEnv): DB
```

- **sqlite / d1**：走 D1 binding（本地由 wrangler 的 SQLite 模拟提供），实例按 binding 复用。
- **postgres**：按**请求作用域**建立连接。Workers 的 isolate 可能在请求之间被冻结，
  跨请求复用的 TCP 连接会失效，因此连接不能跨请求缓存。

**D1 没有交互式事务**：drizzle 的 `db.transaction()` 会发 `BEGIN` / `COMMIT`，D1 直接拒绝。
`atomic()` 因此只在 PostgreSQL 上包真事务，在 D1 上靠单条条件更新保证原子性
（`UPDATE ... WHERE balance >= amount`）。这条约束会直接影响账本模块的写法。

## 验证

```bash
pnpm exec wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

应看到 `users`、`sessions`、`accounts`、`verifications`、`subscriptions`、`payments`、
`checkout_reservations`、`files`、`apikey`、`newsletter_subscriptions`、`webhook_events`、
`settings`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm run db:setup` | 生成 schema 入口与首份基线迁移 |
| `pnpm run db:generate` | 由 schema 变更生成迁移文件 |
| `pnpm run db:migrate:local` | 应用迁移到本地库 |
| `pnpm run db:migrate:remote` | 应用迁移到远程 D1 |
| `pnpm run db:migrate:pg` | 应用迁移到 PostgreSQL |
| `pnpm run db:seed` | 写入种子配置 |
| `pnpm run db:studio:local` | 本地 Drizzle Studio |
| `pnpm run db:studio:remote` | 远程 Drizzle Studio |
| `pnpm exec wrangler d1 execute DB --remote --command "..."` | 远程执行任意 SQL |

## 注意事项

- **两份 schema 要同步改。** 新增表必须同时改 `schema.sqlite.ts` 与 `schema.postgres.ts`；
  `tests/unit/schema-parity.test.ts` 会逐表逐列比对，但索引与约束靠 code review。
- **检查生成的 SQL 再提交。** `db:generate` 对重命名列会理解成「删旧列 + 加新列」，会丢数据；加列比重命名列安全。
- 远程 Studio 直接读 `process.env`，需要环境里有 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_DATABASE_ID`、`CLOUDFLARE_API_TOKEN`。
- 自动部署会先应用远程迁移再部署，发布前自己审一遍迁移。
- `pnpm dev` 用的是 `.wrangler/state` 下的本地 SQLite，与远程库完全隔离。
