---
title: 导航与菜单
description: 配置导航栏、页脚与社交链接
locale: zh
order: 3
group: config
updated: 2026-10-21
---

所有菜单共用一套数据模型与渲染组件，因此过滤规则、外链行为与键盘操作在导航栏、
页脚、文档侧栏中完全一致。

| 文件 | 职责 |
|---|---|
| `src/config/navigation.ts` | 菜单类型、链接目标、过滤规则 |
| `src/config/navbar-config.ts` | 导航栏链接与右侧 actions |
| `src/config/footer-config.ts` | 页脚分组 |
| `src/config/social-config.ts` | 社交平台映射与安全过滤 |

## 前提条件

先看[网站配置](./configuration)了解模块开关——菜单项会按开关自动显隐。

## 设置

### 加一个导航栏链接

编辑 `src/config/navbar-config.ts`：

```ts
// src/config/navbar-config.ts
{
  kind: 'link',
  id: 'pricing',
  title: 'Pricing',
  destination: { kind: 'internal', options: getPublicLinkOptions('pricing', locale) },
  visibility: { module: 'payment' },   // payment 关闭时自动隐藏
}
```

`getPublicLinkOptions()` 返回类型安全的 `linkOptions()`。站内链接经 TanStack Router
校验——**路由不存在、缺动态参数、或把内部链接写成外链，都会在 `tsc` 阶段被拒绝**。

| `target` | 解析结果 |
|---|---|
| `home` | `/{locale}` |
| `docs` | `/{locale}/docs` |
| `blog` | `/{locale}/marketing/blog` |
| `changelog` | `/{locale}/marketing/changelog` |
| `pricing` | `/{locale}/pricing` |
| `contact` | `/{locale}/marketing/contact` |
| `roadmap` | `/{locale}/marketing/roadmap` |
| `waitlist` | `/{locale}/marketing/waitlist` |
| `login` | `/{locale}/auth/login` |
| `terms` / `privacy` | `/{locale}/marketing/legal/{slug}` |

### 可见性过滤

`visibility` 的四个条件须全部满足才显示：

| 字段 | 语义 |
|---|---|
| `module` | 模块开关，如 `{ module: 'payment' }` |
| `feature` | 功能开关，如 `{ feature: 'enableApiKeys' }` |
| `authenticated` | 是否要求登录 |
| `roles` | 角色白名单 |

> 引用 `contact` 的菜单项**必须**带 `visibility: { module: 'contact' }`——该页默认关闭，
> 不加就会给出一个点开即 404 的链接。`roadmap` / `waitlist` 是没有模块开关的静态页，
> 不需要 `visibility`。

### 菜单项形状

| `kind` | 说明 |
|---|---|
| `link` | 站内（`internal` + `options`）或站外（`external` + `href` + `newTab`） |
| `group` | 递归子项；子项全被过滤时该组一并消失 |
| `separator` | 分隔线；首尾与连续重复的会被自动移除 |

三者都带 `id`、可选 `title` / `description` / `icon`，以及 `visibility`。

### 页脚与社交

页脚在 `src/config/footer-config.ts`，结构与导航栏相同。社交链接写在
`src/config/website.ts` 的 `social` 字段：

```ts
social: {
  github: 'https://github.com/your-org/your-repo',
  x: 'https://x.com/your-handle',
}
```

只渲染合法的 HTTPS 无凭据链接，非法的静默丢弃。

## 参考资料

- [TanStack Router · 类型安全的链接](https://tanstack.com/router/latest/docs/framework/react/guide/type-safety)

## 下一步

- [网站配置](./configuration)——模块开关与社交链接字段
- [设计系统](./design-system)——菜单的视觉规范
- [功能集成](./integrations)——开启模块后菜单如何变化
