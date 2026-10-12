import { getBaseUrl, getCanonicalUrl, normalizeLeadingSlash } from '@/lib/urls'

interface SeoOptions {
  title: string
  description?: string
  image?: string
  type?: 'website' | 'article'
}

/**
 * 生成路由 `head()` 所需的 meta 与 canonical link。
 *
 * - 可选字段（`description` / `image`）缺省时不输出对应标签，避免留下空占位；
 * - 相对 `image` 路径会补全为绝对 URL，绝对 URL 原样保留；
 * - `og:url` 与 canonical 同源，均取自 {@link getCanonicalUrl}。
 */
export function seo(path: string, options: SeoOptions) {
  const url = getCanonicalUrl(path)
  const image = options.image ? toAbsoluteUrl(options.image) : undefined

  return {
    meta: [
      { title: options.title },
      ...(options.description ? [{ name: 'description', content: options.description }] : []),
      { property: 'og:title', content: options.title },
      { property: 'og:type', content: options.type ?? 'website' },
      { property: 'og:url', content: url },
      ...(options.description
        ? [{ property: 'og:description', content: options.description }]
        : []),
      ...(image ? [{ property: 'og:image', content: image }] : []),
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}

/**
 * 把 `image` 补全为绝对 URL。
 *
 * - 已是绝对 URL（含 `scheme://`）原样返回；
 * - 协议相对 URL（以 `//` 开头，如 `//cdn.example.com/og.png`）补上当前站点的协议，
 *   否则会被拼成 `https://acme.example.com//cdn.example.com/og.png` 这类畸形地址；
 * - 其余相对路径（`/og.png`、`og.png`）基于站点基址补全。
 */
function toAbsoluteUrl(image: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(image)) return image
  if (image.startsWith('//')) {
    const { protocol } = new URL(getBaseUrl())
    return `${protocol}${image}`
  }
  return `${getBaseUrl()}${normalizeLeadingSlash(image)}`
}
