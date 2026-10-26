import { describe, expect, it } from 'vitest'
import {
  type DocEntry,
  docLinkTarget,
  docNeighbors,
  extractHeadings,
  formatUpdatedDate,
  getSidebarCollapsed,
  groupDocs,
  headingId,
  parseSidebarCollapsed,
  searchDocs,
  setServerSidebarGetter,
  splitNextSteps,
} from '@/lib/docs'

/**
 * 文档侧边栏分组与右侧 TOC 提取。分组由 frontmatter 的 `group` 声明，
 * 组的先后由组内最小 `order` 决定。
 */

function entry(slug: string, title: string, order: number, group?: string): DocEntry {
  return { slug, title, description: '', content: '', order, group: group ?? '', updated: '' }
}

describe('groupDocs', () => {
  it('按 group 聚合，组内按 order 升序', () => {
    const groups = groupDocs([
      entry('b', 'B', 3, '配置'),
      entry('a', 'A', 2, '配置'),
      entry('c', 'C', 1, '开始'),
    ])
    expect(groups.map((g) => g.title)).toEqual(['开始', '配置'])
    expect(groups[1]?.items.map((d) => d.slug)).toEqual(['a', 'b'])
  })

  it('组的顺序由组内最小 order 决定', () => {
    const groups = groupDocs([
      entry('late', 'Late', 30, '后'),
      entry('early', 'Early', 10, '前'),
      entry('mid', 'Mid', 20, '中'),
    ])
    expect(groups.map((g) => g.title)).toEqual(['前', '中', '后'])
  })

  it('无 group 的文档归入匿名组，且排在有分组的文档之前', () => {
    const groups = groupDocs([entry('a', 'A', 5, '配置'), entry('i', '索引', 1)])
    expect(groups[0]?.title).toBe('')
    expect(groups[0]?.items.map((d) => d.slug)).toEqual(['i'])
  })

  it('同一 group 名称在结果中只出现一次', () => {
    const groups = groupDocs([
      entry('a', 'A', 1, '配置'),
      entry('b', 'B', 2, '配置'),
      entry('c', 'C', 3, '配置'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.items).toHaveLength(3)
  })

  it('空输入返回空数组', () => {
    expect(groupDocs([])).toEqual([])
  })
})

describe('headingId', () => {
  it('中文标题保留原字符，空格转连字符', () => {
    expect(headingId('准备开发环境')).toBe('准备开发环境')
  })

  it('去掉行内标记，只保留文字', () => {
    expect(headingId('`VITE_` 规则')).toBe('vite_-规则')
  })

  it('转小写并压缩连续分隔符', () => {
    expect(headingId('Site base URL')).toBe('site-base-url')
  })

  it('去除首尾连字符', () => {
    expect(headingId('  Hello  ')).toBe('hello')
  })
})

describe('extractHeadings', () => {
  it('提取 h2 / h3，跳过 h1 与代码块内的 #', () => {
    const md = ['# 标题', '## 小节一', '```', '## 代码里的井号', '```', '### 子节'].join('\n')
    expect(extractHeadings(md)).toEqual([
      { id: '小节一', text: '小节一', level: 2 },
      { id: '子节', text: '子节', level: 3 },
    ])
  })

  it('忽略引用块里的 `#`（以 `>` 开头）', () => {
    expect(extractHeadings('> ## 不是标题\n\n## 真标题')).toEqual([
      { id: '真标题', text: '真标题', level: 2 },
    ])
  })

  it('标题文本去掉行内标记，id 与之一致', () => {
    const [h] = extractHeadings('## 使用 `pnpm check`')
    expect(h?.text).toBe('使用 pnpm check')
    expect(h?.id).toBe('使用-pnpm-check')
  })

  it('无标题时返回空数组', () => {
    expect(extractHeadings('只有正文。')).toEqual([])
  })
})

describe('searchDocs', () => {
  function doc(slug: string, title: string, description: string, content: string): DocEntry {
    return { slug, title, description, content, order: 1, group: '', updated: '' }
  }

  const DOCS = [
    doc(
      'payment',
      '支付',
      'Stripe 结账、Price 白名单与 Webhook',
      '## 启用支付\n\nStripe 只支持一种 provider。\n\n### Webhook\n\n签名校验失败返回 400。',
    ),
    doc('email', '邮件', 'Resend 与联系表单', '## 配置\n\n需要 RESEND_API_KEY。'),
  ]

  it('空查询返回空结果（默认不展示全部）', () => {
    expect(searchDocs(DOCS, '')).toEqual([])
    expect(searchDocs(DOCS, '   ')).toEqual([])
  })

  it('记录原始关键词，供渲染层做高亮', () => {
    // 摘要里的大小写可能与输入不同，高亮须大小写不敏感。
    const results = searchDocs(DOCS, '  RESEND  ')
    expect(results[0]?.keyword).toBe('RESEND')
  })

  it('命中标题时返回该文档，且不需要正文命中', () => {
    const results = searchDocs(DOCS, '支付')
    expect(results).toHaveLength(1)
    expect(results[0]?.doc.slug).toBe('payment')
    expect(results[0]?.sections).toEqual([])
  })

  it('命中正文时返回该文档，并列出命中的小节路径', () => {
    const results = searchDocs(DOCS, 'RESEND_API_KEY')
    expect(results).toHaveLength(1)
    expect(results[0]?.doc.slug).toBe('email')
    expect(results[0]?.sections).toEqual([
      { id: '配置', text: '配置', level: 2, snippet: '需要 RESEND_API_KEY。' },
    ])
  })

  it('小节带层级：h3 命中时 h2 作为父级一并出现，形成目录树', () => {
    const results = searchDocs(DOCS, '签名校验')
    expect(results[0]?.sections.map((s) => [s.level, s.text])).toEqual([
      [2, '启用支付'],
      [3, 'Webhook'],
    ])
    expect(results[0]?.sections[0]?.snippet).toBe('')
    expect(results[0]?.sections[1]?.snippet).toBe('签名校验失败返回 400。')
  })

  it('同一小节里多处命中只产生一条结果', () => {
    const dup = [doc('x', 'X', '', '## A\n\n关键词 关键词 关键词。')]
    expect(searchDocs(dup, '关键词')).toHaveLength(1)
    expect(searchDocs(dup, '关键词')[0]?.sections).toHaveLength(1)
  })

  it('不检索「下一步」小节：该标题在正文里被渲染成卡片，锚点不存在', () => {
    const withNextSteps = [
      doc(
        'x',
        'X',
        '',
        [
          '## 正文',
          '',
          '这里提到 env。',
          '',
          '## 下一步',
          '',
          '- [环境变量](./environment)——两层 env 校验',
        ].join('\n'),
      ),
    ]
    const sections = searchDocs(withNextSteps, 'env')[0]?.sections ?? []
    expect(sections.map((s) => s.text)).toEqual(['正文'])
  })

  it('大小写不敏感', () => {
    expect(searchDocs(DOCS, 'resend')).toHaveLength(1)
    expect(searchDocs(DOCS, 'RESEND')).toHaveLength(1)
  })

  it('无命中时返回空数组', () => {
    expect(searchDocs(DOCS, 'zzzz')).toEqual([])
  })

  it('结果按文档顺序返回，不因命中位置改变排序', () => {
    expect(searchDocs(DOCS, 'provider').map((r) => r.doc.slug)).toEqual(['payment'])
  })

  it('标题命中优先于正文命中', () => {
    const docs = [
      doc('a', 'A', '', '## 小节\n\n邮件相关内容。'),
      doc('b', '邮件', '', '## 小节\n\n无关内容。'),
    ]
    expect(searchDocs(docs, '邮件').map((r) => r.doc.slug)).toEqual(['b', 'a'])
  })
})

describe('parseSidebarCollapsed', () => {
  it('只认 `1` 为收起，其余（含缺失）一律展开', () => {
    // 默认必须展开，首次访问的人要直接看到导航。
    expect(parseSidebarCollapsed('1')).toBe(true)
    expect(parseSidebarCollapsed('0')).toBe(false)
    expect(parseSidebarCollapsed('')).toBe(false)
    expect(parseSidebarCollapsed(undefined)).toBe(false)
    expect(parseSidebarCollapsed('true')).toBe(false)
  })
})

describe('getSidebarCollapsed / setServerSidebarGetter', () => {
  it('服务端路径返回注入的 getter 值', () => {
    // node 环境无 `document`，走注入的读取器；SSR 入口用同一手法注入 ALS。
    setServerSidebarGetter(() => true)
    expect(getSidebarCollapsed()).toBe(true)
    setServerSidebarGetter(() => false) // 复位，避免影响其他用例
  })

  it('默认 getter 为展开，未注入时不抛错', () => {
    expect(getSidebarCollapsed()).toBe(false)
  })
})

describe('docNeighbors', () => {
  const docs = [
    entry('a', 'A', 1, 'start'),
    entry('b', 'B', 2, 'config'),
    entry('c', 'C', 3, 'config'),
  ]

  it('返回前一篇与后一篇（跨分组连续）', () => {
    expect(docNeighbors(docs, 'b')).toEqual({
      prev: { slug: 'a', title: 'A' },
      next: { slug: 'c', title: 'C' },
    })
  })

  it('第一篇没有 prev，最后一篇没有 next', () => {
    expect(docNeighbors(docs, 'a').prev).toBeUndefined()
    expect(docNeighbors(docs, 'a').next?.slug).toBe('b')
    expect(docNeighbors(docs, 'c').next).toBeUndefined()
    expect(docNeighbors(docs, 'c').prev?.slug).toBe('b')
  })

  it('slug 不存在时两侧都为空', () => {
    expect(docNeighbors(docs, 'nope')).toEqual({ prev: undefined, next: undefined })
  })

  it('单篇文档时两侧都为空', () => {
    expect(docNeighbors([entry('only', 'Only', 1)], 'only')).toEqual({
      prev: undefined,
      next: undefined,
    })
  })
})

describe('formatUpdatedDate', () => {
  it('中文按「年月日」输出，数字与汉字之间留半角空格', () => {
    expect(formatUpdatedDate('2026-10-14', 'zh')).toBe('2026 年 10 月 14 日')
  })

  it('英文按「月 日, 年」输出', () => {
    expect(formatUpdatedDate('2026-10-14', 'en')).toBe('October 14, 2026')
  })

  it('去掉日期里的前导零', () => {
    expect(formatUpdatedDate('2026-01-05', 'en')).toBe('January 5, 2026')
  })

  it('空值或非法日期返回空串，交由调用方决定是否渲染', () => {
    expect(formatUpdatedDate('', 'zh')).toBe('')
    expect(formatUpdatedDate('not-a-date', 'zh')).toBe('')
    expect(formatUpdatedDate('2026-13-01', 'zh')).toBe('')
  })

  it('不受本地时区影响（同一日期在任何时区都输出同一天）', () => {
    // 用 `new Date(iso)` 时 UTC 午夜在西半球会退到前一天。
    expect(formatUpdatedDate('2026-10-01', 'en')).toBe('October 1, 2026')
  })
})

describe('docLinkTarget', () => {
  it('把相对文档链接解析成 slug', () => {
    expect(docLinkTarget('./configuration')).toEqual({ slug: 'configuration' })
  })

  it('保留锚点', () => {
    expect(docLinkTarget('./integrations#email')).toEqual({
      slug: 'integrations',
      hash: 'email',
    })
  })

  it('去掉 `../` 前缀（同目录引用）', () => {
    expect(docLinkTarget('../payment')).toEqual({ slug: 'payment' })
  })

  it('外部链接与空锚点返回 undefined，交由调用方按普通链接处理', () => {
    expect(docLinkTarget('https://example.com')).toBeUndefined()
    expect(docLinkTarget('mailto:hi@example.com')).toBeUndefined()
    expect(docLinkTarget('./')).toBeUndefined()
    expect(docLinkTarget('./#')).toBeUndefined()
  })
})

describe('splitNextSteps', () => {
  it('把末尾的「下一步」小节从正文中切出，并解析出条目', () => {
    const md = [
      '正文段落。',
      '',
      '## 下一步',
      '',
      '- [网站配置](./configuration)',
      '- [环境变量](./environment)',
    ].join('\n')
    const { body, steps } = splitNextSteps(md)
    expect(body).toBe('正文段落。')
    expect(steps).toEqual([
      { title: '网站配置', href: './configuration', description: '' },
      { title: '环境变量', href: './environment', description: '' },
    ])
  })

  it('链接后带说明文字时仍能解析，说明文字作为描述保留', () => {
    // 真实内容行尾不是 `)`，早期整行匹配链接的实现会把整节丢弃。
    const md = [
      '正文。',
      '',
      '## 下一步',
      '',
      '- [网站配置](./configuration)——`websiteConfig` 全字段与开关语义',
      '- [导航与菜单](./navigation)——Navbar、页脚、文档侧边栏',
    ].join('\n')
    expect(splitNextSteps(md).steps).toEqual([
      {
        title: '网站配置',
        href: './configuration',
        description: '`websiteConfig` 全字段与开关语义',
      },
      { title: '导航与菜单', href: './navigation', description: 'Navbar、页脚、文档侧边栏' },
    ])
  })

  it('链接后无说明文字时 description 为空串', () => {
    const md = ['## 下一步', '', '- [A](./a)'].join('\n')
    expect(splitNextSteps(md).steps).toEqual([{ title: 'A', href: './a', description: '' }])
  })

  it('英文 `## Next steps` 同样识别', () => {
    const md = ['Body.', '', '## Next steps', '', '- [Website Config](./configuration)'].join('\n')
    expect(splitNextSteps(md).steps).toEqual([
      { title: 'Website Config', href: './configuration', description: '' },
    ])
  })

  it('没有「下一步」小节时原样返回，条目为空', () => {
    const md = '只有正文，没有下一步。'
    expect(splitNextSteps(md)).toEqual({ body: md, steps: [] })
  })

  it('「下一步」不在末尾时也整体切出（保留其后的正文）', () => {
    const md = [
      '正文。',
      '',
      '## 下一步',
      '',
      '- [A](./a)',
      '',
      '## 后续章节',
      '',
      '更多内容。',
    ].join('\n')
    const { body, steps } = splitNextSteps(md)
    expect(steps).toEqual([{ title: 'A', href: './a', description: '' }])
    expect(body).toContain('正文。')
    expect(body).toContain('## 后续章节')
    expect(body).toContain('更多内容。')
    expect(body).not.toContain('## 下一步')
  })
})
