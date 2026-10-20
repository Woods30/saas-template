---
title: 导航与菜单
description: 配置 Navbar、页脚、文档侧边栏与社交链接
locale: zh
order: 3
group: config
updated: 2026-10-20
---

所有菜单共用同一套数据模型与渲染组件，因此过滤规则、外链行为与键盘操作在 Navbar、页脚、文档侧边栏中保持一致。

| 文件 | 职责 |
|---|---|
| `src/config/navigation.ts` | 菜单类型、链接目标、过滤规则 |
| `src/config/navbar-config.ts` | Navbar 链接与右侧 actions |
| `src/config/footer-config.ts` | 页脚分组 |
| `src/config/social-config.ts` | 社交平台映射与安全过滤 |
| `src/components/layout/MenuLink.tsx` | 单个链接（站内 / 站外） |
| `src/components/layout/MenuItems.tsx` | 递归渲染（group / separator） |

## 链接目标

`getPublicLinkOptions(target, locale, hash?)` 把逻辑目标映射为类型安全的 `linkOptions()`。内部链接经 TanStack Router 的 `ValidateLinkOptions` 校验：**路由不存在、缺动态 params、或把内部链接写成外链，都会在 TypeScript 检查中被拒绝**。

| `target` | 解析结果 |
|---|---|
| `home` | `/{locale}`（可带 `hash`） |
| `docs` | `/{locale}/docs` |
| `blog` | `/{locale}/marketing/blog` |
| `changelog` | `/{locale}/marketing/changelog` |
| `pricing` | `/{locale}/pricing` |
| `contact` | `/{locale}/marketing/contact` |
| `roadmap` | `/{locale}/marketing/roadmap` |
| `waitlist` | `/{locale}/marketing/waitlist` |
| `login` | `/{locale}/auth/login` |
| `terms` | `/{locale}/marketing/legal/terms` |
| `privacy` | `/{locale}/marketing/legal/privacy` |

`contact` 由 `contact` 模块门禁（路由 `beforeLoad` 抛 404），因此**引用它的菜单项必须带
`visibility: { module: 'contact' }`**，否则默认配置（`contact.enabled: false`）下会给出一个
点开即 404 的链接。`roadmap` / `waitlist` 是没有模块开关的静态页，菜单项不加 `visibility`。

## 菜单项类型

`MenuItem` 是三种形状的联合：

| `kind` | 关键字段 | 说明 |
|---|---|---|
| `link` | `destination` | 站内（`internal` + `options`）或站外（`external` + `href` + `newTab`） |
| `group` | `items` | 递归子项；子项全被过滤时该组一并消失 |
| `separator` | — | 分隔线；首尾与连续重复的会被自动移除 |

三者都带 `id`（稳定标识）、可选 `title` / `description` / `icon`，以及可选的 `visibility`。

## 可见性过滤

`MenuVisibility` 的三个条件须全部满足才显示：

| 字段 | 类型 | 语义 |
|---|---|---|
| `module` | `SiteModule` | 对应模块 `enabled` 为 `true` 时才显示 |
| `authenticated` | `boolean` | 与当前登录状态相等时才显示 |
| `roles` | `readonly string[]` | 已登录且角色在列表内时才显示 |

`filterMenuItems(items, ctx)` 递归应用规则且**不修改输入**：返回新数组，被过滤的 group 不留空壳，冗余 `separator` 会被清理。菜单工厂是纯函数，`MenuContext` 由调用方传入当前请求的登录状态，因此同一进程连续处理 zh → en 时文案与 locale params 都正确。

```ts
export type MenuContext = { config: WebsiteConfig; authenticated: boolean; role?: string }
```

> **注意事项**：`roles: []` 的语义是「永不显示」（空列表不匹配任何角色），与 `authenticated` 的三态语义并不对称。当前模板无调用方，扩展时请留意。

## Navbar

`getNavbarLinks(locale, ctx)` 返回主链接，`getNavbarActions(locale, config)` 返回右侧 `login` 与 `primary` 两个 action。

`primary` 按钮的目标随配置变化：`docs.enabled` 为 `true` 时指向当前语言的文档入口，否则回退首页 `#features` 锚点，避免把用户导向已下线的页面。

桌面菜单与移动端抽屉渲染**同一份**数据，不会出现两处不一致。移动端支持键盘操作：`Enter` 展开分组，`Escape` 关闭，焦点归还触发按钮。

### 账号区

菜单工厂以 `authenticated: false` 过滤——导航项列表刻意与会话无关，保证 SSR 与客户端始终一致。账号区是唯一的例外，且它根本不是菜单项：`src/components/layout/UserMenu.tsx` 通过 `authClient.useSession()` 读取**真实**会话，渲染访客入口（即作为 `guestFallback` 传入的 `login` 动作）或已登录菜单（展示邮箱与登出项）。

会话待定期间，`UserMenu` 渲染访客入口而非骨架屏——骨架屏会让服务端 HTML 里完全没有登录入口，链接要等水合后才闪现。见[身份认证](./auth)。

## 文档侧边栏

文档侧边栏不使用上面的菜单模型，而是由 `src/lib/docs.ts` 按当前语言解析 `content/docs/` 后传给 `DocsSidebar`。

侧边栏支持二级分组：文档按 frontmatter 的 `group` 聚合，组顺序由**组内最小的 `order`** 决定，因此无需额外维护 `groupOrder` 字段。

| frontmatter 字段 | 作用 |
|---|---|
| `order` | 组内排序，同时决定组的先后 |
| `group` | 分组名；留空则直接列在侧边栏顶层 |

文档 slug 与语言无关（见 `contentSlug()`）：`getting-started.md` 与 `getting-started.zh.md` 都得到 `getting-started`。因此切换语言时 URL 保持稳定，同一 URL 在两种语言下都命中对应译文，不会 404。

## 社交链接

`social-config.ts` 把 `websiteConfig.social` 的 11 个平台映射为带 Tabler 图标的菜单项。

- 未配置的平台**不渲染占位**，也不会出现没有图标的条目；
- 非 HTTPS 或内嵌凭据的链接被跳过，并由 `pnpm check` 报告字段名；
- 站外链接统一 `newTab: true`，由 `MenuLink` 加上 `rel="noopener noreferrer"`；
- `mail.supportEmail` 为合法邮箱时，额外渲染 `mailto:` 支持入口。

## 下一步

- [网站配置](./configuration)——模块开关如何影响菜单可见性
- [功能集成](./integrations)——各服务模块的接线方式
