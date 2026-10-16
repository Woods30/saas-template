---
title: 网站配置
description: websiteConfig 的全部字段、默认值与开关语义
locale: zh
order: 2
group: config
updated: 2026-10-14
---

站点配置的唯一入口是 `src/config/website.ts`，导出 `websiteConfig` 对象。

```ts
// src/config/website.ts
import { type PublicEnv, publicEnv } from '@/env/public'

export const websiteConfig = createWebsiteConfig(publicEnv)
```

工厂 `createWebsiteConfig(env)` 显式接收公开 env，脚本与单测可传入独立配置，不必依赖全局单例。

> **注意事项**
> - 只放**语言无关**值。配置在模块加载期求值一次；随请求语言变化的文案必须在组件 render 或路由 `head()` 内调用 `m.*()`。
> - 只放**公开**值。类型签名只接受 `PublicEnv`，secret 无法经此进入客户端 bundle。

## 元数据

图片路径必须为 root-relative（`/logo.svg`）或 protocol-relative（`//cdn/logo.svg`），否则 `pnpm check` 会报错。

| 字段 | 类型 | 说明 |
|---|---|---|
| `metadata.name` | `string` | 站点名称，用于 JSON-LD、邮件发件人显示名、manifest |
| `metadata.images.ogImage` | `string` | Open Graph 分享图，由 `seo()` 补全为绝对 URL |
| `metadata.images.logoLight` | `string` | 浅色主题下的 Logo |
| `metadata.images.logoDark` | `string` | 深色主题下的 Logo |
| `metadata.images.icon` | `string` | favicon 与 PWA 图标 |

## UI

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `ui.defaultTheme` | `'light' \| 'dark' \| 'system'` | `'system'` | 无 `THEME` cookie 时的主题 |
| `ui.enableThemeSwitch` | `boolean` | `true` | 为 `false` 时隐藏主题切换按钮 |

`ui.defaultTheme` 同时用于 SSR 与客户端，保证首屏不闪烁。

## 站点基址

| 字段 | 类型 | 说明 |
|---|---|---|
| `baseUrl` | `string` | 取自 `VITE_BASE_URL`，用于 canonical、OG、sitemap、robots |

> 生产环境必须是真实 HTTPS 域名。`pnpm check:env:prod` 会拒绝 `localhost`、回环地址、`0.0.0.0`、内嵌凭据的 URL，以及 `example.com` / `.net` / `.org` 等保留域名。

## 内容模块

`docs` / `blog` / `changelog` 默认**开启**。关闭后对应页面返回 404、从 sitemap 移除、相关菜单项不渲染。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `docs.enabled` | `boolean` | `true` | 文档站（`/docs`） |
| `blog.enabled` | `boolean` | `true` | 博客（`/marketing/blog`） |
| `changelog.enabled` | `boolean` | `true` | 更新日志（`/marketing/changelog`） |

## 服务模块

六个服务模块默认**关闭**。开启前须补齐「必要配置」，否则状态为 `incomplete`，API 返回 503。

| 字段 | 类型 | 默认值 | 必要配置 |
|---|---|---|---|
| `mail.enabled` | `boolean` | `false` | 见[邮件](./integrations#邮件) |
| `mail.provider` | `'resend' \| 'cloudflare'` | `'resend'` | — |
| `mail.supportEmail` | `string` | `''` | 合法邮箱地址 |
| `contact.enabled` | `boolean` | `false` | 依赖 `mail` 已配置完整 |
| `newsletter.enabled` | `boolean` | `false` | 见[邮件订阅](./integrations#邮件订阅) |
| `newsletter.provider` | `'resend' \| 'beehiiv'` | `'resend'` | — |
| `payment.enabled` | `boolean` | `false` | 见[支付](./integrations#支付) |
| `payment.provider` | `'stripe'` | `'stripe'` | 当前仅支持 Stripe |
| `payment.allowedPriceIds` | `string[]` | `[]` | 至少一个非空 Price ID |
| `notification.enabled` | `boolean` | `false` | Discord 或飞书 Webhook |
| `analytics.enabled` | `boolean` | `false` | 见[分析](./integrations#分析) |
| `analytics.providers` | `AnalyticsName[]` | `[]` | 每个选中 provider 的 ID |
| `auth.enabled` | `boolean` | `true` | 见[身份认证](./auth) |
| `auth.requireEmailVerification` | `boolean` | `false` | 安全控制，见[身份认证](./auth)。**不**跟随 `mail.enabled`。接上邮件后应改为 `true` |

## 社交媒体

`social` 是 `Partial<Record<SocialPlatform, string>>`，未配置的平台不渲染任何占位。

支持：`github`、`x`、`bluesky`、`mastodon`、`discord`、`youtube`、`linkedin`、`facebook`、`instagram`、`tiktok`、`telegram`。

```ts
social: {
  github: 'https://github.com/your-org/your-project',
  x: 'https://x.com/your-handle',
},
```

> 链接必须为**无凭据的 HTTPS URL**。不满足的项被静默跳过，并由 `pnpm check` 报告字段名（不回显原值）。`mail.supportEmail` 合法时，页脚额外渲染 `mailto:` 入口。

## 功能开关

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `features.enableI18n` | `boolean` | `true` | 多语言 |
| `features.enableFileUpload` | `boolean` | `false` | 文件上传（依赖存储模块） |
| `features.enableApiKeys` | `boolean` | `true` | API 密钥管理 |
| `features.enableAdmin` | `boolean` | `false` | 管理后台 |
| `features.enableAIGateway` | `boolean` | `false` | AI 网关 |

这些开关标记能力边界，本身不注册路由——路由文件始终存在，开关控制的是行为：`enableApiKeys` 关闭时 `/api/auth/api-key/*` 返回 404，相关菜单项也不再渲染。

## 完整示例

```ts
// src/config/website.ts
export function createWebsiteConfig(env: PublicEnv): WebsiteConfig {
  return {
    baseUrl: env.VITE_BASE_URL,
    metadata: {
      name: 'Jerbix',
      images: {
        ogImage: '/logo.png',
        logoLight: '/logo-horizontal-transparent.svg',
        logoDark: '/logo-horizontal-transparent.svg',
        icon: '/icon-jerboa.svg',
      },
    },
    ui: { defaultTheme: 'system', enableThemeSwitch: true },
    docs: { enabled: true },
    blog: { enabled: true },
    changelog: { enabled: true },
    mail: { enabled: false, provider: 'resend', supportEmail: '' },
    contact: { enabled: false },
    newsletter: { enabled: false, provider: 'resend' },
    payment: { enabled: false, provider: 'stripe', allowedPriceIds: [] },
    notification: { enabled: false, provider: 'discord' },
    analytics: { enabled: false, providers: [] },
    auth: { enabled: true, requireEmailVerification: false },
    social: {},
    features: {
      enableI18n: true,
      enableFileUpload: false,
      enableApiKeys: true,
      enableAdmin: false,
      enableAIGateway: false,
    },
  }
}
```

## 校验配置

`src/config/service-status.ts` 的 `getServiceStatuses()` 是纯函数，按模块返回三种状态：

| 状态 | 含义 |
|---|---|
| `disabled` | 模块开关为 `false` |
| `incomplete` | 已启用但缺少必要字段，`issues` 列出字段名与位置 |
| `configured` | 开关与必要字段齐备 |

> `configured` **只表示配置齐备**，不代表外部服务已就绪、邮件已投递或收款已成功。诊断输出只含字段名、原因与位置，绝不回显凭据值。

## 下一步

- [导航与菜单](./navigation)——菜单如何按模块开关过滤
- [功能集成](./integrations)——各服务模块的 provider 与接线
- [环境变量](./environment)——两层 env 校验与 `VITE_` 规则
