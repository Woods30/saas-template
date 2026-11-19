import { z } from 'zod'
import { defaultSettingsValues } from '@/core/config/registry'
import { applySettingsToConfig } from '@/core/config/settings'
import type { PublicEnv } from '@/core/env/public'
import { publicEnv } from '@/core/env/public'
import type { ManualPaymentAccountConfig, ManualPaymentChannel } from '@/types/manual-payments'

/** `VITE_MANUAL_PAYMENT_ACCOUNTS` 里单个账户的形状（与源码配置同构）。 */
const manualPaymentAccountJson = z.object({
  id: z.string().min(1),
  channel: z.enum(['alipay'] satisfies ManualPaymentChannel[]),
  displayName: z.string().min(1),
  currency: z.literal('cny'),
  qrImageUrl: z.string().min(1),
})

export type PaymentProviderName = 'stripe' | 'creem'
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
  | 'manualPayments'
  | 'notification'
  | 'analytics'
  | 'auth'
export type SiteModule = 'docs' | 'blog' | 'changelog' | ServiceModule

export interface WebsiteConfig {
  baseUrl: string
  metadata: {
    name: string
    /**
     * 字标末尾用强调色渲染的部分（如 Jerbix 的紫色 `x`）。
     *
     * 纯展示用：`name` 仍是 SEO / `<title>` / manifest 的唯一来源。留空则整串用墨色。
     * 品牌稿若没有双色字标，改成 `''` 即可。
     */
    logoAccent: string
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
  /**
   * 首页 CTA 指向的商品与付费方式。
   *
   * 商品本身在 `src/config/products.ts` 里声明；这里只记录「首页卖的是哪一个」。
   * 首页、结账取消回跳与 API 校验都读这一处，改商品时只动这一行。
   *
   * **不含金额**：价格的唯一事实源是 Stripe 的价格目录，页面展示与结账收款
   * 读同一份目录。配置里再存一份金额只会让两者漂移。
   */
  landingOffer: { productId: string; offerId: string }
  /**
   * 静态营销页开关。
   *
   * 这些页面没有对应的服务模块（不需要后端），但「提不提供」仍随站点定位变化：
   * 不卖等候名单的站点，链接与页面都该消失，而不是留一个空壳。
   */
  pages: {
    waitlist: boolean
  }
  docs: {
    /**
     * 本仓是否提供文档站：关闭时整棵 docs 子树以 404 呈现。
     */
    enabled: boolean
    /**
     * 外部文档站地址（可选）。
     *
     * 文档站部署在另一个域（如模板仓的独立文档域）时，导航与页脚的「文档」入口
     * 指向这里，而不是站内路由；此时本仓可以关闭 docs 模块，访客仍有去处。
     * 留空表示文档就在本仓的 `/docs`。
     */
    siteUrl?: string
    /**
     * 主站地址（可选）：文档站独立部署时，文档中心里的「返回官网」指向这里。
     *
     * 留空则不显示该入口——文档就在本仓时没有「另一个站」可返回。
     */
    homeUrl?: string
    /**
     * 本仓就是文档站：根路径跳到文档首页，而不是营销首页。
     *
     * 文档站部署在独立域时用：访客来的是文档，根路径给营销首页会让人以为
     * 走错了地方。
     */
    asHome?: boolean
  }
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
   * 「卖什么、怎么卖」不在这里，而在 `src/config/products.ts`：产品与销售引用都在
   * 那儿定义。真正的价格 ID 与金额由所选渠道在运行时给出（见
   * `src/core/payment/price-catalog.ts`）。
   */
  payment: {
    enabled: boolean
    provider: PaymentProviderName
    /**
     * 结账链路：渠道支付与核销收款互斥。
     *
     * `provider` 走托管结账页（Stripe / Creem），`manual_payments` 走核销型支付
     * （用户按订单金额向收款码付款，管理员核验后结算）。首页的购买入口按它
     * 分流：选了 `manual_payments` 就不再调渠道结账。
     */
    checkoutMode: 'provider' | 'manual_payments'
  }
  /**
   * 核销型支付（manual payments）模块。
   *
   * 与 `payment` 平级的独立模块：它不实现 `PaymentProvider`，没有托管结账页、
   * 没有 webhook、没有 Customer Portal。`accounts` 是收款账户的源码兜底配置，
   * 数据库里的运营记录按 `id` 覆盖同名项。
   */
  manualPayments: {
    enabled: boolean
    /** 核验时效承诺（小时），用于页面正文告知用户。 */
    verificationSlaHours: number
    accounts: ManualPaymentAccountConfig[]
  }
  notification: { enabled: boolean; provider: 'discord' | 'feishu' }
  /**
   * 分析渠道。
   *
   * `config` 里是各渠道的公开标识（GA 测量 ID、Umami 站点 ID 等）：它们在后台改，
   * 又必须下发到浏览器才能注入脚本，因此随配置一起序列化进页面。秘密凭据
   * （如 Turnstile secret）不在这里，见 `core/config/service`。
   */
  analytics: {
    enabled: boolean
    providers: AnalyticsName[]
    config: {
      gaId?: string
      plausibleDomain?: string
      umamiWebsiteId?: string
      umamiScriptUrl?: string
      clarityProjectId?: string
    }
  }
  /** Turnstile 的**公开**站点 key；secret 只在服务端配置里。 */
  captcha: { siteKey?: string }
  auth: {
    enabled: boolean
    /**
     * 注册后是否必须先验证邮箱才能登录。
     *
     * 这是安全控制而非邮件功能开关：邮箱在下游被当作身份依据（Stripe 的
     * `customerEmail`、`ADMIN_EMAILS`），放行未验证邮箱等于允许冒用他人地址。
     *
     * 当前默认 `true`，邮件必须配置完整。`true` + 邮件未配齐是矛盾配置，
     * `getServiceStatuses()` 会报 incomplete，不会自动降级为免验证登录。
     */
    requireEmailVerification: boolean
  }
  social: Partial<Record<SocialPlatform, string>>
  /**
   * 默认 SEO 文案。
   *
   * 品牌与 SEO 是**唯一**进数据库的两组配置：后台改完即时生效，其余文案仍编译期。
   * `locales` 是分语言覆盖，缺省用 `default`。
   */
  seo: {
    default: { title: string; description: string; keywords: string[] }
    locales: Record<string, { title?: string; description?: string; keywords?: string[] }>
  }
  features: {
    enableI18n: boolean
    enableFileUpload: boolean
    enableApiKeys: boolean
    enableAdmin: boolean
    enableAIGateway: boolean
  }
}

/**
 * 收款账户清单字符串（JSON 数组）→ 收款账户清单。
 *
 * `db:seed` 用它把部署环境里的 `VITE_MANUAL_PAYMENT_ACCOUNTS` 抄进配置表；运行期只读配置表。
 *
 * 返回 `undefined` 表示「没给或无效」：非法 JSON、形状不对或空数组都回退源码
 * 兜底配置，**不静默生效半个配置**。「账户没配齐」由服务状态检查如实报出来。
 * 空白串视同未设置。
 */
export function parseManualPaymentAccounts(
  value: string | undefined,
): ManualPaymentAccountConfig[] | undefined {
  if (value === undefined || value.trim() === '') return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined
    const accounts: ManualPaymentAccountConfig[] = []
    for (const item of parsed) {
      const account = manualPaymentAccountJson.safeParse(item)
      if (!account.success) return undefined
      accounts.push(account.data)
    }
    return accounts
  } catch {
    return undefined
  }
}

/**
 * 站点集中配置仅承载语言无关的公开值，不读取服务端 env；随请求语言变化的文案
 * 必须在组件、工厂调用或路由 `head()` 内求值。显式传入公开 env 便于单测与脚本复用。
 *
 * 这里只给**结构**（地址、图片、UI、首页 CTA）；品牌、开关、渠道与凭据全部来自
 * `core/config/registry` 的出厂值，经 `applySettingsToConfig` 填进来——默认值
 * 只维护一份。
 */
export function createWebsiteConfig(env: PublicEnv): WebsiteConfig {
  return applySettingsToConfig(
    {
      baseUrl: env.VITE_BASE_URL,
      metadata: {
        name: '',
        // 品牌稿的字标是双色：`Jerbi` 墨色、`x` 紫色。
        logoAccent: '',
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
      landingOffer: { productId: 'template', offerId: 'once' },
      pages: { waitlist: true },
      // 以下分支的形状由 `applySettingsToConfig` 覆盖，这里只声明结构。
      docs: { enabled: false },
      blog: { enabled: false },
      changelog: { enabled: false },
      mail: { enabled: false, provider: 'resend', supportEmail: '' },
      contact: { enabled: false },
      newsletter: { enabled: false, provider: 'resend' },
      payment: { enabled: false, provider: 'stripe', checkoutMode: 'provider' },
      manualPayments: { enabled: false, verificationSlaHours: 24, accounts: [] },
      notification: { enabled: false, provider: 'discord' },
      analytics: { enabled: false, providers: [], config: {} },
      captcha: {},
      auth: { enabled: false, requireEmailVerification: true },
      social: {},
      seo: { default: { title: '', description: '', keywords: [] }, locales: {} },
      features: {
        enableI18n: true,
        enableFileUpload: false,
        enableApiKeys: true,
        enableAdmin: true,
        enableAIGateway: false,
      },
    },
    defaultSettingsValues(),
  )
}

/**
 * 出厂配置（注册表里的默认值）。
 *
 * 与 `websiteConfig` 的区别：它是**不随数据库配置变化**的那一份，
 * 数据库里没有对应字段时回落到这里。
 */
export const baseConfig = createWebsiteConfig(publicEnv)

/**
 * 当前生效的配置。
 *
 * 数据库配置装上来之前是出厂配置；`setResolvedConfig` 之后是合并后的结果。
 * 服务端在每个请求入口刷新它，客户端在 hydration 前从注入的 JSON 装上它——
 * 两边拿到同一份，SSR 与 hydration 不会因为配置不同而错位。
 */
let resolvedConfig: WebsiteConfig | undefined

/** 装上生效配置（服务端读到数据库配置后调用）。 */
export function setResolvedConfig(config: WebsiteConfig): void {
  resolvedConfig = config
}

/** 当前生效配置；未装载时等于出厂配置。 */
export function getResolvedConfig(): WebsiteConfig {
  return resolvedConfig ?? baseConfig
}

/**
 * 全站读配置的入口。
 *
 * 用 Proxy 而不是让每个调用点改成 `getResolvedConfig()`：调用点有几十处，
 * 逐个改会把「配置从哪来」这件事散到全仓；而 Proxy 让**取值时机**统一由
 * `getResolvedConfig()` 决定，读到的永远是当前生效的那份。
 */
export const websiteConfig: WebsiteConfig = new Proxy(baseConfig, {
  get(_target, property, receiver) {
    return Reflect.get(getResolvedConfig(), property, receiver)
  },
})
