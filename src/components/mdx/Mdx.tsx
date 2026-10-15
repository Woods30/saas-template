import { Fragment, useMemo } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Table as UITable,
} from '@/components/ui/table'
import { headingId } from '@/lib/docs'
import '@/styles/mdx.css'

/**
 * 最小 markdown 渲染：把 Content Collections 文档字符串转为 JSX.
 *
 * 支持：# / ## / ### 标题、代码块（```...```）、表格（`| a | b |` + 分隔行）、
 * 无序列表（`- `）、引用块（`> `）、段落，以及行内 `code` / **bold** / [链接](地址)。
 * 不支持：图片、有序列表、嵌套列表、HTML（v0.2 升级到 @mdx-js/rollup 后开启）。
 *
 * 表格与链接是配置类文档的刚需——没有它们，字段表会退化成一行竖线，
 * 交叉链接会原样显示 `[文字](地址)`。
 */
export function Mdx({ source }: { source: string }) {
  // 正文开头的 `# 标题` 与 frontmatter 的 `title` 重复（调用方都已用
  // frontmatter 标题渲染页面 `<h1>`），丢弃首个 h1 块避免页面出现两个标题。
  const blocks = useMemo(() => stripLeadingHeading(parseBlocks(source)), [source])
  return (
    <div className="mdx prose">
      {blocks.map((b, idx) => {
        const key = `block-${idx}`
        if (b.kind === 'h1') return <h1 key={key}>{b.text}</h1>
        // h2 / h3 带锚点 id，供右侧目录的 `#id` 链接跳转（id 由 headingId 统一生成）。
        if (b.kind === 'h2')
          return (
            <h2 key={key} id={headingId(b.text)}>
              {b.text}
            </h2>
          )
        if (b.kind === 'h3')
          return (
            <h3 key={key} id={headingId(b.text)}>
              {b.text}
            </h3>
          )
        if (b.kind === 'code')
          return (
            <pre key={key}>
              <code>{b.text}</code>
            </pre>
          )
        if (b.kind === 'table') return <Table key={key} table={b} />
        if (b.kind === 'quote')
          return isNoteQuote(b.text) ? (
            <Alert key={key} className="not-prose my-4">
              <AlertDescription>{renderInline(b.text)}</AlertDescription>
            </Alert>
          ) : (
            <blockquote key={key} className="mdx-quote">
              {renderInline(b.text)}
            </blockquote>
          )
        if (b.kind === 'list') {
          const ListTag = b.ordered ? 'ol' : 'ul'
          return (
            <ListTag key={key}>
              {b.items.map((item) => (
                // 列表项为纯文本，内容本身即可作为稳定 key。
                <li key={item}>{renderInline(item)}</li>
              ))}
            </ListTag>
          )
        }
        return <p key={key}>{renderInline(b.text)}</p>
      })}
    </div>
  )
}

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'code' | 'p'
  text: string
}

/** 表格：`header` 为表头单元格，`rows` 为数据行；分隔行已在解析阶段丢弃。 */
interface TableBlock {
  kind: 'table'
  header: string[]
  rows: string[][]
}

/** 列表：每项为一行原始 markdown 文本（行内语法在渲染时解析）。`ordered` 决定 ol / ul。 */
interface ListBlock {
  kind: 'list'
  ordered: boolean
  items: string[]
}

/** 引用块：`> ` 开头的连续行合并；用于单独列出注意事项。 */
interface QuoteBlock {
  kind: 'quote'
  text: string
}

type AnyBlock = Block | TableBlock | ListBlock | QuoteBlock

function Table({ table }: { table: TableBlock }) {
  return (
    // `not-prose`：表格样式由 ui/table 提供，不叠加 typography 的表格排版。
    <div className="not-prose mb-4">
      <UITable>
        <TableHeader>
          <TableRow>
            {table.header.map((cell, column) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 静态表格，位置即身份
              <TableHead key={`h-${column}`}>{renderInline(cell)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row, rowIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 同上，行序静态且不重排。
            <TableRow key={`r-${rowIndex}`}>
              {row.map((cell, column) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 同上，单元格位置静态且不重排。
                <TableCell key={`c-${rowIndex}-${column}`}>{renderInline(cell)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </UITable>
    </div>
  )
}

/** 引用块是否以 `**Note**` / `**注意事项**` / `**Notes**` 开头——是则升级为 Alert。 */
function isNoteQuote(text: string): boolean {
  return /^\s*\*\*(Note|Notes|注意事项)\*\*/.test(text)
}

/**
 * 丢弃正文开头的 `# 标题` 块（若存在）。所有调用方已用 frontmatter 的
 * `title` 渲染页面标题，正文里重复的 h1 会造成页面上出现两个 `<h1>`。
 */
function stripLeadingHeading(blocks: AnyBlock[]): AnyBlock[] {
  return blocks[0]?.kind === 'h1' ? blocks.slice(1) : blocks
}

/** 一行是否为表格行：以 `|` 开头且以 `|` 结尾。 */
function isTableRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.endsWith('|') && t.length > 1
}

/** 分隔行：单元格只由 `-`、`:`、空格组成，如 `|---|---|`。 */
function isTableDivider(line: string): boolean {
  return isTableRow(line) && splitTableRow(line).every((cell) => /^:?-+:?$/.test(cell.trim()))
}

/** 拆出表格单元格；去掉首尾空串（`|` 包裹产生）并 trim 每格。 */
function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

/** 无序列表项：`- ` 或 `* ` 开头（三个空格内的缩进也算同一层）。 */
function isListItem(line: string): boolean {
  return /^\s{0,3}[-*]\s+/.test(line)
}

/** 有序列表项：`1. ` / `2) ` 开头。 */
function isOrderedItem(line: string): boolean {
  return /^\s{0,3}\d+[.)]\s+/.test(line)
}

function parseBlocks(source: string): AnyBlock[] {
  const out: AnyBlock[] = []
  const lines = source.split('\n')
  let inCode = false
  let codeBuf: string[] = []
  let paraBuf: string[] = []

  function flushPara() {
    const text = paraBuf.join(' ').trim()
    if (text) out.push({ kind: 'p', text })
    paraBuf = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''

    if (line.startsWith('```')) {
      if (inCode) {
        out.push({ kind: 'code', text: codeBuf.join('\n') })
        codeBuf = []
        inCode = false
      } else {
        flushPara()
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }

    // 表格：连续 `|` 行；第二行为分隔行时第一行是表头，否则整体按数据行处理。
    if (isTableRow(line)) {
      flushPara()
      const raw: string[] = []
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        raw.push(lines[i] ?? '')
        i++
      }
      i--
      const body = raw.filter((row) => !isTableDivider(row))
      // 仅当第二行是分隔行（`|---|---|`）时，第一行才是表头；否则整块按数据行渲染。
      const hasHeader = raw.length > 1 && isTableDivider(raw[1] ?? '')
      const headerRow = hasHeader ? body[0] : undefined
      const rows = hasHeader ? body.slice(1) : body
      out.push({
        kind: 'table',
        header: headerRow ? splitTableRow(headerRow) : [],
        rows: rows.map(splitTableRow),
      })
      continue
    }

    // 引用块：连续的 `> ` 行合并，去掉前导 `>` 后按段落拼接。
    if (/^\s{0,3}>/.test(line)) {
      flushPara()
      const parts: string[] = []
      while (i < lines.length && /^\s{0,3}>/.test(lines[i] ?? '')) {
        parts.push((lines[i] ?? '').replace(/^\s{0,3}>\s?/, ''))
        i++
      }
      i--
      out.push({ kind: 'quote', text: parts.join(' ').trim() })
      continue
    }

    // 列表：连续的 `- ` / `* `（无序）或 `1. `（有序）行合并成一个列表。
    if (isListItem(line) || isOrderedItem(line)) {
      flushPara()
      const ordered = isOrderedItem(line)
      const matches = (candidate: string) =>
        ordered ? isOrderedItem(candidate) : isListItem(candidate)
      const items: string[] = []
      while (i < lines.length && matches(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s{0,3}(?:[-*]|\d+[.)])\s+/, ''))
        i++
      }
      i--
      out.push({ kind: 'list', ordered, items })
      continue
    }

    if (line.startsWith('### ')) {
      flushPara()
      out.push({ kind: 'h3', text: line.slice(4) })
    } else if (line.startsWith('## ')) {
      flushPara()
      out.push({ kind: 'h2', text: line.slice(3) })
    } else if (line.startsWith('# ')) {
      flushPara()
      out.push({ kind: 'h1', text: line.slice(2) })
    } else if (line.trim() === '') {
      flushPara()
    } else {
      paraBuf.push(line)
    }
  }
  flushPara()
  return out
}

/**
 * 把行内 markdown 转成 JSX 子元素。
 *
 * 按 `code` → `**bold**` → `[文字](地址)` 的顺序整体扫描，保持出现顺序。
 * 链接文字递归解析，因此 `[**重要**说明](./a)` 里的粗体仍然生效。
 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let match: RegExpExecArray | null = re.exec(text)
  while (match !== null) {
    if (match.index > last) {
      parts.push(escapeText(text.slice(last, match.index)))
    }
    if (match[1] !== undefined) {
      parts.push(<code key={match.index}>{match[1]}</code>)
    } else if (match[2] !== undefined) {
      parts.push(<strong key={match.index}>{match[2]}</strong>)
    } else if (match[3] !== undefined && match[4] !== undefined) {
      const href = safeHref(match[4])
      // scheme 不在白名单内时不生成 a 元素，只保留链接文字：React 不拦截
      // `javascript:` 地址（开发期仅改写并告警，生产期原样输出），必须在此丢弃。
      parts.push(
        href === undefined ? (
          <Fragment key={match.index}>{renderInline(match[3])}</Fragment>
        ) : (
          <a key={match.index} href={href} {...externalLinkAttrs(href)}>
            {renderInline(match[3])}
          </a>
        ),
      )
    }
    last = re.lastIndex
    match = re.exec(text)
  }

  if (last < text.length) {
    parts.push(escapeText(text.slice(last)))
  }

  return parts.length === 1 ? parts[0] : parts
}

/** 站外链接（绝对 URL 或协议相对）加 `rel` 保护；站内相对路径不加。 */
function externalLinkAttrs(href: string): { rel?: string } {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(href) ? { rel: 'noopener noreferrer' } : {}
}

/**
 * 校验链接地址的 scheme，只放行 `http` / `https` / `mailto` 与相对路径、锚点。
 *
 * 其余显式 scheme（`javascript:`、`data:`、`vbscript:` 等）一律返回 `undefined`，
 * 由调用方降级为纯文本。React 不会在生产期拦截 `javascript:` 地址，渲染器又是通用
 * 组件，因此不能依赖内容源的信任级别来兜底。
 */
function safeHref(href: string): string | undefined {
  const value = href.trim()
  if (/^(https?:|mailto:)/i.test(value)) return value
  // 出现 `scheme:` 形式的显式协议但不在白名单内 → 丢弃。
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return undefined
  // 相对路径（`./x`、`../x`、`/x`）与锚点（`#x`）保留。
  return value
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
