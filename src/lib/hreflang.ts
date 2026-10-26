import { LOCALES, type Locale, localeConfig } from '@/lib/locale'
import { getBaseUrl } from '@/lib/urls'

export interface AlternateLink {
  hreflang: string
  href: string
}

/**
 * 生成给定路径的 hreflang alternate 链接列表。
 * - x-default 指向无语言前缀的路径
 * - 其他语言路径以 `/{locale}` 为前缀
 */
export function getAlternateLinks(pathname: string): AlternateLink[] {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
  const base = getBaseUrl()
  return [
    { hreflang: 'x-default', href: `${base}${normalized}` },
    ...LOCALES.map((l: Locale) => ({
      hreflang: localeConfig[l].hreflang,
      href: `${base}/${l}${normalized === '/' ? '' : normalized}`,
    })),
  ]
}
