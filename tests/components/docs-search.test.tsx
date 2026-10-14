import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocsSearch } from '@/components/docs/DocsSearch'
import type { DocEntry } from '@/lib/docs'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 文档搜索：侧栏顶部一个触发器，点击后弹出屏幕居中的搜索弹窗。
 *
 * 侧栏只有 240px 宽，结果直接铺在侧栏里会被挤成一两行、看不清上下文；改成居中
 * 弹窗后结果有足够宽度展示标题与描述，也更符合「搜索」这个动作的预期。
 *
 * 纯前端过滤：文档在构建期已全部载入，无需请求后端。
 */
// 只替换路由边界（与 `landing.test.tsx` 同一手法），检索逻辑用真实实现。
// mock 需还原真实 `Link` 对 `params` / `hash` 的拼接方式，否则「锚点指向哪一节」
// 这类断言测的是 mock 而不是组件。
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    hash,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string
    params?: Record<string, string>
    hash?: string
  }) => (
    <a {...props} href={`${params ? `/docs/${params.slug}` : (to ?? '')}${hash ? `#${hash}` : ''}`}>
      {children}
    </a>
  ),
}))

beforeEach(() => setLocale('zh', { reload: false }))
// 不手动清空 `document.body`：弹窗通过 Portal 挂到 body 上，直接清空会让 Base UI
// 在卸载时找不到自己插入的节点（`NotFoundError`）。testing-library 的自动 cleanup
// 会走正常的卸载路径。

function entry(
  slug: string,
  title: string,
  description: string,
  order: number,
  group: string,
  content = '',
): DocEntry {
  return { slug, title, description, content, order, group, updated: '' }
}

const DOCS: DocEntry[] = [
  // 描述里刻意不放 `Email`：高亮测试要断言标题命中只产生一个 `<mark>`。
  entry('email', 'Email', 'Resend provider', 6, 'features'),
  entry('payment', 'Payment', 'Stripe checkout', 8, 'features'),
  entry('configuration', 'Website Config', 'All fields', 2, 'config'),
]

/** 带正文与小节的文档，用于验证「正文命中 + 目录树」。 */
const DOCS_WITH_CONTENT: DocEntry[] = [
  entry(
    'payment',
    'Payment',
    'Stripe checkout',
    8,
    'features',
    [
      '## Enable payment',
      '',
      'Only Stripe is supported.',
      '',
      '### Webhook',
      '',
      'Signature failures return 400.',
    ].join('\n'),
  ),
]

/** 打开搜索弹窗。 */
function open() {
  fireEvent.click(screen.getByRole('button', { name: '搜索文档' }))
  return screen.getByRole('dialog')
}

/** 在弹窗的输入框里输入。 */
function type(value: string) {
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value } })
}

describe('DocsSearch', () => {
  it('默认只渲染触发器，不渲染弹窗', () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    expect(screen.getByRole('button', { name: '搜索文档' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('点击触发器打开居中的搜索弹窗', () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    const dialog = open()
    expect(within(dialog).getByRole('searchbox')).toHaveAccessibleName()
  })

  it('打开后自动聚焦输入框', async () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    const dialog = open()
    // Base UI 在弹窗挂载后异步移动焦点，需等一拍。
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('searchbox')))
  })

  it('按标题过滤并给出匹配结果', () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    open()
    type('pay')
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['PaymentStripe checkout'])
  })

  it('按描述也能匹配', () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    open()
    type('stripe')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText('Payment')).toBeTruthy()
  })

  it('匹配大小写不敏感', () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    open()
    type('EMAIL')
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveTextContent('Email')
  })

  it('空查询时不展示任何结果（不再默认铺出全部文档）', () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    open()
    expect(screen.queryAllByRole('link')).toEqual([])
    expect(screen.getByText(/输入关键词/)).toBeTruthy()
  })

  it('无匹配时提示未找到，且不展示链接', () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    open()
    type('zzzz')
    expect(screen.queryAllByRole('link')).toEqual([])
    expect(screen.getByText(/未找到/)).toBeTruthy()
  })

  it('文档标题里的关键词高亮', () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    open()
    type('Email')
    const dialog = screen.getByRole('dialog')
    // 高亮用 <mark>：默认带浏览器底色，无需额外样式也不会被当成普通文本。
    expect(within(dialog).getAllByText('Email', { selector: 'mark' })).toHaveLength(1)
  })

  it('高亮大小写不敏感（关键词小写也能命中大写正文）', () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    open()
    type('email')
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByText('Email', { selector: 'mark' })).toHaveLength(1)
  })

  it('摘要里的关键词高亮', () => {
    render(<DocsSearch docs={DOCS_WITH_CONTENT} locale="zh" />)
    open()
    type('Signature')
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Signature', { selector: 'mark' })).toBeTruthy()
  })

  it('正文命中时给出该小节，并附摘要', () => {
    render(<DocsSearch docs={DOCS_WITH_CONTENT} locale="zh" />)
    open()
    type('Signature')
    const dialog = screen.getByRole('dialog')
    // 小节标题是链接，指向该小节的锚点；可访问名同时包含摘要。
    const sectionLink = within(dialog).getByRole('link', { name: /Webhook/ })
    expect(sectionLink).toHaveAttribute('href', '/docs/payment#webhook')
    // 摘要里的关键词被 `<mark>` 拆开，断言整段文本而非单个文本节点。
    expect(sectionLink).toHaveTextContent(/Signature failures/)
  })

  it('子小节命中时保留其父小节，形成目录树', () => {
    render(<DocsSearch docs={DOCS_WITH_CONTENT} locale="zh" />)
    open()
    type('Signature')
    const dialog = screen.getByRole('dialog')
    // 父级 h2 只作为层级出现，也是链接（可跳到该节），但没有摘要。
    const parent = within(dialog).getByRole('link', { name: 'Enable payment' })
    expect(parent).toHaveAttribute('href', '/docs/payment#enable-payment')
    expect(parent).toHaveAttribute('data-level', '2')
    // 命中的 h3 缩进更深，用 data-level 标出。
    expect(within(dialog).getByRole('link', { name: /Webhook/ })).toHaveAttribute('data-level', '3')
  })

  it('文档标题命中时整篇作为结果，不列出小节', () => {
    render(<DocsSearch docs={DOCS_WITH_CONTENT} locale="zh" />)
    open()
    type('payment')
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('link', { name: /Payment/ })).toHaveAttribute(
      'href',
      '/docs/payment',
    )
    expect(within(dialog).queryByText('Webhook')).toBeNull()
  })

  it('按 Escape 关闭弹窗', () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    const dialog = open()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
