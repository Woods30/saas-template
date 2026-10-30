import type { LlmsConfig, LocalizedText } from '@/config/llms'
import type { Locale } from '@/config/locale'
import { formatUsdAmount } from '@/payment/price-catalog'

/**
 * `llms.txt` / `llms-full.txt` 的渲染。
 *
 * 纯函数：不读 env、不发请求、不碰 `content-collections`。语言由 URL 决定
 * （英文 `/llms.txt`、中文 `/llms.zh.txt`），所以 locale 是显式入参而非隐式读取。
 */

/** 一条内容（文档 / 博客 / 更新日志 / 法务）的最小投影。 */
export interface LlmsEntry {
  /** 站点内路径（不含语言前缀），如 `/docs/getting-started`。 */
  path: string
  locale: string
  title: string
  description: string
  content: string
  /** 同组内升序。 */
  order: number
  /** 分组 key；空串表示不分组。 */
  group: string
  /** 最近更新日期（`YYYY-MM-DD`）；空串表示未知。 */
  updated: string
}

/** 内容来源；缺省来源由 `llms-source.server.ts` 提供。 */
export interface LlmsContentSource {
  docs: readonly LlmsEntry[]
  blogs: readonly LlmsEntry[]
  changelogs: readonly LlmsEntry[]
  legals: readonly LlmsEntry[]
}

export interface LlmsRenderOptions {
  config: LlmsConfig
  locale: Locale
  /** 站点根地址，不带尾斜杠。 */
  baseUrl: string
  /** 模板买断价（分）；`null` 表示价格目录取不到。 */
  priceCents: number | null
  siteName: string
  source: LlmsContentSource
}

/** 取指定语言；缺失时回退英文，保证输出不为空。 */
function pick(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.en
}

/** 替换文案里的 `{name}` / `{price}` / `{url}` 占位符。 */
function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}

/** 拼带语言前缀的绝对 URL。 */
function absoluteUrl(baseUrl: string, locale: Locale, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${locale}${path}`
}

/** 筛出指定语言的条目。 */
function ofLocale(entries: readonly LlmsEntry[], locale: Locale): LlmsEntry[] {
  return entries.filter((entry) => entry.locale === locale)
}

/**
 * 按 `group` 聚合。
 *
 * 组的先后由**组内最小的 `order`** 决定，与文档站侧边栏一致；
 * 没有 `group` 的条目归入匿名组并始终排在最前。
 */
function groupEntries(entries: readonly LlmsEntry[]): Array<{
  group: string
  items: LlmsEntry[]
}> {
  const groups: Array<{ group: string; items: LlmsEntry[] }> = []
  const index = new Map<string, { group: string; items: LlmsEntry[] }>()

  for (const entry of entries) {
    let group = index.get(entry.group)
    if (!group) {
      group = { group: entry.group, items: [] }
      index.set(entry.group, group)
      groups.push(group)
    }
    group.items.push(entry)
  }

  for (const group of groups) {
    group.items.sort((a, b) => a.order - b.order)
  }

  const minOrder = (group: { items: LlmsEntry[] }) =>
    group.items.reduce((min, item) => Math.min(min, item.order), Number.POSITIVE_INFINITY)

  return groups.sort((a, b) => {
    if (a.group === '') return -1
    if (b.group === '') return 1
    return minOrder(a) - minOrder(b)
  })
}

/**
 * 把正文标题整体下移一级。
 *
 * 文档正文自带 `##`，而 llms-full.txt 里每篇文档挂在 `###` 之下；
 * 不下移会出现标题层级倒挂。
 */
function shiftHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,5})(?=\s)/gm, (_match, hashes: string) => `${hashes}#`)
}

/**
 * 把站点私有的模板占位符换成通用写法。
 *
 * 文档里写的是 `{{EMAIL_xxx}}` 这类占位符——给克隆者填自己的支持邮箱与密钥用的。
 * 它对模型没有信息量，还会让模型以为站点没配置完，故按类型换成通用占位。
 */
function sanitizePlaceholders(markdown: string): string {
  return markdown.replace(/\{\{([A-Z]+)_[A-Za-z0-9]+\}\}/g, (_match, kind: string) => {
    if (kind === 'EMAIL') return 'your-support-email@example.com'
    if (kind === 'PASSWORD') return 'your-secret'
    return 'your-value'
  })
}

/** 渲染 llms.txt：站点索引 + 事实要点 + 文档链接清单。 */
export function renderLlmsIndex(options: LlmsRenderOptions): string {
  const { config, locale, baseUrl, priceCents, siteName, source } = options
  const t = (text: LocalizedText) => pick(text, locale)
  const lines: string[] = []

  lines.push(`# SaaS Template (${siteName})`)
  lines.push('')
  lines.push(`> ${t(config.tagline)}`)
  lines.push('')
  lines.push(`## ${t(config.sections.about)}`)
  lines.push('')
  lines.push(t(config.summary))
  lines.push('')
  lines.push(`## ${t(config.sections.stack)}`)
  lines.push('')
  for (const item of config.stack) {
    lines.push(`- ${item}`)
  }
  lines.push('')
  lines.push(`## ${t(config.sections.modules)}`)
  lines.push('')
  for (const module of config.modules) {
    lines.push(`- **${t(module.name)}** — ${t(module.detail)}`)
  }
  lines.push('')
  lines.push(`## ${t(config.sections.pricing)}`)
  lines.push('')
  const values = {
    name: siteName,
    price: formatUsdAmount(priceCents),
    url: absoluteUrl(baseUrl, locale, '/pricing'),
  }
  // 价格取不到时只写套餐与定价页链接，不编造金额。
  if (priceCents !== null) lines.push(`- ${fill(t(config.pricing.template), values)}`)
  lines.push(`- ${fill(t(config.pricing.plans), values)}`)
  lines.push('')
  lines.push(`## ${t(config.sections.quickStart)}`)
  lines.push('')
  config.quickStart.forEach((step, index) => {
    lines.push(`${index + 1}. ${t(step)}`)
  })
  lines.push('')

  const sections: Array<[LocalizedText, readonly LlmsEntry[]]> = [
    [config.sections.documentation, ofLocale(source.docs, locale)],
    [config.sections.blog, ofLocale(source.blogs, locale)],
    [config.sections.changelog, ofLocale(source.changelogs, locale)],
    [config.sections.legal, ofLocale(source.legals, locale)],
  ]

  for (const [title, entries] of sections) {
    if (entries.length === 0) continue
    lines.push(`## ${t(title)}`)
    lines.push('')
    // 更新日志这类集合没有单篇页面，多篇共用同一个 URL——只链一次。
    const seen = new Set<string>()
    for (const entry of entries) {
      const url = absoluteUrl(baseUrl, locale, entry.path)
      if (seen.has(url)) continue
      seen.add(url)
      const detail = entry.description === '' ? '' : `: ${entry.description}`
      lines.push(`- [${entry.title}](${url})${detail}`)
    }
    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

/** 渲染 llms-full.txt：全部正文，模型不必再抓页面。 */
export function renderLlmsFull(options: LlmsRenderOptions): string {
  const { config, locale, siteName, source } = options
  const t = (text: LocalizedText) => pick(text, locale)
  const lines: string[] = []

  lines.push(`# SaaS Template (${siteName}) — Full Documentation`)
  lines.push('')
  lines.push(`> ${t(config.tagline)}`)
  lines.push('')
  lines.push(fill(t(config.fullIntro), { name: siteName }))
  lines.push('')

  /** 输出一组条目：每篇一个 `###` 小节。 */
  const renderItems = (items: readonly LlmsEntry[]) => {
    for (const item of items) {
      lines.push(`### ${item.title}`)
      lines.push('')
      if (item.description !== '') {
        lines.push(item.description)
        lines.push('')
      }
      if (item.updated !== '') {
        lines.push(`${t(config.labels.updated)}: ${item.updated}`)
        lines.push('')
      }
      lines.push(sanitizePlaceholders(shiftHeadings(item.content)).trim())
      lines.push('')
    }
  }

  for (const group of groupEntries(ofLocale(source.docs, locale))) {
    lines.push(
      `## ${group.group === '' ? t(config.sections.documentation) : t(config.docGroupTitles[group.group] ?? { en: group.group, zh: group.group })}`,
    )
    lines.push('')
    renderItems(group.items)
  }

  const tail: Array<[LocalizedText, readonly LlmsEntry[]]> = [
    [config.sections.blog, ofLocale(source.blogs, locale)],
    [config.sections.changelog, ofLocale(source.changelogs, locale)],
    [config.sections.legal, ofLocale(source.legals, locale)],
  ]

  for (const [title, entries] of tail) {
    if (entries.length === 0) continue
    lines.push(`## ${t(title)}`)
    lines.push('')
    renderItems(entries)
  }

  return `${lines.join('\n').trimEnd()}\n`
}
