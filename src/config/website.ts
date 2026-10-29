import { type PublicEnv, publicEnv } from '@/env/public'

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
     * 必须与 `globals.css` 的 `--background` 明暗取值一致：这些值渲染在页面之外，
     * 读不到 CSS 变量。改主题时两处一起改，`tests/unit/theme-colors.test.ts` 会校验。
     */
    themeColor: { light: string; dark: string }
  }
  /** 首页模板的 Checkout 选项；priceUsd 同时用于展示与服务端收款校验。 */
  template: { priceUsd: number; productId: string; offerId: string }
  docs: { enabled: boolean }
  blog: { enabled: boolean }
  changelog: { enabled: boolean }
  mail: { enabled: boolean; provider: 'resend' | 'cloudflare'; supportEmail: string }
  contact: { enabled: boolean }
  newsletter: { enabled: boolean; provider: 'resend' | 'beehiiv' }
  /**
   * 支付模块。
   *
   * 支付链路以 provider 为边界，新增供应商只需扩 `PaymentProviderName` 并实现接口；
   * `subscriptions` / `payments` 表用供应商中立的列名也是同一目的。
   *
   * 「卖什么、怎么卖」不在这里，而在 `src/config/products.ts`：产品、付费方式与
   * Stripe Price 的 `lookup_key` 都在那儿定义。真正的 Price id 与金额由 Stripe 在
   * 运行时给出（见 `src/payment/price-catalog.ts`）。
   */
  payment: {
    enabled: boolean
    provider: PaymentProviderName
  }
  notification: { enabled: boolean; provider: 'discord' | 'feishu' }
  analytics: { enabled: boolean; providers: AnalyticsName[] }
  auth: {
    enabled: boolean
    /**
     * 注册后是否必须先验证邮箱才能登录。
     *
     * 这是安全控制而非邮件功能开关：邮箱在下游被当作身份依据（Stripe 的
     * `customerEmail`、`ADMIN_EMAILS`），放行未验证邮箱等于允许冒用他人地址。
     *
     * 默认 `false` 只因默认未接邮件，否则整条邮箱密码路径不可用；**接上邮件后应改为
     * `true`**。`true` + 邮件未配齐是矛盾配置，`getServiceStatuses()` 会报 incomplete。
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
 * 站点集中配置仅承载语言无关的公开值，不读取服务端 env；随请求语言变化的文案
 * 必须在组件、工厂调用或路由 `head()` 内求值。显式传入公开 env 便于单测与脚本复用。
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
    template: { priceUsd: 99, productId: 'template', offerId: 'once' },
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
    },
    notification: { enabled: true, provider: 'discord' },
    analytics: { enabled: true, providers: ['ga'] },
    // auth 默认开启：模板自带登录 / 注册，关闭时对应页面与 API 一律 404。
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
