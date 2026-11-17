---
title: 目录结构
description: 每个目录负责什么，改东西该去哪里
locale: zh
order: 22
group: develop
updated: 2026-11-03
---

这是一张地图。找不到东西时先看这里，再去读对应文件。

## 目录表

| 目录 | 负责什么 |
|---|---|
| `src/routes/` | 文件路由；`{-$locale}` 前缀可选，`_layout/` 下按布局分组 |
| `src/routes/api/` | API 端点：`contact/`、`auth/`、`payment/`、`newsletter/`、`email/`、`webhooks/` |
| `src/config/` | 站点配置：`website.ts`（总开关）、`products.ts`（套餐）、`navbar-config.ts`、`footer-config.ts`、`navigation.ts`、`settings.ts`、`social-config.ts` |
| `src/components/ui/` | shadcn（Base UI）上游原件，**不本地修改** |
| `src/components/layout/` | Logo、语言切换、菜单项、用户菜单 |
| `src/components/marketing/` | 营销页装配：LandingPage / Navbar / Footer / MarketingLayout |
| `src/components/sections/` | 可复用内容区块：Hero / Features / Pricing / FAQ… |
| `src/components/docs/` | 文档站布局、侧栏、搜索、目录 |
| `src/components/dashboard/` | 工作台骨架与用户卡片 |
| `src/components/auth/` | 表单件：字段适配层、提交按钮、水合检测 |
| `src/core/auth/` | Better Auth 配置、会话、邮箱验证 |
| `src/core/db/` | Drizzle schema 与迁移文件 |
| `src/core/env/` | 两层 env 校验：`public.ts` 与 `server.ts` |
| `src/lib/` | 纯逻辑：locale、SEO、模块门禁、限流、主题解析 |
| `src/locale/` | Paraglide 产物与 locale 中间件 |
| `src/core/cache/` `src/core/storage/` `src/core/email/` `src/modules/newsletter/` `src/core/notify/` `src/core/payment/` | 各服务模块：provider 注册表 + 抽象接口 |
| `src/styles/` | `globals.css`（设计 token）、`mdx.css` |
| `src/hooks/` | 跨页面复用的 hook |
| `src/server.ts` / `src/router.tsx` | 服务入口（CSP nonce、env 注入）/ 路由实例 |

仓库根目录：

| 目录 | 负责什么 |
|---|---|
| `content/` | 文档 / 博客 / 更新日志 / 法务，中文稿加 `.zh` 后缀 |
| `messages/` | 界面文案 `zh.json` / `en.json` |
| `public/` | 静态资源，含 `public/docs/screenshots/` |
| `scripts/` | 构建与校验脚本，`scripts/init/` 是初始化向导 |
| `tests/` | 单元 / 组件 / Workers 测试 |
| `e2e/` | Playwright 用例 |

## 改 X 去哪个文件

| 想改什么 | 去哪里 |
|---|---|
| 站点名、Logo、模块与功能开关 | `src/config/website.ts` |
| 套餐与购买选项 | `src/config/products.ts` |
| 导航栏、页脚链接 | `src/config/navbar-config.ts`、`src/config/footer-config.ts` |
| 菜单项形状与显隐规则 | `src/config/navigation.ts` |
| 工作台分区 | `src/config/settings.ts` |
| 社交链接 | `src/config/social-config.ts` |
| 按钮、标题、提示等界面文案 | `messages/zh.json`、`messages/en.json` |
| 首页 / 关于 / 定价页的段落 | 对应路由组件，如 `src/routes/{-$locale}/index.tsx` |
| 颜色、字体、圆角、阴影 | `src/styles/globals.css` |
| 文档内容 | `content/docs/*.md` |
| 数据库表 | `src/core/db/schema.ts`，然后 `pnpm db:generate` |
| 新增页面 | 在 `src/routes/` 下建文件，路由自动生成 |
| 新增 API | `src/routes/api/<name>/$.ts` |
| 新增 UI 控件 | `pnpm dlx shadcn@latest add <component> -y`，装到 `src/components/ui/` |
| 新增服务模块 | 照 `src/core/email/` 的结构：`types.ts` + `provider/` + `index.ts` |

## 生成物

`src/routeTree.gen.ts`（路由插件）、`src/locale/paraglide/**`（`pnpm locale:compile`）、`.content-collections/generated/**`（`pnpm content:build`）都在构建时重写，手改会被覆盖。

配色与字体见 [设计系统](./design-system)，新增表单见 [表单约定](./forms)。
