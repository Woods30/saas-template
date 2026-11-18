---
title: 快速开始
description: 从克隆到上线的七个步骤
locale: zh
order: 1
group: start
updated: 2026-11-18
---

从克隆仓库到线上可访问，一共七步。每一步都给命令，跑完就能看到结果。

## 前提

| 需要 | 说明 |
|---|---|
| Node.js 22 / 24 | `package.json` 的 `engines` 允许 `^22.12.0`、`^24.0.0` 及更高 |
| pnpm | 版本由 `package.json` 的 `packageManager` 指定（当前 `pnpm@12.4.2`），不要用别的版本 |
| Cloudflare 账号 | 可选。没有也能先在本地跑通，部署与建资源时才需要 |
| PostgreSQL | 可选。生产想用 PostgreSQL 才需要，见[数据库](./database) |

## 步骤

1. **安装依赖。**

   ```bash
   pnpm install
   ```

2. **选数据库形态，生成 schema。**

   数据库形态由 `.env` 里的 `DATABASE_PROVIDER` 决定，缺省是 `sqlite`（本地 SQLite 文件）：

   ```bash
   # .env
   DATABASE_PROVIDER=sqlite   # sqlite | d1 | postgres
   ```

   ```bash
   pnpm db:setup
   ```

   它生成两样东西：`src/core/db/schema.ts`（当前方言的 schema 入口）与该方言的首份基线迁移。
   两者都是**生成物，不入库**——换方言时重新跑一次即可。详见[数据库](./database)。

3. **创建 Cloudflare 资源并写好本地环境变量。**

   ```bash
   pnpm run setup
   ```

   它在你的账号下建（或复用）D1 数据库与 KV namespace，把资源 ID 写回 `wrangler.jsonc`，
   把 `CLOUDFLARE_DATABASE_ID` 与 `BETTER_AUTH_SECRET` 写进 `.env`，并顺手应用一次本地迁移。
   它还会问你要不要 Stripe / Creem、哪种邮件 provider、要不要 Discord 通知，填了就一并写进 `.env`。

   已有的 `.env` 值不会被覆盖：重跑一次 `setup` 不会换掉你的 `BETTER_AUTH_SECRET`，也不会把
   已登录的人踢下线。

   R2 **不会**被自动创建——bucket 要先在 Cloudflare Dashboard 开通一次（需绑支付方式，API
   代劳不了），手动步骤见[文件存储](./storage)。没有登录 Cloudflare 时脚本只警告、继续执行，
   本地开发用 D1 的 SQLite 模拟，不需要真实资源：

   ```bash
   pnpm exec wrangler login
   ```

4. **写入种子配置。**

   ```bash
   pnpm db:seed -- --brand "Acme" --email hi@acme.dev
   ```

   种子是配置注册表里逐字段的默认值（品牌、SEO、社交、支付、邮件、模块开关，以及
   `.env` 里的凭据初值）。`--brand` 与
   `--email` 把出厂值换成你自己的；不传就用模板默认值，之后在后台「系统设置」页改也行。

   种子**只补缺失的**，不覆盖后台改过的值；要覆盖加 `--force`。

5. **启动开发服务器。**

   ```bash
   pnpm dev
   ```

   打开 `http://localhost:3000`。数据库没初始化成功就手动跑一次：

   ```bash
   pnpm run db:migrate:local
   ```

6. **改成你自己的项目。** 配置分两处：代码里的出厂值与数据库里的生效配置。

   - 数据库能改的（品牌名、SEO、社交链接、支付渠道、邮件、模块开关）：登录后进
     **设置 → 管理 → 系统设置**，保存后即时生效。
   - 代码里要改的：`package.json` 的包名、`public/manifest.json` 的 PWA 应用名、
     `messages/zh.json` 与 `messages/en.json` 里的品牌字样、`src/config/products.ts` 的商品、
     `src/config/website.ts` 的 Logo 与主题色素材路径。逐项见[网站配置](./configuration)。

7. **部署。**

   ```bash
   pnpm deploy
   ```

   依次跑生产 env 校验 → 构建 → 客户端 bundle 泄漏检查 → `wrangler deploy`。

## 验证

- 本地：浏览器打开 `http://localhost:3000`，首页正常渲染即通过。
- 线上：`pnpm deploy` 输出里带线上地址（`<Worker 名>.<账号子域>.workers.dev`），能打开即通过。

## 注意事项

- secret 绝不能带 `VITE_` 前缀：`VITE_` 变量在构建时就被内联进浏览器 bundle，任何访客都能
  看到。`pnpm check:client-bundle` 会扫描构建产物，发现泄漏即失败。
- 本地 `.env` 里的值**不会**自动变成生产 secret。生产值要单独配（GitHub production
  Environment 或 `wrangler secret put`），见[环境变量](./environment)。
- 部署前把 `.env.production` 的 `VITE_BASE_URL` 改成真实 HTTPS 域名，
  `pnpm check:env:prod` 会拒绝 `localhost` 与占位域名。
- **迁移不入库**：改了 schema 要在本地 `pnpm db:generate` 生成迁移，再手工 apply 到目标库。
  线上库不会自动跟着代码走。

配好后可以接着看[网站配置](./configuration)与[部署到 Cloudflare](./cloudflare)。
