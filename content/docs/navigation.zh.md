---
title: 导航与菜单
description: 导航栏、页脚与社交链接怎么配
locale: zh
order: 3
group: config
updated: 2026-11-03
---

导航栏、页脚与文档侧栏共用一套菜单数据模型：同一份结构、同一套过滤规则，改一处三处生效。

| 文件 | 负责什么 |
|---|---|
| `src/config/navigation.ts` | 菜单类型、链接目标、过滤规则 |
| `src/config/navbar-config.ts` | 导航栏链接与右侧按钮 |
| `src/config/footer-config.ts` | 页脚分组 |
| `src/config/social-config.ts` | 社交平台映射与安全过滤 |

## 加一个导航栏链接

编辑 `src/config/navbar-config.ts`，在 `getNavbarLinks()` 的数组里加一项：

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

站内链接用 `getPublicLinkOptions(target, locale)`，它返回类型安全的 `linkOptions()`：路由
不存在、缺动态参数，都会在 `tsc` 阶段被拒绝。

| `target` | 解析结果 |
|---|---|
| `home` | `/{locale}` |
| `docs` | `/{locale}/docs` |
| `blog` | `/{locale}/marketing/blog` |
| `changelog` | `/{locale}/marketing/changelog` |
| `pricing` | 首页（`getPublicLinkOptions('home', locale, 'pricing')` 才是带锚点的那种） |
| `contact` | `/{locale}/marketing/contact` |
| `roadmap` | `/{locale}/marketing/roadmap` |
| `waitlist` | `/{locale}/marketing/waitlist` |
| `login` | `/{locale}/auth/login` |
| `terms` / `privacy` | `/{locale}/marketing/legal/{slug}` |

路由里的语言段是可选的（`{-$locale}`），默认语言的 URL 不带前缀。

## 可见性规则

`visibility` 的条件全部满足才显示：

| 字段 | 语义 |
|---|---|
| `module` | 模块开关，如 `{ module: 'payment' }` |
| `page` | 静态页开关，如 `{ page: 'waitlist' }` |
| `authenticated` | 是否要求已登录 |
| `roles` | 角色白名单，如 `{ roles: ['admin'] }` |

指向 `contact` 的菜单项**必须**带 `visibility: { module: 'contact' }`——该页默认关闭，不加
就会给出一个点开即 404 的链接。`roadmap` 是无条件提供的静态页；`waitlist` 没有模块开关，
按 `pages.waitlist` 过滤。

## 菜单项的两种形状

| `kind` | 说明 |
|---|---|
| `link` | 内部链接 `destination: { kind: 'internal', options }`，或外链 `destination: { kind: 'external', href, newTab }` |
| `group` | 递归子项；子项全被过滤时该组一并消失 |
| `separator` | 分隔线；首尾与连续重复的会被自动移除 |

`social` 字段里的链接会校验为无凭据的 HTTPS；自定义菜单项的 `href` 不会自动校验，别把
带 token 的地址写进去。

## 页脚与社交链接

页脚在 `src/config/footer-config.ts`，结构与导航栏相同：`getFooterLinks()` 返回两个分组
（产品、资源），同样走 `visibility` 过滤。

社交链接写在 `src/config/website.ts` 的 `social` 字段：

```ts
social: {
  github: 'https://github.com/your-org/your-repo',
  x: 'https://x.com/your-handle',
}
```

`src/config/social-config.ts` 负责把平台名映射成图标与标签，只渲染无凭据的 HTTPS 地址，
非法的静默丢弃。`mail.supportEmail` 有效时会额外渲染一个 `mailto:` 入口。
