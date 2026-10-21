import { websiteConfig } from '@/config/website'
import { defaultLocale, LOCALES, type Locale, localeConfig } from '@/lib/locale'
import { getBaseUrl, getCanonicalUrl, normalizeLeadingSlash } from '@/lib/urls'

/** 页面在 schema.org 里的节点类型；`none` 表示不额外生成页面节点。 */
export type SeoPageType = 'AboutPage' | 'ContactPage' | 'CollectionPage' | 'WebPage'

interface SeoOptions {
  title: string
  description?: string
  image?: string
  type?: 'website' | 'article'
  /** 当前 locale，用于 hreflang alternates 与 `og:locale`；省略则都不输出。 */
  locale?: Locale
  /**
   * 该页面**真实存在**的其他语言版本。
   *
   * 缺省时视为全部语言都有（静态页的常见情况）。内容页应显式传入，否则 hreflang 会
   * 把爬虫指向 404——「声明了但不存在」比「没声明」更糟。
   */
  alternateLocales?: readonly Locale[]
  /** 标记页面不应被索引（工作台等登录后页面）。 */
  noindex?: boolean
  /** `twitter:site` 的 `@handle`；省略则读取 `websiteConfig.social.x`。 */
  twitterSite?: string
  /** 页面类型；提供时在 `scripts` 里附带 Organization + WebSite + 该页面节点。 */
  pageType?: SeoPageType
}

/**
 * 生成路由 `head()` 所需的 meta、canonical 与结构化数据。
 *
 * 设计取向：**只做加法**。新增字段不改变既有输出值，下游测试用 `toContainEqual`
 * 断言精确对象。
 *
 * 语言相关文案**不**在这里读配置：`title` / `description` 由调用点用 `m.*()` 在
 * `head()` 内求值，否则会在模块加载时固化语言。
 */
export function seo(path: string, options: SeoOptions) {
  const url = getCanonicalUrl(path)
  // 分享卡片没有图会退化成一整行文字，等于没有卡片；缺省回退品牌 OG 图。
  const image = toAbsoluteUrl(options.image ?? websiteConfig.metadata.images.ogImage)
  const locale = options.locale
  const otherLocales = options.alternateLocales ?? LOCALES.filter((l) => l !== locale)

  const alternates = locale
    ? [
        // x-default 指向默认语言的**带前缀**地址：本仓 canonical 一律带语言前缀，
        // 不存在「无前缀 = 默认语言」的约定。
        {
          rel: 'alternate' as const,
          hrefLang: 'x-default',
          href: localeUrl(defaultLocale, path),
        },
        ...otherLocales.map((l) => ({
          rel: 'alternate' as const,
          // 必须 camelCase：TanStack 的 `<Asset>` 会把 attrs 直接摊到 `<link>` 上。
          hrefLang: localeConfig[l].hreflang,
          href: localeUrl(l, path),
        })),
      ]
    : []

  const twitterSite = options.twitterSite ?? socialHandle()

  return {
    meta: [
      { title: options.title },
      ...(options.description ? [{ name: 'description', content: options.description }] : []),
      ...(options.noindex ? [{ name: 'robots', content: 'noindex' }] : []),
      { property: 'og:title', content: options.title },
      { property: 'og:type', content: options.type ?? 'website' },
      { property: 'og:url', content: url },
      { property: 'og:site_name', content: websiteConfig.metadata.name },
      ...(locale
        ? [
            { property: 'og:locale', content: localeConfig[locale].ogLocale },
            ...otherLocales.map((l) => ({
              property: 'og:locale:alternate',
              content: localeConfig[l].ogLocale,
            })),
          ]
        : []),
      ...(options.description
        ? [{ property: 'og:description', content: options.description }]
        : []),
      { property: 'og:image', content: image },
      { name: 'twitter:card', content: 'summary_large_image' },
      ...(twitterSite ? [{ name: 'twitter:site', content: twitterSite }] : []),
    ],
    links: [{ rel: 'canonical', href: url }, ...alternates],
    // 结构化数据经 `scripts` 输出。注意本仓的 CSP 重写器会跳过 `application/ld+json`，
    // 而 TanStack 会给 head script 注入 nonce——若改用这里，需先统一 nonce 策略。
    ...(options.pageType ? { scripts: [pageJsonLdScript(path, options, options.pageType)] } : {}),
  }
}

/** 某语言下的绝对 URL；`/` 不带多余路径段。 */
function localeUrl(locale: Locale, path: string): string {
  return `${getBaseUrl()}/${locale}${path === '/' ? '' : path}`
}

/** 从 `websiteConfig.social.x` 推导 `twitter:site` 句柄；未配置时返回 `undefined`。 */
function socialHandle(): string | undefined {
  const handle = websiteConfig.social.x
  if (!handle) return undefined
  // 配置里可能写完整 URL 或裸句柄；统一成 `@handle`。
  const name = handle.replace(/^https?:\/\/(?:www\.)?x\.com\//i, '').replace(/^@/, '')
  const trimmed = name.split(/[/?#]/)[0]?.trim()
  return trimmed ? `@${trimmed}` : undefined
}

/**
 * 生成 Organization + WebSite + 页面节点组成的 `@graph`。
 *
 * 必须在同一个 `@graph` 里，页面节点才能通过 `isPartOf` / `publisher` 指向其他节点。
 */
function pageJsonLdScript(path: string, options: SeoOptions, pageType: SeoPageType) {
  const url = getCanonicalUrl(path)
  const base = getBaseUrl()
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${base}/#organization`,
      name: websiteConfig.metadata.name,
      url: base,
      logo: `${base}${normalizeLeadingSlash(websiteConfig.metadata.images.icon)}`,
    },
    {
      '@type': 'WebSite',
      '@id': `${base}/#website`,
      name: websiteConfig.metadata.name,
      url: base,
      publisher: { '@id': `${base}/#organization` },
    },
    {
      '@type': pageType,
      '@id': `${url}#page`,
      name: options.title,
      ...(options.description ? { description: options.description } : {}),
      url,
      isPartOf: { '@id': `${base}/#website` },
      ...(options.locale ? { inLanguage: localeConfig[options.locale].hreflang } : {}),
    },
  ]
  return {
    type: 'application/ld+json',
    // `<` 必须转义：内容里出现 `</script>` 会提前结束脚本标签。
    children: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
      /</g,
      '\\u003c',
    ),
  }
}

/**
 * 把 `image` 补全为绝对 URL。
 *
 * 协议相对 URL（`//cdn...`）须补上站点协议，否则会拼成畸形地址。
 */
function toAbsoluteUrl(image: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(image)) return image
  if (image.startsWith('//')) {
    const { protocol } = new URL(getBaseUrl())
    return `${protocol}${image}`
  }
  return `${getBaseUrl()}${normalizeLeadingSlash(image)}`
}
