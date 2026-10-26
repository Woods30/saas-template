import { IconFile, IconTerminal2 } from '@tabler/icons-react'
import { Fragment, useMemo } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ui/code-block'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Table as UITable,
} from '@/components/ui/table'
import { headingId } from '@/lib/docs'
import { m } from '@/locale/paraglide/messages.js'
import '@/styles/mdx.css'

/**
 * 最小 markdown 渲染：标题、代码块、表格、无序列表、引用块、段落、
 * 独占一行的图片，以及行内 code / bold / 链接。不支持有序列表、嵌套列表与 HTML。
 */
export function Mdx({ source }: { source: string }) {
  // 丢弃正文首个 h1：调用方已用 frontmatter 的 `title` 渲染页面标题。
  const blocks = useMemo(() => stripLeadingHeading(parseBlocks(source)), [source])
  const sections = useMemo(() => groupSteps(blocks), [blocks])

  return (
    <div className="mdx prose">
      {sections.map((section) =>
        section.kind === 'steps' ? (
          <Steps key={section.key} steps={section.steps} />
        ) : (
          <BlockView key={section.key} block={section.block} />
        ),
      )}
    </div>
  )
}

/** 单个块级元素的渲染；时间线内部复用同一套渲染。 */
function BlockView({ block: b }: { block: AnyBlock }) {
  if (b.kind === 'h1') return <h1>{b.text}</h1>
  // h2 / h3 的锚点 id 供右侧目录跳转，必须与 headingId 保持同一算法。
  if (b.kind === 'h2') return <h2 id={headingId(b.text)}>{b.text}</h2>
  if (b.kind === 'h3') return <h3 id={headingId(b.text)}>{b.text}</h3>
  if (b.kind === 'code') return <Code block={b} />
  if (b.kind === 'image') return <Figure image={b} />
  if (b.kind === 'table') return <Table table={b} />
  if (b.kind === 'quote')
    return isNoteQuote(b.text) ? (
      <Alert className="not-prose my-4">
        <AlertDescription>{renderInline(b.text)}</AlertDescription>
      </Alert>
    ) : (
      <blockquote className="mdx-quote">{renderInline(b.text)}</blockquote>
    )
  if (b.kind === 'list') {
    const ListTag = b.ordered ? 'ol' : 'ul'
    return (
      <ListTag>
        {b.items.map((item) => (
          <li key={item}>{renderInline(item)}</li>
        ))}
      </ListTag>
    )
  }
  return <p>{renderInline(b.text)}</p>
}

/** 渲染单元：一个普通块，或一组连续的步骤小节。 */
type RenderSection =
  | { kind: 'block'; key: string; block: AnyBlock }
  | { kind: 'steps'; key: string; steps: Array<{ block: AnyBlock; body: AnyBlock[] }> }

/**
 * 连续至少两个 `###` 小节收拢为步骤时间线；孤立 `###` 仍按普通标题渲染，
 * 因为 `###` 也用于并列小节（如「验证链接 / 重置链接」），不能一律当步骤。
 */
function groupSteps(blocks: AnyBlock[]): RenderSection[] {
  const sections: RenderSection[] = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]
    if (!block) break

    if (block.kind !== 'h3') {
      sections.push({ kind: 'block', key: `block-${i}`, block })
      i++
      continue
    }

    const steps: Array<{ block: AnyBlock; body: AnyBlock[] }> = []
    while (i < blocks.length && blocks[i]?.kind === 'h3') {
      const heading = blocks[i] as Block
      const body: AnyBlock[] = []
      i++
      while (i < blocks.length) {
        const next = blocks[i]
        if (!next || next.kind === 'h3' || next.kind === 'h2' || next.kind === 'h1') break
        body.push(next)
        i++
      }
      steps.push({ block: heading, body })
    }

    // 单个小节不构成序列，退回普通标题渲染。
    if (steps.length < 2) {
      const [only] = steps
      if (only) {
        sections.push({ kind: 'block', key: `block-${i}-h3`, block: only.block })
        for (const [offset, item] of only.body.entries()) {
          sections.push({ kind: 'block', key: `block-${i}-${offset}`, block: item })
        }
      }
      continue
    }

    sections.push({ kind: 'steps', key: `steps-${i}`, steps })
  }

  return sections
}

/**
 * 步骤时间线：编号圆点 + 竖线。配置类文档的 `###` 常有先后顺序，平铺小标题
 * 容易被当成并列选项而跳步。标题仍保留 `h3` 与锚点 id，目录与深链依赖它们。
 */
function Steps({ steps }: { steps: Array<{ block: AnyBlock; body: AnyBlock[] }> }) {
  return (
    <div className="mdx-steps">
      {steps.map((step, index) => {
        const heading = step.block as Block
        return (
          <section key={headingId(heading.text)} className="mdx-step">
            <div className="mdx-step-marker" aria-hidden>
              <span className="mdx-step-number">{index + 1}</span>
            </div>
            <div className="mdx-step-body">
              <h3 id={headingId(heading.text)}>{heading.text}</h3>
              {step.body.map((item, offset) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 静态正文，位置即身份且从不重排。
                <BlockView key={`${headingId(heading.text)}-${offset}`} block={item} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'code' | 'p'
  text: string
  /** 代码块的围栏语言（```` ```ts ```` 里的 `ts`）；无语言时为空串。 */
  lang?: string
  /** 围栏语言之后的其余标记（如 `title="wrangler.jsonc"`）；无则为空串。 */
  meta?: string
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

/**
 * 图片块：独占一行的 `![alt](/path.png)`，可选 `![alt](/path.png "标题")`。
 * 只识别独占一行写法；`alt` 在没有 `"标题"` 时充当图注。
 */
interface ImageBlock {
  kind: 'image'
  src: string
  alt: string
  /** `![alt](src "标题")` 里的标题；为空时不渲染 caption。 */
  caption: string
}

type AnyBlock = Block | TableBlock | ListBlock | QuoteBlock | ImageBlock

/** 代码块标题栏文案：文件名 > 语言名 > 「代码」。 */
function codeTitle(lang: string, meta: string): string {
  const file = /title="([^"]+)"/.exec(meta)?.[1]
  if (file) return file
  if (lang !== '') return lang
  return m.docs_code_block()
}

/** 终端类语言用终端图标，其余用文件图标。 */
const TERMINAL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'powershell', 'cmd'])

/**
 * 代码块：文件图标 + 标题栏 + 复制按钮。用 shadcn 的 `CodeBlock` 系列而非裸
 * `<pre>`，复制反馈与 `aria-live` 播报由原件提供。标题栏始终渲染，兼作与正文的分隔。
 */
function Code({ block }: { block: Block }) {
  const lang = block.lang ?? ''
  const meta = block.meta ?? ''
  const FileIcon = TERMINAL_LANGS.has(lang) ? IconTerminal2 : IconFile

  return (
    <CodeBlock className="not-prose my-4">
      {/* 原件只有 `pt-3` 没有 `pb`，补成对称内边距；标题压到 `muted-foreground`，
          避免与正文代码同色而抢注意力。 */}
      <CodeBlockHeader className="h-9.5 items-center border-b border-border bg-muted/60 px-4 pt-0">
        <FileIcon className="size-3.5 shrink-0" aria-hidden />
        <CodeBlockTitle className="text-xs font-normal text-muted-foreground">
          {codeTitle(lang, meta)}
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton value={block.text} aria-label={m.docs_code_copy()} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent>
        <code>{block.text}</code>
      </CodeBlockContent>
    </CodeBlock>
  )
}

/** 独占一行的图片：`<img>` + 懒加载，`not-prose` 隔离 typography 的默认外边距。 */
function Figure({ image }: { image: ImageBlock }) {
  return (
    <figure className="not-prose my-5">
      <img
        src={image.src}
        alt={image.alt}
        loading="lazy"
        decoding="async"
        className="w-full rounded-xl border border-border"
      />
      <figcaption className="mt-2 text-center text-xs text-muted-foreground">
        {image.caption || image.alt}
      </figcaption>
    </figure>
  )
}

function Table({ table }: { table: TableBlock }) {
  return (
    // `not-prose`：表格样式由 ui/table 与 globals.css 的 `[data-slot='table-*']` 提供。
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

/** 丢弃正文开头的 `# 标题`，避免与 frontmatter 标题重复成两个 `<h1>`。 */
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

/**
 * 解析独占一行的图片。地址走 {@link safeHref} 的 scheme 白名单，非法时返回
 * `undefined`，该行退回普通段落。
 */
function parseImageLine(line: string): ImageBlock | undefined {
  const match = /^\s*!\[([^\]]*)\]\(\s*([^)\s]+)\s*(?:"([^"]*)")?\s*\)\s*$/.exec(line)
  if (!match) return undefined
  const src = safeHref(match[2] ?? '')
  if (src === undefined) return undefined
  return { kind: 'image', src, alt: (match[1] ?? '').trim(), caption: (match[3] ?? '').trim() }
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
  let codeLang = ''
  let codeMeta = ''
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
        out.push({ kind: 'code', text: codeBuf.join('\n'), lang: codeLang, meta: codeMeta })
        codeBuf = []
        codeLang = ''
        codeMeta = ''
        inCode = false
      } else {
        flushPara()
        inCode = true
        // 围栏信息串拆成语言与其余标记，仅用于标题栏，不做语法高亮。
        const info = line.slice(3).trim()
        codeLang = info.split(/\s+/)[0] ?? ''
        codeMeta = info.slice(codeLang.length).trim()
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }

    if (isTableRow(line)) {
      flushPara()
      const raw: string[] = []
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        raw.push(lines[i] ?? '')
        i++
      }
      i--
      const body = raw.filter((row) => !isTableDivider(row))
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

    // 图片必须放在段落分支之前，否则 `![](...)` 会被当成普通段落原样显示。
    const image = parseImageLine(line)
    if (image) {
      flushPara()
      out.push(image)
      continue
    }

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

/** 行内 markdown → JSX：`code`、`**bold**`、`[文字](地址)`；链接文字递归解析。 */
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
      // 非法 scheme 只保留文字：React 生产期不拦截 `javascript:` 地址，必须在此丢弃。
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
 * 只放行 `http` / `https` / `mailto` 与相对路径、锚点；其余 scheme 返回 `undefined`。
 * 渲染器是通用组件，不能依赖内容源的信任级别兜底。
 */
function safeHref(href: string): string | undefined {
  const value = href.trim()
  if (/^(https?:|mailto:)/i.test(value)) return value
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return undefined
  return value
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
