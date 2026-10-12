# ADR-0001: 为什么选择 Cloudflare Workers 作为运行时

- **状态**：Proposed（待项目骨架落地后转为 Accepted）
- **日期**：2026-10-12

## 背景

`saas-template` 需要为 SaaS 开发者提供一个能在全球边缘、低成本、零冷启动运行的
部署目标。模板需要兼顾运行时、数据库、缓存、对象存储、邮件、AI 一条龙。

## 决策

采用 **Cloudflare Workers** + **D1** + **KV** + **R2** + **Email Service** 组合：

| 维度       | 选择                                              | 替代方案                  |
| ---------- | ------------------------------------------------- | ------------------------- |
| 边缘运行时 | Cloudflare Workers                                 | Vercel / Netlify / Bun 自托管 |
| 数据库     | Cloudflare D1（SQLite）                            | Neon Postgres / Turso     |
| 缓存       | Cloudflare KV                                       | Upstash Redis             |
| 对象存储   | Cloudflare R2                                       | AWS S3                    |
| 邮件       | Cloudflare Email Service（主） + Resend（备）       | SendGrid / Postmark       |

## 后果

- ✅ 单一供应商（一家 Cloudflare 账号覆盖全部基础设施），运维成本接近零。
- ✅ 与参考 TanStarter 完全对齐，未来从 TanStarter fork 升级方便。
- ✅ Workers + D1 在免费层即可跑生产 SaaS（中等流量）。
- ⚠️ Workers 运行时不是 Node.js，部分 npm 包不可用（特别是含 native binding 的）。
  需选用 Workers 兼容的纯 JS 实现。
- ⚠️ D1 是 SQLite，方言与 Postgres 略有差异（如不支持部分 `ALTER TABLE` 操作）。
  复杂迁移需要绕行（参考 trade-off：Drizzle 的 SQLite dialect 已规避大部分问题）。
- ⚠️ Cloudflare Email Service 需要 Onboard Domain 流程，开发者首次配置成本略高。

## 后续行动

- 在 `wrangler.jsonc` 集中声明所有 binding（DB、CACHE、BUCKET、EMAIL、AI）。
- 提供 `pnpm run setup` CLI 完成 Cloudflare 资源创建与 binding 注入。
- README 中文教程中标注"使用 `localhost`（而非 `127.0.0.1`）进行本地开发"，
  cookie 与 OAuth origin 行为依赖 `localhost`。