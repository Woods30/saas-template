import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `seo(..., { pageType })` 产出的 JSON-LD `@graph` 回归。
 *
 * 这里守两件事：
 *
 * 1. **三个节点在同一个 `@graph` 里**。页面节点靠 `isPartOf` / `publisher` 指向站点与
 *    组织；拆成独立 script 时搜索引擎只能看到三个互不相干的孤立节点。
 * 2. **`<` 被转义**。`description` 里一旦出现 `</script>`，未转义会提前闭合脚本标签，
 *    后续内容变成可执行的 HTML——这是模板层面的注入面，不是理论风险。
 *
 * 同 `seo.test.ts`，通过 `vi.stubEnv` + `resetModules` 让自定义 `VITE_BASE_URL` 真正生效。
 */

const CUSTOM_BASE_URL = 'https://acme.example.com'

type SeoModule = typeof import('@/lib/seo')

interface JsonLdScript {
  type: string
  children: string
}

interface JsonLdNode {
  '@type': string
  '@id'?: string
  name?: string
  url?: string
  inLanguage?: string
  description?: string
  isPartOf?: { '@id': string }
  publisher?: { '@id': string }
}

async function loadSeo(): Promise<SeoModule> {
  vi.stubEnv('VITE_BASE_URL', CUSTOM_BASE_URL)
  vi.resetModules()
  return import('@/lib/seo')
}

/** 取出 `seo()` 返回的脚本并解析回对象，顺带断言形状。 */
function parseGraph(seoModule: SeoModule, options: Parameters<SeoModule['seo']>[1]) {
  const head = seoModule.seo('/marketing/about', options)
  const scripts = (head as { scripts?: JsonLdScript[] }).scripts
  expect(scripts).toHaveLength(1)
  const script = scripts?.[0]
  expect(script?.type).toBe('application/ld+json')
  const parsed = JSON.parse(script?.children ?? '{}') as {
    '@context': string
    '@graph': JsonLdNode[]
  }
  expect(parsed['@context']).toBe('https://schema.org')
  return parsed['@graph']
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('seo() 结构化数据', () => {
  it('不传 pageType 时不输出 scripts', async () => {
    const seoModule = await loadSeo()
    const head = seoModule.seo('/pricing', { title: '价格' })
    expect('scripts' in head).toBe(false)
  })

  it('pageType 生成 Organization + WebSite + 页面节点，且互相引用', async () => {
    const seoModule = await loadSeo()
    const graph = parseGraph(seoModule, {
      title: '关于我们',
      description: '团队与愿景',
      locale: 'zh',
      pageType: 'AboutPage',
    })

    expect(graph.map((node) => node['@type'])).toEqual(['Organization', 'WebSite', 'AboutPage'])

    const [organization, website, page] = graph
    const orgId = `${CUSTOM_BASE_URL}/#organization`
    const siteId = `${CUSTOM_BASE_URL}/#website`

    expect(organization?.['@id']).toBe(orgId)
    expect(organization?.url).toBe(CUSTOM_BASE_URL)

    // 站点节点归属组织，页面节点归属站点——断链会让三个节点退化成孤立数据。
    expect(website?.publisher).toEqual({ '@id': orgId })
    expect(page?.isPartOf).toEqual({ '@id': siteId })
    expect(page?.['@id']).toBe(`${CUSTOM_BASE_URL}/marketing/about#page`)
  })

  it('页面节点带上 title / description / inLanguage', async () => {
    const seoModule = await loadSeo()
    const page = parseGraph(seoModule, {
      title: '关于我们',
      description: '团队与愿景',
      locale: 'zh',
      pageType: 'AboutPage',
    }).at(-1)

    expect(page?.name).toBe('关于我们')
    expect(page?.description).toBe('团队与愿景')
    expect(page?.inLanguage).toBe('zh-CN')
    expect(page?.url).toBe(`${CUSTOM_BASE_URL}/marketing/about`)
  })

  it('省略 description 时不留下空字段', async () => {
    const seoModule = await loadSeo()
    const page = parseGraph(seoModule, { title: '关于我们', pageType: 'AboutPage' }).at(-1)
    expect('description' in (page ?? {})).toBe(false)
  })

  it('省略 locale 时不输出 inLanguage', async () => {
    const seoModule = await loadSeo()
    const page = parseGraph(seoModule, { title: '关于我们', pageType: 'AboutPage' }).at(-1)
    expect('inLanguage' in (page ?? {})).toBe(false)
  })

  it('description 里的 </script> 被转义，不会提前闭合脚本标签', async () => {
    const seoModule = await loadSeo()
    const head = seoModule.seo('/marketing/about', {
      title: '关于我们',
      description: '</script><script>alert(1)</script>',
      pageType: 'AboutPage',
    })
    const children = (head as { scripts?: JsonLdScript[] }).scripts?.[0]?.children ?? ''

    // 原始 `</script>` 一次都不能出现，否则浏览器会在此处结束脚本块。
    expect(children).not.toContain('</script>')
    expect(children).toContain('\\u003c/script')
    // 转义后仍是合法 JSON，且原文可从解析结果里还原。
    const parsed = JSON.parse(children) as { '@graph': JsonLdNode[] }
    expect(parsed['@graph'].at(-1)?.description).toBe('</script><script>alert(1)</script>')
  })
})
