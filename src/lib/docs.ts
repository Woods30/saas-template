/**
 * 文档（docs）路由的共享逻辑。
 *
 * 路由与链接统一使用**与语言无关**的 slug（见 `contentSlug()`），语言只由 cookie
 * 决定；否则 `index.zh` 这类带语言后缀的 slug 会让切换语言 404。
 */

import { allDocs } from 'content-collections'
import { contentSlug } from '@/lib/content-locale'
import { type Locale, readCookieValue } from '@/lib/locale'

/** 文档条目的最小投影，供侧边栏与页面渲染共用。 */
export interface DocEntry {
  slug: string
  title: string
  description: string
  content: string
  order: number
  /** 侧边栏分组名；空串表示不分组，直接列在侧边栏顶层。 */
  group: string
  /** 最近更新日期（`YYYY-MM-DD`）；空串表示未声明，页面不渲染该行。 */
  updated: string
}

/** 侧边栏的一个分组；`title` 为空串时渲染为不显示标题的顶层条目。 */
export interface DocGroup {
  title: string
  items: DocEntry[]
}

/** 文档首页（`index.md` / `index.zh.md`）的 slug；该文档渲染在 `/docs` 本身。 */
export const DOCS_INDEX_SLUG = 'index'

/** 把 Content Collections 文档投影成路由使用的 {@link DocEntry}。 */
function toEntry(doc: (typeof allDocs)[number]): DocEntry {
  return {
    slug: contentSlug(doc._meta.fileName),
    title: doc.title,
    description: doc.description,
    content: doc.content ?? '',
    order: doc.order,
    group: doc.group ?? '',
    updated: doc.updated ?? '',
  }
}

/** 返回指定语言的全部文档，按 `order` 升序。 */
export function docsForLocale(locale: Locale): DocEntry[] {
  return allDocs
    .filter((d) => d.locale === locale)
    .map(toEntry)
    .sort((a, b) => a.order - b.order)
}

/** 按与语言无关的 slug 查找文档；找不到返回 `undefined`。 */
export function findDocBySlug(slug: string, locale: Locale): DocEntry | undefined {
  return docsForLocale(locale).find((d) => d.slug === slug)
}

/**
 * 把已按 `order` 排好序的文档切成侧边栏分组。
 *
 * 组的先后由**组内最小的 `order`** 决定，无需额外的 `groupOrder` 字段。
 * 无 `group` 的文档归入匿名组，并始终排在最前。
 */
export function groupDocs(docs: DocEntry[]): DocGroup[] {
  const groups: DocGroup[] = []
  const indexByTitle = new Map<string, DocGroup>()

  for (const doc of docs) {
    let group = indexByTitle.get(doc.group)
    if (!group) {
      group = { title: doc.group, items: [] }
      indexByTitle.set(doc.group, group)
      groups.push(group)
    }
    group.items.push(doc)
  }

  for (const group of groups) {
    group.items.sort((a, b) => a.order - b.order)
  }

  return groups.sort((a, b) => {
    if (a.title === '') return -1
    if (b.title === '') return 1
    return minOrder(a) - minOrder(b)
  })
}

/** 组内最小的 `order`；空组回退到 `Infinity` 以稳定排序。 */
function minOrder(group: DocGroup): number {
  return group.items.reduce((min, doc) => Math.min(min, doc.order), Number.POSITIVE_INFINITY)
}

/**
 * 文档首页条目：优先取 slug 为 `index` 的文档，否则取排序后的第一篇，
 * 都没有时返回 `undefined`。
 */
export function docsLanding(locale: Locale): DocEntry | undefined {
  const docs = docsForLocale(locale)
  return docs.find((d) => d.slug === DOCS_INDEX_SLUG) ?? docs[0]
}

/** 右侧目录的一项。 */
export interface DocHeading {
  id: string
  text: string
  level: 2 | 3
}

/**
 * 把标题文本转成稳定的锚点 id。
 *
 * 右侧目录的 `href` 与 `Mdx` 渲染标题的 `id` 必须走同一函数，否则目录点了跳不过去。
 */
export function headingId(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * 从 markdown 正文里提取 h2 / h3 作为右侧目录。
 *
 * 跳过 h1（页面标题已由 frontmatter 渲染）与代码块、引用块内的 `#`，避免把示例
 * 代码里的注释当成标题。
 */
export function extractHeadings(markdown: string): DocHeading[] {
  const headings: DocHeading[] = []
  let inCode = false

  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    if (/^\s{0,3}>/.test(line)) continue

    const match = /^(#{2,3})\s+(.+)$/.exec(line)
    if (!match) continue
    const level = match[1]?.length === 3 ? 3 : 2
    const text = stripInlineMarkup((match[2] ?? '').trim())
    if (!text) continue
    headings.push({ id: headingId(text), text, level })
  }

  return headings
}

/** 去掉行内标记，得到纯文本（供目录显示与 id 计算共用）。 */
function stripInlineMarkup(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
}

/**
 * 解析文档侧边栏的收起偏好（来自 `DOCS_SIDEBAR` cookie）。
 *
 * 只有 `'1'` 视为收起，其余取值一律展开：cookie 可被用户手改，不信任其内容。
 */
export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === '1'
}

/** 侧边栏收起偏好的 cookie 名。 */
export const DOCS_SIDEBAR_COOKIE_NAME = 'DOCS_SIDEBAR'

/**
 * 服务端侧边栏偏好读取器，由 `src/server.ts` 在模块加载期注入（读 ALS）。
 * 与 `src/lib/theme.ts` 同一手法：本模块因此不依赖服务端运行时。
 */
let serverSidebarGetter: () => boolean = () => false

export function setServerSidebarGetter(getter: () => boolean): void {
  serverSidebarGetter = getter
}

/**
 * 读取当前会话的侧边栏收起偏好。
 *
 * 服务端走注入的 ALS 读取器，客户端读 cookie，两侧结果一致，首屏不会闪一下。
 */
export function getSidebarCollapsed(): boolean {
  if (typeof document === 'undefined') return serverSidebarGetter()
  return parseSidebarCollapsed(readCookieValue(document.cookie, DOCS_SIDEBAR_COOKIE_NAME))
}

/** 搜索结果里命中的一个正文小节。 */
export interface DocSearchSection {
  id: string
  text: string
  level: 2 | 3
  /** 命中处的上下文摘要；作为父级补全进树、自身未命中的小节为空串。 */
  snippet: string
}

/** 搜索结果的一项：文档本身，加上命中的小节路径。 */
export interface DocSearchResult {
  doc: DocEntry
  /** 命中的小节（含其父级），形成可展开的目录树；标题命中时为空数组。 */
  sections: DocSearchSection[]
  /** 用户输入的关键词（已去空白、保留大小写），供渲染层高亮。 */
  keyword: string
}

/** 正文里的一行是否是可搜索的正文（跳过代码块、表格分隔行与纯标题行）。 */
function isSearchableLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === '') return false
  if (trimmed.startsWith('```')) return false
  if (/^\|?[\s|:-]+\|?$/.test(trimmed)) return false
  return true
}

/** 从命中行截取一段摘要，长度受限以免撑破结果列表。 */
function toSnippet(line: string, keyword: string): string {
  const text = stripInlineMarkup(line.replace(/^[-*>|\s]+/, '').trim())
  const at = text.toLowerCase().indexOf(keyword)
  if (at <= 0) return text.slice(0, 80)
  const start = Math.max(0, at - 20)
  const body = text.slice(start, at + 60)
  return start > 0 ? `…${body}` : body
}

/**
 * 在文档的标题、描述与正文里检索关键词。
 *
 * 空查询返回空数组。命中标题 / 描述时整篇作为一项结果返回（`sections` 为空）；
 * 命中正文时返回该小节及其**各级父标题**，使结果能按 h2 → h3 渲染成目录树。
 */
export function searchDocs(docs: DocEntry[], query: string): DocSearchResult[] {
  const original = query.trim()
  const keyword = original.toLowerCase()
  if (keyword === '') return []

  const results: DocSearchResult[] = []

  for (const doc of docs) {
    const titleHit =
      doc.title.toLowerCase().includes(keyword) || doc.description.toLowerCase().includes(keyword)
    if (titleHit) {
      results.push({ doc, sections: [], keyword: original })
      continue
    }

    const sections: DocSearchSection[] = []
    const matched = new Set<DocSearchSection>()
    let inCode = false
    // 「下一步」小节由 `DocNextSteps` 渲染成卡片，没有对应锚点，整节跳过。
    let inNextSteps = false

    const ensureSection = (id: string, text: string, level: 2 | 3): DocSearchSection => {
      const existing = sections[sections.length - 1]
      if (existing && existing.id === id && existing.text === text) return existing
      const section: DocSearchSection = { id, text, level, snippet: '' }
      sections.push(section)
      return section
    }

    for (const line of doc.content.split('\n')) {
      if (line.trim().startsWith('```')) {
        inCode = !inCode
        continue
      }
      if (inCode) continue
      // 引用块是补充说明，不算正文命中点，避免「注意事项」把结果刷满。
      if (/^\s{0,3}>/.test(line)) continue

      const heading = /^(#{2,3})\s+(.+)$/.exec(line)
      if (heading) {
        if (/^##\s+/.test(line)) inNextSteps = NEXT_STEPS_HEADING.test(line.trim())
        if (inNextSteps) continue
        const text = stripInlineMarkup((heading[2] ?? '').trim())
        if (!text) continue
        const level = heading[1]?.length === 3 ? 3 : 2
        const section = ensureSection(headingId(text), text, level)
        if (section.text.toLowerCase().includes(keyword)) matched.add(section)
        continue
      }

      if (inNextSteps) continue
      if (!isSearchableLine(line)) continue
      const plain = stripInlineMarkup(line)
      if (!plain.toLowerCase().includes(keyword)) continue

      const target = sections[sections.length - 1]
      if (target) {
        if (target.snippet === '') target.snippet = toSnippet(line, keyword)
        matched.add(target)
      } else {
        const orphan: DocSearchSection = {
          id: '',
          text: '',
          level: 2,
          snippet: toSnippet(line, keyword),
        }
        sections.push(orphan)
        matched.add(orphan)
      }
    }

    const kept = pruneSections(sections, matched)
    if (kept.length > 0) {
      results.push({ doc, sections: kept, keyword: original })
    }
  }

  // 标题命中优先；其余保持文档原有顺序。
  return results.sort((a, b) => {
    const aTitle = a.sections.length === 0 ? 0 : 1
    const bTitle = b.sections.length === 0 ? 0 : 1
    return aTitle - bTitle
  })
}

/**
 * 剪掉结果树里与命中点无关的分支，只留下通往命中处的路径。
 *
 * 保留两类小节：自身命中的；以及**有命中子级**的 h2 父级（否则树断了层级）。
 */
function pruneSections(
  sections: DocSearchSection[],
  matched: Set<DocSearchSection>,
): DocSearchSection[] {
  const kept: DocSearchSection[] = []

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    if (!section) continue
    if (matched.has(section)) {
      kept.push(section)
      continue
    }
    if (section.level !== 2) continue

    for (let j = i + 1; j < sections.length; j++) {
      const child = sections[j]
      if (!child || child.level === 2) break
      if (matched.has(child)) {
        kept.push(section)
        break
      }
    }
  }

  return kept
}

/** 上一篇 / 下一篇的引用。 */
export interface DocNeighbor {
  slug: string
  title: string
}

/**
 * 取指定文档的前一篇与后一篇（按 `order` 排序，**跨分组连续**）。
 *
 * 用户顺着「下一篇」点下去应一路走完文档，不该在组边界停住。
 */
export function docNeighbors(
  docs: DocEntry[],
  slug: string,
): { prev: DocNeighbor | undefined; next: DocNeighbor | undefined } {
  const index = docs.findIndex((d) => d.slug === slug)
  if (index === -1) return { prev: undefined, next: undefined }

  const toNeighbor = (d: DocEntry | undefined): DocNeighbor | undefined =>
    d ? { slug: d.slug, title: d.title } : undefined

  return { prev: toNeighbor(docs[index - 1]), next: toNeighbor(docs[index + 1]) }
}

/** 英文月份名；不用 `Intl` 是为了在 Workers 运行时得到确定的输出，且不受时区影响。 */
const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** 各月的天数（非闰年）。 */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

/**
 * 把 `YYYY-MM-DD` 形式的日期格式化成当前语言的展示文案。
 *
 * **不**走 `new Date(iso)`：后者按 UTC 午夜解析，西半球时区会显示成前一天。
 * 非法输入返回空串。
 */
export function formatUpdatedDate(iso: string, locale: Locale): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return ''

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return ''

  const leap = month === 2 && year % 4 === 0 && year % 100 !== 0
  const limit = (DAYS_IN_MONTH[month - 1] ?? 0) + (leap ? 1 : 0)
  if (day < 1 || day > limit) return ''

  if (locale === 'zh') return `${year} 年 ${month} 月 ${day} 日`

  const monthName = MONTHS_EN[month - 1]
  return monthName === undefined ? '' : `${monthName} ${day}, ${year}`
}

/** 文档间相对链接的解析结果。 */
export interface DocLinkTarget {
  slug: string
  /** 链接里的锚点（不含 `#`）；未带锚点时为 `undefined`。 */
  hash?: string
}

/**
 * 把文档正文里的相对链接（`./configuration`、`../payment#stripe`）解析成
 * 站内文档路由所需的 slug 与锚点。
 *
 * 非相对链接返回 `undefined`——它们应按普通 `<a>` 渲染。
 */
export function docLinkTarget(href: string): DocLinkTarget | undefined {
  const value = href.trim()
  if (!value.startsWith('./') && !value.startsWith('../')) return undefined

  const withoutPrefix = value.replace(/^(?:\.\.?\/)+/, '')
  const hashAt = withoutPrefix.indexOf('#')
  const rawSlug = hashAt === -1 ? withoutPrefix : withoutPrefix.slice(0, hashAt)
  const hash = hashAt === -1 ? undefined : withoutPrefix.slice(hashAt + 1)

  const slug = rawSlug.replace(/\/+$/, '').replace(/\.md$/, '')
  if (slug === '' || slug === '.' || slug === '..') return undefined

  return hash === undefined || hash === '' ? { slug } : { slug, hash }
}

/** 「下一步」里的一个卡片条目。 */
export interface NextStep {
  title: string
  href: string
  /** 链接之后的说明文字（如 `——websiteConfig 全字段`）；没有时为空串。 */
  description: string
}

/** 「下一步」小节被切出后的结果：`body` 为剩余正文，`steps` 为卡片条目。 */
export interface SplitNextSteps {
  body: string
  steps: NextStep[]
}

/** 匹配 `## 下一步` / `## Next steps` 这类小节标题。 */
const NEXT_STEPS_HEADING = /^##\s+(下一步|Next steps)\s*$/i

/**
 * 把正文里的「下一步」小节从 markdown 中切出，并解析成卡片条目。
 *
 * 切出的部分会从正文移除，避免同一内容出现两次。
 */
export function splitNextSteps(markdown: string): SplitNextSteps {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => NEXT_STEPS_HEADING.test(line.trim()))
  if (start === -1) return { body: markdown, steps: [] }

  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i] ?? '')) {
      end = i
      break
    }
  }

  const section = lines.slice(start + 1, end)
  const steps: NextStep[] = []
  for (const line of section) {
    // 行首是链接即可，之后的说明文字可有可无。
    const match = /^\s{0,3}[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*(.*)$/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) {
      steps.push({
        title: match[1],
        href: match[2],
        description: (match[3] ?? '').replace(/^[\s—–-]+/, '').trim(),
      })
    }
  }

  const body = [...lines.slice(0, start), ...lines.slice(end)].join('\n').trimEnd()
  return { body, steps }
}
