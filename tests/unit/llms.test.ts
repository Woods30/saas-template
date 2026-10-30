import { describe, expect, it } from 'vitest'
import { llmsConfig } from '@/config/llms'
import { type LlmsContentSource, renderLlmsFull, renderLlmsIndex } from '@/lib/llms'
import { toBlogEntries } from '@/lib/llms-source.server'

/**
 * llms.txt / llms-full.txt：给模型看的站点索引与全文包。
 *
 * 两者都不读 env、不发请求，语言由 URL 决定（英文一份、中文一份），
 * 所以这里直接注入 base URL 与内容源来断言输出。
 */

const BASE_URL = 'https://example.com'

const source: LlmsContentSource = {
  docs: [
    {
      path: '/docs/getting-started',
      locale: 'en',
      title: 'Getting Started',
      description: 'From clone to live',
      content: 'This page takes you from cloning the repo to a live site.',
      order: 1,
      group: 'start',
      updated: '2026-10-21',
    },
    {
      path: '/docs/getting-started',
      locale: 'zh',
      title: '快速开始',
      description: '从克隆到上线的一条线',
      content: '这页带你从克隆仓库走到线上可访问。',
      order: 1,
      group: 'start',
      updated: '2026-10-21',
    },
    {
      path: '/docs/database',
      locale: 'en',
      title: 'Database',
      description: 'Drizzle on D1',
      content: 'D1 is SQLite at the edge, accessed through Drizzle ORM.',
      order: 2,
      group: 'features',
      updated: '2026-10-18',
    },
  ],
  blogs: [
    {
      path: '/marketing/blog/hello-world',
      locale: 'en',
      title: 'Hello, World',
      description: 'Introducing the template',
      content: 'This is the first post of the blog.',
      order: 1,
      group: '',
      updated: '2026-10-12',
    },
  ],
  changelogs: [
    {
      path: '/marketing/changelog',
      locale: 'en',
      title: 'Initial release',
      description: 'Everything at once',
      content: 'The first release of the template.',
      order: 1,
      group: '',
      updated: '2026-10-12',
    },
  ],
  legals: [
    {
      path: '/marketing/legal/privacy',
      locale: 'en',
      title: 'Privacy Policy',
      description: '',
      content: 'We store only what we need to run the service.',
      order: 1,
      group: '',
      updated: '',
    },
  ],
}

function renderIndex(locale: 'en' | 'zh', priceCents = 9900): string {
  return renderLlmsIndex({
    config: llmsConfig,
    locale,
    baseUrl: BASE_URL,
    priceCents,
    siteName: 'Jerbix',
    source,
  })
}

describe('renderLlmsIndex', () => {
  it('以标题、定位句与技术栈开头', () => {
    const out = renderIndex('en')
    expect(out).toContain('# SaaS Template (Jerbix)')
    expect(out).toContain('> ')
    expect(out).toContain('TanStack Start')
    expect(out).toContain('Cloudflare Workers')
    expect(out).toContain('## Tech stack')
  })

  it('写明一次性买断价格与包含内容', () => {
    const out = renderIndex('en')
    expect(out).toContain('## Pricing')
    expect(out).toContain('$99')
    expect(out).toContain('lifetime support')
    expect(out).toContain('free updates')
  })

  it('价格取自传入金额，不写死在文案里', () => {
    expect(renderIndex('en', 14900)).toContain('$149')
    expect(renderIndex('en', 14900)).not.toContain('$99')
  })

  it('列出模板包含的模块', () => {
    const out = renderIndex('en')
    expect(out).toContain('## What you get')
    expect(out).toContain('Authentication')
    expect(out).toContain('Payments')
  })

  it('文档链接是带语言前缀的绝对 URL', () => {
    expect(renderIndex('en')).toContain(`${BASE_URL}/en/docs/getting-started`)
    expect(renderIndex('zh')).toContain(`${BASE_URL}/zh/docs/getting-started`)
  })

  it('中文版输出中文文案，且不混入英文版的定位句', () => {
    const zh = renderIndex('zh')
    expect(zh).toContain('一次性付费购买')
    expect(zh).not.toContain('one-time purchase')
  })

  it('英文版不含中文文案', () => {
    const en = renderIndex('en')
    expect(en).not.toContain('快速开始')
    expect(en).not.toContain('一次性付费购买')
  })

  it('两种语言各自只列自己语言的条目', () => {
    expect(renderIndex('en')).toContain('Getting Started')
    expect(renderIndex('en')).not.toContain('快速开始')
    expect(renderIndex('zh')).toContain('快速开始')
    expect(renderIndex('zh')).not.toContain('Getting Started')
  })

  it('包含快速开始的可复制命令', () => {
    expect(renderIndex('en')).toContain('pnpm install')
    expect(renderIndex('en')).toContain('pnpm run setup')
    expect(renderIndex('en')).toContain('pnpm deploy')
  })
})

describe('renderLlmsFull', () => {
  function renderFull(locale: 'en' | 'zh'): string {
    return renderLlmsFull({
      config: llmsConfig,
      locale,
      baseUrl: BASE_URL,
      priceCents: 9900,
      siteName: 'Jerbix',
      source,
    })
  }

  it('包含文档正文，让模型不必再抓页面', () => {
    const out = renderFull('en')
    expect(out).toContain('D1 is SQLite at the edge, accessed through Drizzle ORM.')
    expect(out).toContain('### Getting Started')
  })

  it('只收录指定语言的条目', () => {
    expect(renderFull('en')).not.toContain('这页带你从克隆仓库走到线上可访问。')
    expect(renderFull('zh')).toContain('这页带你从克隆仓库走到线上可访问。')
  })

  it('按 frontmatter 的 group 分节，组内按 order 升序', () => {
    const out = renderFull('en')
    expect(out.indexOf('## Start')).toBeGreaterThan(-1)
    expect(out.indexOf('## Feature Modules')).toBeGreaterThan(-1)
    expect(out.indexOf('### Getting Started')).toBeLessThan(out.indexOf('### Database'))
  })

  it('收录博客、更新日志与法务正文', () => {
    const out = renderFull('en')
    expect(out).toContain('## Blog')
    expect(out).toContain('This is the first post of the blog.')
    expect(out).toContain('## Changelog')
    expect(out).toContain('## Legal')
    expect(out).toContain('We store only what we need to run the service.')
  })

  it('把站点私有的模板占位符换成通用写法', () => {
    const doc = source.docs[0]
    if (!doc) throw new Error('fixture 缺少文档条目')
    // 占位符按 `{{类型_后缀}}` 拼出来：写字面量会被编辑器的密钥占位符机制改写。
    const emailPlaceholder = `{{${'EMAIL'}_${'abc123'}}}`
    const secretPlaceholder = `{{${'PASSWORD'}_${'def456'}}}`
    const source2: LlmsContentSource = {
      ...source,
      docs: [{ ...doc, content: `mail: ${emailPlaceholder}\nkey: ${secretPlaceholder}` }],
    }
    const out = renderLlmsFull({
      config: llmsConfig,
      locale: 'en',
      baseUrl: BASE_URL,
      priceCents: 9900,
      siteName: 'Jerbix',
      source: source2,
    })
    expect(out).not.toContain(emailPlaceholder)
    expect(out).not.toContain(secretPlaceholder)
    expect(out).toContain('your-support-email@example.com')
    expect(out).toContain('your-secret')
  })

  it('把正文标题下移一级，避免与文档层级打架', () => {
    const doc = source.docs[0]
    if (!doc) throw new Error('fixture 缺少文档条目')
    const source2: LlmsContentSource = {
      ...source,
      docs: [{ ...doc, content: '## Prerequisites\n\nNode.js 22 or 24.' }],
    }
    const out = renderLlmsFull({
      config: llmsConfig,
      locale: 'en',
      baseUrl: BASE_URL,
      priceCents: 9900,
      siteName: 'Jerbix',
      source: source2,
    })
    expect(out).toContain('### Prerequisites')
    expect(out).not.toMatch(/^## Prerequisites$/m)
  })
})

describe('llms 内容源', () => {
  it('未发布的博客不进内容源', () => {
    // 草稿在站内页面上不可见，进 llms 文件等于绕过发布流程把它公开出去。
    const entries = toBlogEntries([
      {
        locale: 'en',
        published: false,
        title: 'Draft',
        description: '',
        content: 'unreleased',
        date: '2026-10-20T00:00:00.000Z',
        _meta: { path: 'draft' },
      },
      {
        locale: 'en',
        published: true,
        title: 'Released',
        description: '',
        content: 'public',
        date: '2026-10-19T00:00:00.000Z',
        _meta: { path: 'released' },
      },
    ])
    expect(entries.map((entry) => entry.path)).toEqual(['/marketing/blog/released'])
    expect(entries.map((entry) => entry.content)).toEqual(['public'])
  })

  it('已发布博客按日期倒序', () => {
    const entries = toBlogEntries([
      {
        locale: 'en',
        published: true,
        title: 'Older',
        description: '',
        content: '',
        date: '2026-10-01T00:00:00.000Z',
        _meta: { path: 'older' },
      },
      {
        locale: 'en',
        published: true,
        title: 'Newer',
        description: '',
        content: '',
        date: '2026-10-20T00:00:00.000Z',
        _meta: { path: 'newer' },
      },
    ])
    expect(entries.map((entry) => entry.path)).toEqual([
      '/marketing/blog/newer',
      '/marketing/blog/older',
    ])
  })
})
