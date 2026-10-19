import { type PublicEnv, publicEnv } from '@/env/public'
import { buildPriceMap, collectPriceIds, type PriceMap } from './payment'

export type PaymentProviderName = 'stripe'
export type AnalyticsName = 'ga' | 'plausible' | 'umami' | 'clarity'
export type SocialPlatform =
  | 'github'
  | 'x'
  | 'bluesky'
  | 'mastodon'
  | 'discord'
  | 'youtube'
  | 'linkedin'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'telegram'
export type ServiceModule =
  | 'mail'
  | 'contact'
  | 'newsletter'
  | 'payment'
  | 'notification'
  | 'analytics'
  | 'auth'
export type SiteModule = 'docs' | 'blog' | 'changelog' | ServiceModule

export interface WebsiteConfig {
  baseUrl: string
  metadata: {
    name: string
    images: { ogImage: string; logoLight: string; logoDark: string; icon: string }
  }
  ui: {
    defaultTheme: 'light' | 'dark' | 'system'
    enableThemeSwitch: boolean
    /**
     * 浏览器 UI 配色（地址栏 / 状态栏）与 PWA manifest 的底色。
     *
     * 必须与 `src/styles/globals.css` 中 `--background` 的明暗取值保持一致——
     * 这两个值会被浏览器渲染在页面之外，读不到 CSS 变量，只能在这里显式声明。
     * 改主题底色时**两处一起改**；`tests/unit/theme-colors.test.ts` 会校验它们
     * 与 `globals.css` 里的 oklch 值等价，漂移会失败。
     */
    themeColor: { light: string; dark: string }
  }
  docs: { enabled: boolean }
  blog: { enabled: boolean }
  changelog: { enabled: boolean }
  mail: { enabled: boolean; provider: 'resend' | 'cloudflare'; supportEmail: string }
  contact: { enabled: boolean }
  newsletter: { enabled: boolean; provider: 'resend' | 'beehiiv' }
  /**
   * 支付模块。
   *
   * `provider` 是**可选配置之一**而非唯一实现：本模板的支付链路（API 路由、webhook、
   * 数据表）都以 provider 为边界，新增 Creem / Waffo 时只需在 `PaymentProviderName`
   * 里加成员并实现该接口，页面与数据库无需改动。`src/db/schema.ts` 的
   * `subscriptions` / `payments` 表用 `customerId` / `subscriptionId` / `invoiceId`
   * 这类**供应商中立**列名，也是为了同一目的。
   *
   * `priceMap` 由 `VITE_STRIPE_PRICE_*` 派生（`src/config/payment.ts`），把定价页的
   * plan id 映射到外部 Price ID；`allowedPriceIds` 从同一份映射汇总，作为
   * `/api/payment` 的白名单。两者同源，避免「白名单里有、映射里没有」这种会让结账
   * 502 的配置。
   */
  payment: {
    enabled: boolean
    provider: PaymentProviderName
    allowedPriceIds: string[]
    priceMap: PriceMap
  }
  notification: { enabled: boolean; provider: 'discord' | 'feishu' }
  analytics: { enabled: boolean; providers: AnalyticsName[] }
  auth: {
    enabled: boolean
    /**
     * 注册后是否必须先验证邮箱才能登录。
     *
     * **这是安全控制，不是邮件功能开关**，因此显式配置，绝不随 `mail.enabled`
     * 隐式降级。邮箱在本模板下游被当作身份依据（如 Stripe 的 `customerEmail`、
     * `ADMIN_EMAILS` 白名单），若允许未验证邮箱登录，任何人都能用不属于自己的
     * 地址注册并以该身份操作。
     *
     * 默认 `false` 是为了让模板开箱即用：默认配置未接邮件（`mail.enabled: false`），
     * 若默认要求验证，better-auth 会拒绝一切未验证用户登录、注册也不再自动登录，
     * 整条邮箱密码路径都不可用。**接上邮件后应把它改为 `true`**——这也是该字段
     * 存在的主要意义。
     *
     * 保留 `false` 等于接受「邮箱未经验证」这一风险，仅适用于确实不需要邮箱可信的
     * 场景（如纯内网、或全部登录都走 OAuth）。注意 `true` + 邮件未配齐是**矛盾
     * 配置**：`getServiceStatuses()` 会把 `auth` 报为 incomplete，`check:env:prod`
     * 直接失败——要求验证却发不出验证邮件，新用户将永远无法登录。
     */
    requireEmailVerification: boolean
  }
  social: Partial<Record<SocialPlatform, string>>
  features: {
    enableI18n: boolean
    enableFileUpload: boolean
    enableApiKeys: boolean
    enableAdmin: boolean
    enableAIGateway: boolean
  }
}

/**
 * 站点集中配置仅承载语言无关的公开值，不读取服务端 env。
 * 随请求语言变化的文案必须在组件、工厂调用或路由 `head()` 内求值。
 * 显式传入公开 env，便于单测与脚本使用独立配置。
 */
export function createWebsiteConfig(env: PublicEnv): WebsiteConfig {
  return {
    baseUrl: env.VITE_BASE_URL,
    metadata: {
      name: 'Jerbix',
      images: {
        ogImage: '/logo.png',
        logoLight: '/logo-horizontal-transparent.svg',
        logoDark: '/logo-horizontal-dark.svg',
        icon: '/icon-jerboa.svg',
      },
    },
    ui: {
      defaultTheme: 'system',
      enableThemeSwitch: true,
      // 与 globals.css 的 --background（浅 0.988 0.0069 304.2448 / 深 0.1473 0.0107 285.0074）等价。
      themeColor: { light: '#FCFAFF', dark: '#0A0A0F' },
    },
    docs: { enabled: true },
    blog: { enabled: true },
    changelog: { enabled: true },
    mail: { enabled: false, provider: 'resend', supportEmail: '' },
    contact: { enabled: false },
    newsletter: { enabled: false, provider: 'resend' },
    payment: {
      // 本仓当前用于本地联调：支付 / 通知 / 分析三模块默认打开。
      // 模板发布给他人时改回 false，让未配置凭据的部署保持「模块关闭」而非「503」。
      enabled: true,
      provider: 'stripe',
      // `allowedPriceIds` 与 `priceMap` **必须同源**：前者是 /api/payment 的白名单，
      // 后者是定价页的取价依据。分成两个手写字段时，常见配置是白名单填了 A、
      // 映射指向 B，结账阶段 502 且现场看不出原因。这里由同一个映射汇总。
      // 汇总结果为空时 /api/payment 放行任意 priceId——`getServiceStatuses()`
      // 会因此把 payment 报为 incomplete，部署校验直接拦下。
      allowedPriceIds: collectPriceIds(buildPriceMap(env)),
      priceMap: buildPriceMap(env),
    },
    notification: { enabled: true, provider: 'discord' },
    analytics: { enabled: true, providers: ['ga'] },
    // auth 默认开启：模板自带登录 / 注册，关闭时对应页面与 API 一律 404。
    // `requireEmailVerification` 默认 false：默认未接邮件，要求验证会让整条邮箱密码
    // 路径不可用（注册不自动登录、登录被拒）。接上邮件后应改为 true。
    auth: { enabled: true, requireEmailVerification: false },
    social: {},
    features: {
      enableI18n: true,
      enableFileUpload: false,
      enableApiKeys: true,
      enableAdmin: true,
      enableAIGateway: false,
    },
  }
}

export const websiteConfig = createWebsiteConfig(publicEnv)
