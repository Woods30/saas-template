import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 站点 URL 与 SEO helper 的单测。
 *
 * 关键约束：`getBaseUrl` / `getCanonicalUrl` / `seo` 读取的是模块加载期解析好的
 * `publicEnv`，因此这里用 `vi.stubEnv` 注入自定义 `VITE_BASE_URL` 后 `resetModules`
 * 再动态导入，验证「非默认 base URL 真正影响导出函数」，而不是恒定 localhost。
 */

const CUSTOM_BASE_URL = 'https://acme.example.com'

type UrlsModule = typeof import('@/lib/urls')
type SeoModule = typeof import('@/lib/seo')
type WebsiteModule = typeof import('@/config/website')

/** 在给定 VITE_BASE_URL 下重新加载模块，确保读取的是本次解析结果。 */
async function loadModules(baseUrl: string | undefined): Promise<{
  urls: UrlsModule
  seoModule: SeoModule
  website: WebsiteModule
}> {
  if (baseUrl === undefined) {
    vi.stubEnv('VITE_BASE_URL', undefined)
  } else {
    vi.stubEnv('VITE_BASE_URL', baseUrl)
  }
  vi.resetModules()
  const [urls, seoModule, website] = await Promise.all([
    import('@/lib/urls'),
    import('@/lib/seo'),
    import('@/config/website'),
  ])
  return { urls, seoModule, website }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getBaseUrl', () => {
  it('读取非默认 base URL，而非恒定 localhost', async () => {
    const { urls } = await loadModules(CUSTOM_BASE_URL)
    expect(urls.getBaseUrl()).toBe(CUSTOM_BASE_URL)
  })

  it('未设置时回退到默认 base URL', async () => {
    const { urls } = await loadModules(undefined)
    expect(urls.getBaseUrl()).toBe('http://localhost:3000')
  })

  it('拒绝非法 base URL（解析期抛错）', async () => {
    vi.stubEnv('VITE_BASE_URL', 'not-a-url')
    vi.resetModules()
    await expect(import('@/lib/urls')).rejects.toThrow()
  })
})

describe('getCanonicalUrl', () => {
  it('规范化缺少前导斜杠的 path', async () => {
    const { urls } = await loadModules(CUSTOM_BASE_URL)
    expect(urls.getCanonicalUrl('pricing')).toBe(`${CUSTOM_BASE_URL}/pricing`)
  })

  it('保留已有前导斜杠，不产生双斜杠', async () => {
    const { urls } = await loadModules(CUSTOM_BASE_URL)
    expect(urls.getCanonicalUrl('/pricing')).toBe(`${CUSTOM_BASE_URL}/pricing`)
  })

  it('空 path 规范化为站点根', async () => {
    const { urls } = await loadModules(CUSTOM_BASE_URL)
    expect(urls.getCanonicalUrl('')).toBe(`${CUSTOM_BASE_URL}/`)
  })

  it('base URL 带尾斜杠时不产生双斜杠', async () => {
    const { urls } = await loadModules(`${CUSTOM_BASE_URL}/`)
    expect(urls.getCanonicalUrl('/pricing')).toBe(`${CUSTOM_BASE_URL}/pricing`)
  })

  it('非默认 base URL 真正反映到 canonical', async () => {
    const { urls } = await loadModules(CUSTOM_BASE_URL)
    expect(urls.getCanonicalUrl('/')).toBe(`${CUSTOM_BASE_URL}/`)
    expect(urls.getCanonicalUrl('/')).not.toContain('localhost')
  })
})

describe('seo()', () => {
  it('输出 title、description、OG 与 canonical', async () => {
    const { seoModule } = await loadModules(CUSTOM_BASE_URL)
    const head = seoModule.seo('/pricing', {
      title: '价格 · Acme',
      description: '简洁透明的定价方案',
      type: 'website',
    })

    expect(head.meta).toContainEqual({ title: '价格 · Acme' })
    expect(head.meta).toContainEqual({ name: 'description', content: '简洁透明的定价方案' })
    expect(head.meta).toContainEqual({ property: 'og:title', content: '价格 · Acme' })
    expect(head.meta).toContainEqual({ property: 'og:type', content: 'website' })
    expect(head.meta).toContainEqual({
      property: 'og:description',
      content: '简洁透明的定价方案',
    })
    expect(head.meta).toContainEqual({
      property: 'og:url',
      content: `${CUSTOM_BASE_URL}/pricing`,
    })
    expect(head.meta).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' })
    expect(head.links).toContainEqual({
      rel: 'canonical',
      href: `${CUSTOM_BASE_URL}/pricing`,
    })
  })

  it('省略可选 description 时不输出空占位', async () => {
    const { seoModule } = await loadModules(CUSTOM_BASE_URL)
    const head = seoModule.seo('/', { title: '仅标题' })

    expect(head.meta).toContainEqual({ title: '仅标题' })
    expect(head.meta.some((entry) => 'name' in entry && entry.name === 'description')).toBe(false)
    expect(
      head.meta.some((entry) => 'property' in entry && entry.property === 'og:description'),
    ).toBe(false)
  })

  it('未提供 image 时不输出 og:image', async () => {
    const { seoModule } = await loadModules(CUSTOM_BASE_URL)
    const head = seoModule.seo('/', { title: '无图' })
    expect(head.meta.some((entry) => 'property' in entry && entry.property === 'og:image')).toBe(
      false,
    )
  })

  it('把相对 image 路径转成绝对 URL', async () => {
    const { seoModule } = await loadModules(CUSTOM_BASE_URL)
    const head = seoModule.seo('/', { title: '有图', image: '/og.png' })
    expect(head.meta).toContainEqual({
      property: 'og:image',
      content: `${CUSTOM_BASE_URL}/og.png`,
    })
  })

  it('保留已是绝对 URL 的 image', async () => {
    const { seoModule } = await loadModules(CUSTOM_BASE_URL)
    const head = seoModule.seo('/', { title: '有图', image: 'https://cdn.example.com/og.png' })
    expect(head.meta).toContainEqual({
      property: 'og:image',
      content: 'https://cdn.example.com/og.png',
    })
  })

  it('协议相对 image（// 开头）按当前协议补全为绝对 URL', async () => {
    const { seoModule } = await loadModules(CUSTOM_BASE_URL)
    const head = seoModule.seo('/', { title: '有图', image: '//cdn.example.com/og.png' })
    expect(head.meta).toContainEqual({
      property: 'og:image',
      content: 'https://cdn.example.com/og.png',
    })
  })

  it('type 缺省为 website，可显式指定 article', async () => {
    const { seoModule } = await loadModules(CUSTOM_BASE_URL)
    expect(seoModule.seo('/', { title: 'a' }).meta).toContainEqual({
      property: 'og:type',
      content: 'website',
    })
    expect(seoModule.seo('/', { title: 'b', type: 'article' }).meta).toContainEqual({
      property: 'og:type',
      content: 'article',
    })
  })

  it('传入 locale 时输出 hreflang alternates，键名用 hrefLang（camelCase）', async () => {
    // TanStack Router 的 `<Asset>` 会把 `links[].attrs` 直接展开到 `<link {...attrs} />`。
    // React JSX 只接受 `hrefLang`（camelCase）作为 `<link hreflang>` 的属性名；若用
    // 小写 `hreflang`，运行时会抛 "Invalid DOM property `hreflang`"。本测试是回归守卫。
    const { seoModule } = await loadModules(CUSTOM_BASE_URL)
    const head = seoModule.seo('/pricing', { title: '价格 · Acme', locale: 'zh' })

    expect(head.links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'en',
      href: `${CUSTOM_BASE_URL}/en/pricing`,
    })
    // 任何 alternate 都不应使用小写 `hreflang` 键
    for (const link of head.links) {
      if ('rel' in link && link.rel === 'alternate') {
        expect(link).not.toHaveProperty('hreflang')
      }
    }
  })

  it('不传 locale 时不输出 alternates', async () => {
    const { seoModule } = await loadModules(CUSTOM_BASE_URL)
    const head = seoModule.seo('/pricing', { title: '价格 · Acme' })
    expect(head.links.some((link) => 'rel' in link && link.rel === 'alternate')).toBe(false)
  })
})

describe('websiteConfig', () => {
  it('baseUrl 反映解析后的 VITE_BASE_URL', async () => {
    const { website } = await loadModules(CUSTOM_BASE_URL)
    expect(website.websiteConfig.baseUrl).toBe(CUSTOM_BASE_URL)
  })

  it('只承载语言无关值：名称与图片路径', async () => {
    const { website } = await loadModules(CUSTOM_BASE_URL)
    const { metadata } = website.websiteConfig
    expect(metadata.name).toBe('Jerbix')
    expect(metadata.images.ogImage).toBe('/logo.png')
  })

  it('不保留语言相关的 title / description（随语言变化的文案由 m.*() 输出）', async () => {
    const { website } = await loadModules(CUSTOM_BASE_URL)
    const { metadata } = website.websiteConfig
    expect('title' in metadata).toBe(false)
    expect('description' in metadata).toBe(false)
  })

  it('features 为显式布尔开关，i18n 默认开启', async () => {
    const { website } = await loadModules(CUSTOM_BASE_URL)
    const { features } = website.websiteConfig
    expect(features.enableI18n).toBe(true)
    expect(Object.values(features).every((value) => typeof value === 'boolean')).toBe(true)
  })
})
