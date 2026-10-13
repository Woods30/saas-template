import { useMemo } from 'react'
import '@/styles/mdx.css'

/**
 * 最小 markdown 渲染：把 Content Collections 文档字符串转为 JSX.
 *
 * 支持：# / ## / ### 标题、代码块（```...```）、段落、行内 `code`、`**bold**。
 * 不支持：图片、链接、列表、表格、HTML（v0.2 升级到 @mdx-js/rollup 后开启）。
 */
export function Mdx({ source }: { source: string }) {
  // 正文开头的 `# 标题` 与 frontmatter 的 `title` 重复（调用方都已用
  // frontmatter 标题渲染页面 `<h1>`），丢弃首个 h1 块避免页面出现两个标题。
  const blocks = useMemo(() => stripLeadingHeading(parseBlocks(source)), [source])
  return (
    <div className="mdx prose max-w-3xl">
      {blocks.map((b, idx) => {
        const key = `block-${idx}`
        if (b.kind === 'h1') return <h1 key={key}>{b.text}</h1>
        if (b.kind === 'h2') return <h2 key={key}>{b.text}</h2>
        if (b.kind === 'h3') return <h3 key={key}>{b.text}</h3>
        if (b.kind === 'code')
          return (
            <pre key={key}>
              <code>{b.text}</code>
            </pre>
          )
        return <p key={key}>{renderInline(b.text)}</p>
      })}
    </div>
  )
}

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'code' | 'p'
  text: string
}

/**
 * 丢弃正文开头的 `# 标题` 块（若存在）。所有调用方已用 frontmatter 的
 * `title` 渲染页面标题，正文里重复的 h1 会造成页面上出现两个 `<h1>`。
 */
function stripLeadingHeading(blocks: Block[]): Block[] {
  return blocks[0]?.kind === 'h1' ? blocks.slice(1) : blocks
}

function parseBlocks(source: string): Block[] {
  const out: Block[] = []
  const lines = source.split('\n')
  let inCode = false
  let codeBuf: string[] = []
  let paraBuf: string[] = []

  function flushPara() {
    const text = paraBuf.join(' ').trim()
    if (text) out.push({ kind: 'p', text })
    paraBuf = []
  }

  for (const line of lines) {
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
 * 把行内 markdown（`code` 和 **bold**）转成 JSX 子元素。
 * 先按 code 再按 bold 分割，保持顺序。
 */
function renderInline(text: string): React.ReactNode {
  // 先处理 code（内联代码），再处理 bold。
  const parts: React.ReactNode[] = []
  const remaining = text

  // 匹配 `code` 或 **bold**
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g
  let last = 0
  let match: RegExpExecArray | null = re.exec(remaining)
  while (match !== null) {
    // 安全转义前面非匹配文本
    if (match.index > last) {
      parts.push(escapeText(remaining.slice(last, match.index)))
    }
    if (match[1] !== undefined) {
      // inline code
      parts.push(<code key={match.index}>{match[1]}</code>)
    } else if (match[2] !== undefined) {
      // bold
      parts.push(<strong key={match.index}>{match[2]}</strong>)
    }
    last = re.lastIndex
    match = re.exec(remaining)
  }

  if (last < remaining.length) {
    parts.push(escapeText(remaining.slice(last)))
  }

  return parts.length === 1 ? parts[0] : parts
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
