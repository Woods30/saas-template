---
title: 测试
description: 三层测试的分工、常用命令与新增用例的取舍
locale: zh
order: 22
group: develop
updated: 2026-10-21
---

**E2E 只守「用户能不能完成一件事」，细节交互交给组件测试。** 这页讲怎么分工，
以及新增用例前该先问自己什么。

## 前提条件

本地能跑 `pnpm test`，见[快速开始](./getting-started)。

## 设置

### 三层分工

| 层 | 范围 | 位置 |
|---|---|---|
| 单元测试 | 纯逻辑：门禁、主题解析、locale 归一化、env 校验、邮件模板 | `tests/unit/` |
| 组件测试 | 单页面 / 单组件的交互与渲染：表单校验、菜单开关、断点布局、锚点、文案 | `tests/components/` |
| E2E | 跨页面、跨服务的用户旅程：注册登录、个人中心读写、模块门禁、关键页面可访问 | `e2e/` |

### 什么该写 E2E

**写**：需要真实浏览器、真实服务端、真实数据库才能验证的路径——会话 cookie、重定向、
SSR 与 hydration、路由守卫、API 与页面联动。

**不写**：元素位置、断点下的溢出、动画开关、hover 位移、锚点滚动、TOC 结构、单个字段
的校验提示、静态文件内容（sitemap / robots / manifest）。这些用组件测试或构建期断言
覆盖，成本低一个数量级。

新增 E2E 前先问：「这条用例守的是哪条核心流程？」答不上来就下沉到组件测试。单个 spec
保持在 10 条以内，整套 E2E 目标 5 分钟内跑完。跨语言行为由单元测试覆盖，E2E 只在**一个**
locale 上跑主流程。

### 当前 E2E 基线

| spec | 守什么 |
|---|---|
| `auth.spec.ts` | 注册 → 自动登录 → 登出；字段校验在提交前拦下 |
| `settings.spec.ts` | 路由守卫、默认落点、昵称写入 D1、登出后会话失效 |
| `docs.spec.ts` | `/docs` 重定向、⌘K 搜索 → 跳转、侧栏偏好由服务端回读 |
| `marketing.spec.ts` | 首页渲染 + 语言切换走真实 `/en` 前缀 |
| `hydration.spec.ts` | zh / en 首页水合无 React / CSP 报错 |
| `site-config.spec.ts` | 关闭模块的 API 返回 404 而非假成功 |
| `payment.spec.ts` | 已订阅后不能再买；账单页显示套餐名 / 续费日期 / 金额 |

> `payment.spec.ts` 需要 `.env` 里配好 `VITE_PAYMENT_PROVIDER` 与三个
> `VITE_STRIPE_PRICE_*`。未配置时**跳过**而不是失败——模板开箱没有凭据是正常状态。
> 它不真的打 Stripe：用 `scripts/e2e-seed-subscription.ts` 往本地 D1 写一条 `active`
> 订阅来复现「已订阅」。

### 写测试的两个坑

- **点按钮前要等水合。** 水合未完成时点击会静默失败——没有报错、没有导航，表现和
  产品 bug 完全一样。
- **并发注册的邮箱要加随机段。** 只用 `Date.now()` 在 `fullyParallel` 下会撞车。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm test` | 全部单元 + 组件测试 |
| `pnpm test:affected` | 仅跑受影响的测试 |
| `pnpm test:watch` | watch 模式 |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm test:e2e:ui` | Playwright UI 模式 |
| `pnpm exec vitest run --project unit` | 只跑单元测试 |
| `pnpm exec vitest run --project components` | 只跑组件测试（jsdom） |

> `pnpm test` 会先跑 `locale:compile`，在非交互环境可能被提问卡住。CI 里按 `--project`
> 分开跑更稳。

## 参考资料

- [Vitest](https://vitest.dev/)
- [Playwright](https://playwright.dev/docs/intro)

## 下一步

- [目录结构](./project-structure)——测试文件放在哪
- [表单约定](./forms)——表单相关的组件测试
- [Cloudflare](./cloudflare)——CI 与自动部署
