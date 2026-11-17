---
title: 网站配置
description: websiteConfig 的全部字段与开关语义
locale: zh
order: 2
group: config
updated: 2026-11-18
---

站点配置分两层：

| 层 | 位置 | 改它的方式 |
|---|---|---|
| **出厂值** | `src/config/website.ts` | 改代码，发版生效；是数据库里没有对应分组时的兜底 |
| **生效配置** | 数据库 `settings` 表 | 后台「系统设置」页保存，**即时生效**，不用发版 |

生效配置 = 出厂值 + 数据库里的分组，合并规则在 `src/core/config/settings.ts`。全站读
`websiteConfig` 拿到的永远是生效的那份，调用点不用关心配置从哪来。

数据库里的配置分六组，每组独立校验——某组坏了只丢那一组，其余照常用：

| 分组 | 内容 | 后台分区 |
|---|---|---|
| `brand` | 站名、字标强调色、标语 | 品牌 |
| `seo` | 默认 SEO 文案 + 分语言覆盖 | SEO |
| `social` | 社交链接 | 社交链接 |
| `payment` | 支付渠道与开关 | 支付 |
| `mail` | 邮件渠道、开关与支持邮箱 | 邮件 |
| `modules` | 服务模块与能力开关 | 模块 |

**密钥不进数据库**：支付与邮件的凭据仍只在环境变量里，数据库只存渠道选择与公开参数。

保存后进程内快照立即刷新；但多 isolate 部署时，其它 isolate 最长 30 秒后才刷新到新值。

下面的字段表列的是**出厂值**——即数据库里没有对应分组时生效的值。

## 站点信息

| 字段 | 默认值 | 说明 |
|---|---|---|
| `metadata.name` | 模板默认品牌名 | 站点名，出现在页面标题、OG 标签与 JSON-LD；后台「品牌」分区可改 |
| `metadata.logoAccent` | 品牌名末字母 | 字标末尾用强调色渲染的字符；纯单色字标留空串 |
| `metadata.images.ogImage` | `/logo.png` | 社交分享图，建议 1200×630 |
| `metadata.images.logoLight` / `logoDark` | `/logo-horizontal-transparent.svg` / `/logo-horizontal-dark.svg` | 浅色 / 深色主题的横向 Logo |
| `metadata.images.icon` | 吉祥物图标 | 站点图标，默认指向 `public/` 里的吉祥物 SVG；换成你自己的 |
| `baseUrl` | `VITE_BASE_URL` | 站点根地址，用于 canonical、OG 与 sitemap |

## 首页售卖商品

| 字段 | 默认值 | 说明 |
|---|---|---|
| `landingOffer.productId` | `template` | 首页 CTA 指向哪个商品；商品本身在 `src/config/products.ts` 声明 |
| `landingOffer.offerId` | `once` | 走哪种购买方式（一次性 / 订阅周期） |

配置里**不存金额**：价格只存在于支付服务商的价格目录，首页展示与结账收款读同一份；
`productId` / `offerId` 必须能在 `src/config/products.ts` 里找到对应的价格引用。

## 主题与配色

| 字段 | 默认值 | 说明 |
|---|---|---|
| `ui.defaultTheme` | `system` | 首次访问的主题：`light` / `dark` / `system` |
| `ui.enableThemeSwitch` | `true` | 是否在导航栏显示主题切换按钮 |
| `ui.themeColor.light` / `ui.themeColor.dark` | `#FCFAFF` / `#0A0A0F` | 浅色 / 深色下的浏览器地址栏与 PWA 底色 |

`themeColor` 必须与 `styles/globals.css` 里 `--background` 的明暗取值一致：这两个值
渲染在页面之外，读不到 CSS 变量，只能显式声明。改主题时两处一起改。

## 模块开关

| 字段 | 默认值 | 说明 |
|---|---|---|
| `docs.enabled` / `blog.enabled` / `changelog.enabled` | `true` | 文档站 / 博客 / 更新日志；关闭后对应页面 404 |
| `mail.enabled` / `mail.provider` | `true` / `resend` | 事务邮件；发信渠道 `resend` 或 `cloudflare` |
| `mail.supportEmail` | 占位邮箱 | 支持收件邮箱，生成 `mailto:` 入口；与发件地址 `MAIL_FROM` 相互独立 |
| `contact.enabled` | `false` | 联系表单，依赖邮件模块已配置 |
| `newsletter.enabled` / `newsletter.provider` | `false` / `resend` | 邮件订阅；订阅渠道 `resend` 或 `beehiiv` |
| `payment.enabled` / `payment.provider` | `true` / `stripe` | 结账与账单页；收款渠道 `stripe` 或 `creem` |
| `notification.enabled` / `notification.provider` | `false` / `discord` | 付款成功 / 联系表单的通知；渠道 `discord` 或 `feishu` |
| `analytics.enabled` / `analytics.providers` | `true` / `['ga']` | 分析脚本；可同时开 `ga` / `plausible` / `umami` / `clarity` |
| `auth.enabled` | `true` | 登录注册；关闭时整条认证路径 404 |
| `auth.requireEmailVerification` | `true` | 注册后必须先验证邮箱才能登录 |

**门禁语义**：模块关闭时，对应页面与 API 一起 404（API 返回 `404 MODULE_DISABLED`）；
模块开启但必要配置缺失时，API 返回 `503 SERVICE_UNAVAILABLE`，页面与导航入口照常显示。
`getServiceStatuses()` 把每个模块标成 `disabled` / `incomplete` / `configured`，
`pnpm check` 会打印缺配置的服务模块，`pnpm check:env:prod` 在 `incomplete` 时直接失败。

这些开关同时是数据库里的 `modules` 分组，后台「模块」分区可改，改完即时生效。
`VITE_MODULES` / `VITE_FEATURES` 白名单仍可用，它决定**出厂值**——同一份构建产物发两处时
用它区分场景，见[环境变量](./environment)。

`auth.requireEmailVerification` 是**安全控制**，不是邮件开关：下游把邮箱当身份依据
（支付渠道的 `customerEmail`、`ADMIN_EMAILS`）。要求验证但邮件未配齐时，`auth` 报
`incomplete`、认证 API 返回 503，不会自动降级为免验证登录。

## 静态页开关

| 字段 | 默认值 | 说明 |
|---|---|---|
| `pages.waitlist` | `true` | 等候名单页；关闭后导航与页脚入口消失、页面 404、sitemap 不再收录 |

## 文档站

`docs` 除了 `enabled` 还有三个可选字段，用于把文档站发到独立域名：

| 字段 | 说明 |
|---|---|
| `siteUrl` | 外部文档站地址；配了它，导航与页脚的「文档」指向外链而不是站内 `/docs` |
| `homeUrl` | 主站地址；文档站里的「返回官网」指向它，留空则不显示该入口 |
| `asHome` | 本仓就是文档站：根路径进文档首页，对外地址不带 `/docs` 这一层 |

`asHome` 通常由构建环境变量打开（`VITE_DOCS_AS_HOME=true`），同一份代码可同时发官网站与文档站。

## 功能开关

`features` 下是扁平布尔量，控制「按 flag 开关的能力」：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `enableI18n` | `true` | 多语言（zh / en） |
| `enableFileUpload` | `false` | 文件上传，需要 R2 bucket |
| `enableApiKeys` | `true` | 用户自助创建 API 密钥 |
| `enableAdmin` | `true` | 管理台与用户管理 |
| `enableAIGateway` | `false` | AI 网关 |

功能开关与服务模块是两套：后者有 `.enabled` 与 provider 字段，前者本身就是布尔值，页面与 API 由 `assertFeatureEnabled()` 门禁（关闭即 404）。

## 社交链接

`social` 是平台到地址的映射，支持 `github`、`x`、`bluesky`、`mastodon`、`discord`、
`youtube`、`linkedin`、`facebook`、`instagram`、`tiktok`、`telegram`：

```ts
social: {
  github: 'https://github.com/your-org/your-repo',
  x: 'https://x.com/your-handle',
}
```

只渲染无凭据的 HTTPS 地址，非法链接静默丢弃。社交链接同时是数据库里的 `social` 分组，
后台「社交链接」分区可改。模块与功能开关也可用 `VITE_MODULES` / `VITE_FEATURES` 覆盖出厂值，
见[环境变量](./environment)。
