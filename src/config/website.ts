import { z } from 'zod'
import type { CheckoutMode, CollectionAccountConfig, CollectionChannel } from '@/collection/types'
import { type PublicEnv, publicEnv } from '@/env/public'

/** `VITE_COLLECTION_ACCOUNTS` 里单个账户的形状（与源码配置同构）。 */
const collectionAccountJson = z.object({
  id: z.string().min(1),
  channel: z.enum(['alipay'] satisfies CollectionChannel[]),
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
  | 'collection'
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
   * `src/payment/price-catalog.ts`）。
   */
  payment: {
    enabled: boolean
    provider: PaymentProviderName
  }
  /**
   * 新订单走哪条结账链路。
   *
   * 两条链路互斥：托管支付交给 provider，核销型支付由用户自行向收款码付款、
   * 管理员核验后结算。`provider` 是默认值，升级不改变既有实例的行为。
   */
  checkout: {
    mode: CheckoutMode
  }
  /**
   * 核销型支付（collection）模块。
   *
   * 与 `payment` 平级的独立模块：它不实现 `PaymentProvider`，没有托管结账页、
   * 没有 webhook、没有 Customer Portal。`accounts` 是收款账户的源码兜底配置，
   * D1 里的运营记录按 `id` 覆盖同名项。
   */
  collection: {
    enabled: boolean
    /** 核验时效承诺（小时），用于页面正文告知用户。 */
    verificationSlaHours: number
    accounts: CollectionAccountConfig[]
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
     * 当前默认 `true`，邮件必须配置完整。`true` + 邮件未配齐是矛盾配置，
     * `getServiceStatuses()` 会报 incomplete，不会自动降级为免验证登录。
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
 * 逗号分隔的名字列表 → 集合；空值与空白项忽略。
 *
 * 返回 `undefined` 表示「没给」，与「给了空列表（表示全关）」是两回事。
 */
function parseNameList(value: string | undefined): Set<string> | undefined {
  if (value === undefined) return undefined
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
  return new Set(names)
}

/**
 * `VITE_COLLECTION_ACCOUNTS`（JSON 数组）→ 收款账户清单。
 *
 * 返回 `undefined` 表示「没给或无效」：非法 JSON、形状不对或空数组都回退源码
 * 兜底配置，**不静默生效半个配置**。「账户没配齐」由服务状态检查如实报出来。
 * 空白串视同未设置。
 */
export function parseCollectionAccounts(
  value: string | undefined,
): CollectionAccountConfig[] | undefined {
  if (value === undefined || value.trim() === '') return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined
    const accounts: CollectionAccountConfig[] = []
    for (const item of parsed) {
      const account = collectionAccountJson.safeParse(item)
      if (!account.success) return undefined
      accounts.push(account.data)
    }
    return accounts
  } catch {
    return undefined
  }
}

/**
 * 按环境变量覆盖模块与能力开关。
 *
 * 同一份代码要发到不同场景：模板的文档站只开文档模块，业务站开支付与邮件。
 * 开关写在代码里就没法让一个构建产物发两处，所以这里允许用
 * `VITE_MODULES` / `VITE_FEATURES`（逗号分隔的白名单）覆盖。
 *
 * 两个变量都缺省时原样返回：代码里的默认值就是唯一事实源。
 */
export function applyEnvOverrides(config: WebsiteConfig, env: PublicEnv): WebsiteConfig {
  const modules = parseNameList(env.VITE_MODULES)
  const features = parseNameList(env.VITE_FEATURES)
  const collectionAccounts = parseCollectionAccounts(env.VITE_COLLECTION_ACCOUNTS)
  if (
    !modules &&
    !features &&
    !collectionAccounts &&
    env.VITE_DOCS_AS_HOME === undefined &&
    env.VITE_PAYMENT_PROVIDER === undefined &&
    env.VITE_CHECKOUT_MODE === undefined
  )
    return config

  const next: WebsiteConfig = { ...config, features: { ...config.features } }
  if (modules) {
    next.docs = { ...next.docs, enabled: modules.has('docs') }
    next.blog = { ...next.blog, enabled: modules.has('blog') }
    next.changelog = { ...next.changelog, enabled: modules.has('changelog') }
    next.mail = { ...next.mail, enabled: modules.has('mail') }
    next.contact = { ...next.contact, enabled: modules.has('contact') }
    next.newsletter = { ...next.newsletter, enabled: modules.has('newsletter') }
    next.payment = { ...next.payment, enabled: modules.has('payment') }
    next.collection = { ...next.collection, enabled: modules.has('collection') }
    next.notification = { ...next.notification, enabled: modules.has('notification') }
    next.analytics = { ...next.analytics, enabled: modules.has('analytics') }
    next.auth = { ...next.auth, enabled: modules.has('auth') }
  }
  if (env.VITE_DOCS_AS_HOME !== undefined) {
    next.docs = { ...next.docs, asHome: env.VITE_DOCS_AS_HOME === 'true' }
  }
  // 同一份代码发不同支付渠道：provider 由构建环境决定，不写死在配置里。
  if (env.VITE_PAYMENT_PROVIDER !== undefined) {
    next.payment = { ...next.payment, provider: env.VITE_PAYMENT_PROVIDER }
  }
  // 结账模式同样由构建环境决定：同一个构建产物不能既收托管支付订单又收核销订单。
  if (env.VITE_CHECKOUT_MODE !== undefined) {
    next.checkout = { ...next.checkout, mode: env.VITE_CHECKOUT_MODE }
  }
  // 收款账户走部署平台的配置变量：不碰源码也能配齐核销链路的「无处可付」项。
  if (collectionAccounts) {
    next.collection = { ...next.collection, accounts: collectionAccounts }
  }
  if (features) {
    next.features = {
      enableI18n: features.has('enableI18n'),
      enableFileUpload: features.has('enableFileUpload'),
      enableApiKeys: features.has('enableApiKeys'),
      enableAdmin: features.has('enableAdmin'),
      enableAIGateway: features.has('enableAIGateway'),
    }
  }
  return next
}

/**
 * 站点集中配置仅承载语言无关的公开值，不读取服务端 env；随请求语言变化的文案
 * 必须在组件、工厂调用或路由 `head()` 内求值。显式传入公开 env 便于单测与脚本复用。
 */
export function createWebsiteConfig(env: PublicEnv): WebsiteConfig {
  return applyEnvOverrides(
    {
      baseUrl: env.VITE_BASE_URL,
      metadata: {
        name: 'Jerbix',
        // 品牌稿的字标是双色：`Jerbi` 墨色、`x` 紫色。
        logoAccent: 'x',
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
      docs: { enabled: true },
      blog: { enabled: true },
      changelog: { enabled: true },
      // 支持收件邮箱：出厂是占位地址，`pnpm run init` 会换成你自己的。
      mail: { enabled: true, provider: 'resend', supportEmail: 'support@example.com' },
      contact: { enabled: false },
      newsletter: { enabled: false, provider: 'resend' },
      payment: {
        // 当前站点启用 Stripe 收款；通知与分析待配置后单独开启。
        enabled: true,
        provider: 'stripe',
      },
      // 核销型支付默认关闭：开了才会展示收款码链路，升级不改变既有实例行为。
      checkout: { mode: 'provider' },
      collection: {
        enabled: false,
        verificationSlaHours: 24,
        // 出厂没有收款账户：使用者需在 `src/config/website.ts` 填自己的收款码，
        // 或在管理台上传后由 D1 覆盖。这里只放占位，不放真实收款码。
        accounts: [],
      },
      notification: { enabled: false, provider: 'discord' },
      analytics: { enabled: true, providers: ['ga'] },
      // auth 默认开启：模板自带登录 / 注册，关闭时对应页面与 API 一律 404。
      auth: { enabled: true, requireEmailVerification: true },
      social: {},
      features: {
        enableI18n: true,
        enableFileUpload: false,
        enableApiKeys: true,
        enableAdmin: true,
        enableAIGateway: false,
      },
    },
    env,
  )
}

export const websiteConfig = createWebsiteConfig(publicEnv)
