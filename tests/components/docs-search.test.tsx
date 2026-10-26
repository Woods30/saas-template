import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocsSearch } from '@/components/docs/DocsSearch'
import type { DocEntry } from '@/lib/docs'
import { setLocale } from '@/locale/paraglide/runtime.js'

/** 文档搜索：触发器弹出居中弹窗，纯前端过滤（文档在构建期已全部载入）。 */
// 只替换路由边界；mock 的 `Link` 需还原 `params` / `hash` 拼接，
// 否则「锚点指向哪一节」测的是 mock 而不是组件。
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
// 不手动清空 `document.body`：Portal 节点会让 Base UI 卸载时报 `NotFoundError`，
// 交给 testing-library 的自动 cleanup。

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
  // 描述里刻意不放 `Email`：高亮测试断言标题命中只产生一个 `<mark>`。
  entry('email', 'Email', 'Resend provider', 6, 'features'),
  entry('payment', 'Payment', 'Stripe checkout', 8, 'features'),
  entry('configuration', 'Website Config', 'All fields', 2, 'config'),
]

/** 带正文与小节的文档，验证「正文命中 + 目录树」。 */
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

/** 在弹窗输入框里输入；cmdk 渲染的是 `role="combobox"` 而非原生 searchbox。 */
function type(value: string) {
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByRole('combobox'), { target: { value } })
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
    expect(within(dialog).getByRole('combobox')).toHaveAccessibleName()
  })

  it('打开后自动聚焦输入框', async () => {
    render(<DocsSearch docs={DOCS} locale="zh" />)
    const dialog = open()
    // Base UI 挂载后异步移动焦点，需等一拍。
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('combobox')))
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
    // 高亮用 <mark>，默认带底色。
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
    const sectionLink = within(dialog).getByRole('link', { name: /Webhook/ })
    expect(sectionLink).toHaveAttribute('href', '/docs/payment#webhook')
    // 摘要被 `<mark>` 拆开，断言整段文本。
    expect(sectionLink).toHaveTextContent(/Signature failures/)
  })

  it('子小节命中时保留其父小节，形成目录树', () => {
    render(<DocsSearch docs={DOCS_WITH_CONTENT} locale="zh" />)
    open()
    type('Signature')
    const dialog = screen.getByRole('dialog')
    // 父级 h2 也是链接，但没有摘要。
    const parent = within(dialog).getByRole('link', { name: 'Enable payment' })
    expect(parent).toHaveAttribute('href', '/docs/payment#enable-payment')
    expect(parent).toHaveAttribute('data-level', '2')
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
