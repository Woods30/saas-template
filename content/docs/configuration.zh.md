---
title: 网站配置
description: websiteConfig 的全部字段与开关语义
locale: zh
order: 2
group: config
updated: 2026-10-21
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
mail: { enabled: false, provider: 'resend', supportEmail: '' },
contact: { enabled: false },
newsletter: { enabled: false, provider: 'resend' },
payment: { enabled: false, provider: 'stripe', /* … */ },
notification: { enabled: false, provider: 'discord' },
analytics: { enabled: false, providers: ['ga'] },
auth: { enabled: true, requireEmailVerification: false },
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `docs` / `blog` / `changelog` | `true` | 内容模块，页面已就位 |
| `mail` | `false` | 事务邮件。`supportEmail` 用于生成 `mailto:` 入口 |
| `contact` | `false` | 联系表单 |
| `newsletter` | `false` | 邮件订阅 |
| `payment` | `false` | Stripe 结账与账单页 |
| `notification` | `false` | Discord / 飞书 webhook |
| `analytics` | `false` | 分析脚本 |
| `auth` | `true` | 登录注册。关闭时整条认证路径 404 |

> `auth.requireEmailVerification` 是**安全控制**，不是邮件开关。默认 `false` 是为了让
> 未接邮件的模板开箱可用；接上邮件后应改为 `true`。若设为 `true` 但邮件没配齐，
> `pnpm check:env:prod` 会直接失败——要求验证却发不出验证邮件，新用户永远无法登录。

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
