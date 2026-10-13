import { publicEnv } from '@/env/public'

/**
 * 站点集中配置：开发者改这一处即可调整站点名、图片路径与功能开关。
 *
 * 本对象在模块加载期求值，只承载**语言无关**的值（名称、资源路径、开关）。
 * 需要随请求语言变化的文案（标题、描述等）必须在组件或路由 `head()` 内调用
 * `m.*()`，不要放进本配置。
 *
 * `features` 保留为未来业务模块（Plan B）的显式开关；当前仅 `enableI18n` 生效。
 */
export const websiteConfig = {
  baseUrl: publicEnv.VITE_BASE_URL,
  metadata: {
    name: 'Jerbix',
    images: {
      ogImage: '/logo.png',
      logoLight: '/logo.png',
      logoDark: '/logo.png',
    },
  },
  // mail 与 notification 由各业务模块自行读取，不在 features 中开关。
  mail: {
    supportEmail: '' as string,
  },
  notification: {
    enable: false as boolean,
  },
  newsletter: {
    provider: 'resend' as 'resend' | 'beehiiv',
  },
  payment: {
    provider: 'stripe' as const,
    allowedPriceIds: [] as string[],
  },
  features: {
    enableFileUpload: false,
    enableApiKeys: false,
    enableDocs: false,
    enableI18n: true,
    enableNewsletter: false,
    enableContact: false,
    enableAdmin: false,
    enableAIGateway: false,
  },
} as const

export type WebsiteConfig = typeof websiteConfig
