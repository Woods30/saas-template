---
title: 网站配置
description: websiteConfig 的全部字段与开关语义
locale: zh
order: 2
group: config
updated: 2026-10-29
---

`src/config/website.ts` 是站点配置的唯一入口，导出 `websiteConfig` 对象。改站点名、
Logo、开关、社交链接，都在这里。

```ts
// src/config/website.ts
export function createWebsiteConfig(env: PublicEnv): WebsiteConfig {
  return {
    baseUrl: env.VITE_BASE_URL,
    metadata: { name: 'Jerbix', images: { /* … */ } },
    ui: { defaultTheme: 'system', enableThemeSwitch: true, themeColor: { /* … */ } },
    docs: { enabled: true },
    // …
  }
}
```

## 前提条件

先跑通本地开发，见[快速开始](./getting-started)。

## 设置

### 站点信息

```ts
metadata: {
  name: 'Jerbix',                                  // 站点名，出现在标题与 OG 标签
  images: {
    ogImage: '/logo.png',                          // 社交分享图（1200×630）
    logoLight: '/logo-horizontal-transparent.svg', // 浅色主题的横向 Logo
    logoDark: '/logo-horizontal-dark.svg',         // 深色主题的横向 Logo
    icon: '/icon-jerboa.svg',                      // favicon
  },
}
```

Logo 的替换细节见[设计系统](./design-system#品牌-logo)。

### 模板首页营销

```ts
template: {
  priceUsd: 99,
  productId: 'template',
  offerId: 'once',
}
```

定价统一展示在首页 `#pricing`，旧 `/pricing` 地址跳转至当前语言首页价格区，不再展示独立演示套餐页。

首页模板复用现有 Checkout：`productId` / `offerId` 指向 `src/config/products.ts` 中的
`template.prices.once = 'jerbix_template'`，无需外部销售地址。在 Stripe 配置该 `lookup_key`
对应的 USD 99 一次性价格。`priceUsd` 用于首页展示，服务端同时校验实际金额、币种与一次性
计费方式，不匹配或缺少价格时拒绝结账，避免误收演示资源包的费用。

开启 `auth.enabled` 与 `payment.enabled` 后，未登录购买先进入登录页；切换注册、邮箱验证
和登录成功均保留回跳，返回首页价格区后可继续购买。取消结账也回到该区域，付款成功进入
账单页；支付记录由既有 webhook 确认。“看看如何开始”指向当前语言文档，文档关闭时回退功能区。

### 主题

```ts
ui: {
  defaultTheme: 'system',      // 'light' | 'dark' | 'system'
  enableThemeSwitch: true,     // 是否在导航栏显示切换按钮
  themeColor: {                // 浏览器地址栏与 PWA 的底色
    light: '#FCFAFF',
    dark: '#0A0A0F',
  },
}
```

> `themeColor` 必须与 `styles/globals.css` 里 `--background` 的明暗取值一致。这两个值
> 渲染在页面之外，读不到 CSS 变量，只能显式声明。`tests/unit/theme-colors.test.ts`
> 会校验它们等价，改主题时两处一起改。

### 模块开关

每个可选模块都有 `enabled`。关闭时对应页面 404、API 返回 `404 MODULE_DISABLED`，
导航里自动隐藏。

```ts
docs: { enabled: true },
blog: { enabled: true },
changelog: { enabled: true },
mail: { enabled: true, provider: 'resend', supportEmail: 'service@jerbix.site' },
contact: { enabled: false },
newsletter: { enabled: false, provider: 'resend' },
payment: { enabled: true, provider: 'stripe', /* … */ },
notification: { enabled: false, provider: 'discord' },
analytics: { enabled: true, providers: ['ga'] },
auth: { enabled: true, requireEmailVerification: true },
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `docs` / `blog` / `changelog` | `true` | 内容模块，页面已就位 |
| `mail` | `true` | 事务邮件。`supportEmail` 用于生成 `mailto:` 入口 |
| `contact` | `false` | 联系表单 |
| `newsletter` | `false` | 邮件订阅 |
| `payment` | `true` | Stripe 结账与账单页 |
| `notification` | `false` | Discord / 飞书 webhook |
| `analytics` | `true` | 分析脚本；启用后需配 `VITE_GA_ID` |
| `auth` | `true` | 登录注册。关闭时整条认证路径 404 |

> `auth.requireEmailVerification` 是**安全控制**，不是邮件开关，当前默认 `true`。
> 当前 Resend 邮件也已启用，须配置 `RESEND_API_KEY` 与已验证域名下的纯发件地址 `MAIL_FROM`。
> 要求验证但邮件未配齐时，`auth` 为 `incomplete`、认证 API 返回 503，
> `pnpm check:env:prod` 失败，不会隐式关闭验证。`supportEmail` 为 `service@jerbix.site`，与 `MAIL_FROM` 独立；
> 详见[身份认证](./auth)与[邮件](./email)。

### 功能开关

```ts
features: {
  enableI18n: true,        // 多语言（zh / en）
  enableFileUpload: false, // 文件上传（需 R2）
  enableApiKeys: true,     // 用户自助创建 API 密钥
  enableAdmin: true,       // 管理台
  enableAIGateway: false,  // AI 网关
}
```

### 社交链接

```ts
social: {
  github: 'https://github.com/your-org/your-repo',
  x: 'https://x.com/your-handle',
}
```

只渲染合法的 HTTPS 无凭据链接。支持的平台见 `WebsiteConfig['social']` 的类型定义。

## 参考资料

- [导航与菜单](./navigation) —— 导航栏、页脚、文档侧栏
- [环境变量](./environment) —— `baseUrl` 从哪来

## 下一步

- [导航与菜单](./navigation)——配置菜单项
- [环境变量](./environment)——`VITE_` 规则
- [设计系统](./design-system)——改配色与 Logo


套餐在 `src/config/products.ts` 中集中配置，使用 `prices: { monthly: 'pro_monthly', yearly: 'pro_yearly' }` 映射购买选项到当前服务商销售引用。金额和周期从服务商获取，空 prices 表示免费套餐；详见[支付](./payment)。
