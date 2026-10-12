import { publicEnv } from '@/env/public'

/**
 * 站点集中配置：开发者改这一处即可调整站点名、文案、图片路径与功能开关。
 *
 * 文案使用字面量而非 `m.*()`：本对象在模块加载期求值，而 Paraglide 的消息函数
 * 依赖按请求写入的 AsyncLocalStorage，模块期调用会被永久冻结为「首个请求」的语言
 * （实测 SSR 中英文两个请求均返回中文）。需要随语言变化的文案请在各组件内调用
 * `m.*()`，本配置只承载语言无关的默认值。
 *
 * `features` 保留为未来业务模块（Plan B）的显式开关；当前仅 `enableI18n` 生效。
 */
export const websiteConfig = {
  baseUrl: publicEnv.VITE_BASE_URL,
  metadata: {
    name: 'SaaS Template',
    title: 'SaaS 起步模板',
    description: '基于 TanStack Start 与 Cloudflare Workers 的 SaaS 起手模板',
    images: {
      ogImage: '/og.png',
      logoLight: '/logo-light.png',
      logoDark: '/logo-dark.png',
    },
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
