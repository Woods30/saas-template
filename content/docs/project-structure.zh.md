---
title: 目录结构
description: 每个目录负责什么，改东西该去哪里
locale: zh
order: 19
group: develop
updated: 2026-10-21
---

这页是一张地图。找不到东西时先看这里，再去读具体代码。

## 目录地图

```text
src/
├── routes/              文件路由。`{-$locale}` 是可选的 locale 前缀
├── config/              站点配置
│   ├── website.ts       总开关：名称、Logo、模块开关、功能开关
│   ├── navigation.ts    菜单类型与过滤规则
│   ├── navbar-config.ts 导航栏
│   ├── footer-config.ts 页脚
│   └── settings.ts      工作台分区
├── components/
│   ├── sections/        可复用内容区块（Hero / Features / Pricing…）
│   ├── marketing/       页面级装配（LandingPage / MarketingLayout / Navbar）
│   ├── docs/            文档站布局、侧栏、搜索
│   ├── dashboard/       工作台骨架
│   ├── layout/          跨页面布局件（Logo / 语言切换 / 用户菜单）
│   ├── blog/  auth/  contact/  mdx/  theme/  icons/
│   └── ui/              shadcn 上游原件，不本地修改
├── auth/                认证（Better Auth）
├── cache/               KV 缓存与限流
├── contact/             联系表单投递
├── db/                  Drizzle schema 与迁移
├── env/                 两层 env 校验
├── lib/                 纯逻辑：locale、seo、module-access、rate-limit…
├── locale/              Paraglide 生成物与 middleware
├── mail/  newsletter/  notification/  payment/  storage/
│                        服务模块：provider 注册表 + 抽象接口
├── styles/              globals.css（设计 token）、mdx.css
├── server.ts            自定义 server entry（CSP nonce、env 注入）
└── router.tsx           路由实例

content/                 文档 / 博客 / 更新日志 / 法务（Markdown）
messages/                zh.json / en.json 界面文案
public/docs/screenshots/ 文档正文引用的界面截图
scripts/                 构建与校验脚本
tests/                   unit / components / workers
e2e/                     Playwright
```

## 改哪里

| 想改什么 | 去哪里 |
|---|---|
| 站点名、Logo、模块开关 | `src/config/website.ts` |
| 首页 / 关于 / 定价页的文案 | 对应的路由组件，如 `src/routes/{-$locale}/index.tsx` |
| 界面上的按钮、提示文案 | `messages/zh.json`、`messages/en.json` |
| 导航栏、页脚链接 | `src/config/navbar-config.ts`、`footer-config.ts` |
| 文档内容 | `content/docs/*.md`（中文加 `.zh`） |
| 颜色、字体、圆角 | `src/styles/globals.css`，规则见 [设计系统](./design-system) |
| 新增页面 | `src/routes/` 下建文件，框架自动生成路由 |
| 新增 API | `src/routes/api/<name>/$` 或 `src/routes/api/<name>.ts` |
| 数据库表 | `src/db/schema.ts`，然后 `pnpm db:generate` |
| 新增服务模块 | 参考 `src/mail/` 的结构：`types.ts` + provider + `index.ts` |
| 给文档加界面截图 | 图片放 `public/docs/screenshots/`，正文用 `![说明](/docs/screenshots/x.png "标题")` |

## 两条容易混淆的边界

**`components/sections/` 与 `components/marketing/`**

- `sections/` 是**可复用内容区块**：一个 Hero、一组 Features。给什么 props 渲染什么，
  不关心在哪个页面。
- `marketing/` 是**页面级装配**：`LandingPage` 把多个 section 按顺序拼起来，
  `MarketingLayout` 管导航与页脚。

**路由组件内的文案 与 `config/website.ts`**

- `website.ts` 是**全局开关与身份**：站点叫什么、哪些模块开着。
- 页面文案写在路由组件里，紧挨着它渲染的那个区块；改文案不必跳到另一个文件。

页面文案一律在**渲染期**调用 `m.*()`，不要提到模块顶层常量：Paraglide 在调用时才读
当前语言，模块加载期求值会把首次请求的语言固化给之后所有请求（SSR 下表现为整页语言
不对，客户端再按 URL 算出另一种语言，于是 hydration 不匹配）。

## 不手改的生成物

| 路径 | 由谁生成 |
|---|---|
| `src/routeTree.gen.ts` | TanStack Router 插件 |
| `src/locale/paraglide/**` | `pnpm locale:compile` |
| `.content-collections/generated/**` | `pnpm content:build` |

这三个目录在构建时重写，手改会在下次构建被覆盖。

## 参考资料

- [TanStack Router · 文件路由](https://tanstack.com/router/latest/docs/framework/react/routing/file-based-routing)
- [TanStack Start](https://tanstack.com/start/latest)

## 下一步

- [设计系统](./design-system)——视觉规范
- [表单约定](./forms)——新增表单怎么写
- [测试](./testing)——改完怎么验证
