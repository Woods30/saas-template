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
  notification: { enabled: boolean }
  analytics: { enabled: boolean; providers: AnalyticsName[] }
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
    notification: { enabled: false },
    analytics: { enabled: false, providers: [] },
    social: {},
    features: {
      enableI18n: true,
      enableFileUpload: false,
      enableApiKeys: false,
      enableAdmin: false,
      enableAIGateway: false,
    },
  }
}

export const websiteConfig = createWebsiteConfig(publicEnv)
