import { type PublicEnv, publicEnv } from '@/env/public'

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
  ui: { defaultTheme: 'light' | 'dark' | 'system'; enableThemeSwitch: boolean }
  docs: { enabled: boolean }
  blog: { enabled: boolean }
  changelog: { enabled: boolean }
  mail: { enabled: boolean; provider: 'resend' | 'cloudflare'; supportEmail: string }
  contact: { enabled: boolean }
  newsletter: { enabled: boolean; provider: 'resend' | 'beehiiv' }
  payment: { enabled: boolean; provider: 'stripe'; allowedPriceIds: string[] }
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
