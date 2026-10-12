# CONTEXT.md

本文件是工程 skill 在探查代码库前应优先消费的术语表与不变量清单。Sub-Plan A（基础设施）
落地后已回填；术语表将随后续 sub-plan（认证、支付、存储等）继续扩充。

## 项目定位

`saas-template` 是一个构建在 **Cloudflare Workers** 上的 **TanStack Start** SaaS 起步模板。
目标流程：`git clone` → 修改 `src/config/website.ts` → 部署。常见 SaaS 能力（认证、订阅、
邮件、文件、文档站、Newsletter、Admin、分析、SEO、PWA）逐步补齐。设计稿见
`docs/superpowers/specs/2026-10-12-saas-template-design.md`。

## 术语表

当前已落地（Sub-Plan A）：

- **websiteConfig**：`src/config/website.ts` 导出的站点集中配置，承载语言无关的名称、资源
  路径与功能开关；需随请求语言变化的文案不放在这里。
- **publicEnv / serverEnv**：`src/env/public.ts`、`src/env/server.ts` 导出的两层已校验环境
  变量对象，是所有 env 读取的唯一出口。
- **locale**：受支持语言，当前为 `zh`、`en`，默认 `zh`；`zh` 为消息源语言。
- **message**：`messages/{zh,en}.json` 中的文案键值，经 Paraglide 编译为类型化访问器 `m.*()`。
- **seo()**：`src/lib/seo.ts` 的路由 `head()` helper，生成 canonical 与 OG/Twitter meta。
- **provider / providerRegistry**：可插拔外部服务抽象（mail / payment / newsletter 等）。
  Sub-Plan A **尚未实现**，仅在设计中预留；后续 sub-plan 落地时在此登记。

## 关键不变量

- **env 两层模型**：业务代码**不得**直接读 `process.env` / `import.meta.env`，一律经
  `src/env/public.ts`、`src/env/server.ts`。
- **`VITE_` 前缀 = 公开**：`VITE_` 变量在构建时进入客户端 bundle，任何人可见，**不得**存放
  secret。
- **服务端 secret**：仅从 Workers binding 或服务端读取，**绝不能**设成 `VITE_` 前缀
  （例如 `BETTER_AUTH_SECRET`、`STRIPE_SECRET_KEY`）。
- **locale 协商**：按 cookie → `Accept-Language` → 默认语言的顺序解析；SSR 与 hydration
  共用 `src/lib/locale.ts` 的同一实现，保证两侧一致。
- **单一配置入口**：面向用户的配置集中在 `src/config/website.ts`；`websiteConfig` 在模块
  加载期求值，只放语言无关值。
- **消息键配对**：新增消息键必须在所有 locale 文件中同时存在，由 `scripts/check-locale.ts`
  双向校验。
- **Workers 运行时**：非 Node.js，含 native binding 的包不可用（见 `docs/adr/0001`）。

## 当前范围与状态

- **已完成（Sub-Plan A）**：TanStack Start + Cloudflare Workers 骨架、Tailwind v4 +
  shadcn/ui（Base UI / Tabler）、多语言（Paraglide JS）、`websiteConfig` 与 `seo()`、两层
  env 校验、locale 脚本与单元测试。
- **尚未实现**：认证、支付 / 订阅、文件存储、邮件、Newsletter、联系表单、管理后台、
  文档站、营销页面、PWA、Analytics、E2E、CI。
- **Node 下限**：`package.json` 的 `engines.node` 为 `>=22.12.0`（受 `vitest@5`、`wrangler`
  与 `@tanstack/react-start` 约束）。

## 决策日志索引

- `docs/adr/0001-why-cloudflare-workers.md` —— 为什么选择 Cloudflare Workers 作为运行时。

> 提醒：术语表与不变量应随每个 sub-plan 落地同步更新；后续模块的 provider 抽象在实现前
> 不要在此登记为既有概念。
