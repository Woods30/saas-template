import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocsLayout } from '@/components/docs/DocsLayout'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 文档站的 shell 布局：侧边栏可收起，并随视口自适应。
 *
 * 宽屏（≥ lg）下侧栏常驻，但可手动收起，把 240px 让给正文；窄屏下常驻侧栏放不
 * 下（会把正文挤成一条），因此默认隐藏，由顶部菜单按钮以抽屉形式覆盖打开。
 *
 * jsdom 不做媒体查询，所以这里断言的是**状态落到哪个可见性类**；断点本身由
 * `e2e/docs.spec.ts` 在真实视口下覆盖。
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

beforeEach(() => {
  // 收起偏好写在 cookie 上，jsdom 的 cookie jar 在同一文件内跨用例共享——不清空会
  // 让后一个用例带着上一个用例的状态启动。必须先清再 `setLocale`：后者自己也写
  // cookie，顺序反了会把语言一起清掉，文案变成英文。
  clearCookies()
  setLocale('zh', { reload: false })
})

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) {
      // biome-ignore lint/suspicious/noDocumentCookie: 测试清理，必须同步改写 cookie jar。
      document.cookie = `${name}=; Path=/; Max-Age=0`
    }
  }
}

/** 侧栏面板本体（`<aside>` → role=complementary）。 */
function panel() {
  return screen.getByRole('complementary')
}

/**
 * 窄屏顶栏。
 *
 * jsdom 不应用 Tailwind 的 `lg:hidden`，因此顶栏与侧栏里的按钮在测试里**同时可见**，
 * 按名字全局查询会命中多个。需要区分时用本函数把查询范围收窄到顶栏。
 */
function header() {
  const element = document.querySelector('header')
  if (!element) throw new Error('未找到顶栏')
  return element as HTMLElement
}

describe('DocsLayout', () => {
  it('宽屏默认展开侧栏，窄屏隐藏', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    const aside = panel()
    // 基础 `hidden` 让窄屏先隐藏；`lg:flex` 在宽屏常驻。
    expect(aside.className).toContain('lg:flex')
    expect(aside.className).not.toContain('lg:hidden')
  })

  it('收起后宽屏也隐藏侧栏', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    fireEvent.click(screen.getByRole('button', { name: '收起文档导航' }))
    expect(panel().className).toContain('lg:hidden')
  })

  it('收起后可再次展开', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    fireEvent.click(screen.getByRole('button', { name: '收起文档导航' }))
    fireEvent.click(screen.getByRole('button', { name: '展开文档导航' }))
    expect(panel().className).not.toContain('lg:hidden')
  })

  it('窄屏菜单按钮把侧栏变成覆盖正文的抽屉', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    // 关闭时不占位：基础类里没有 `fixed`。
    expect(panel().className).not.toContain('fixed')
    fireEvent.click(screen.getByRole('button', { name: '打开文档导航' }))
    expect(panel().className).toContain('fixed')
  })

  it('抽屉打开状态下拉宽到 lg 不会把侧栏整个藏掉', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    fireEvent.click(screen.getByRole('button', { name: '打开文档导航' }))
    // 打开抽屉时若仍带 `lg:hidden`，用户在抽屉开着时拉宽窗口会让侧栏彻底消失
    // ——窄屏的抽屉态必须能被宽屏的常驻态覆盖。
    expect(panel().className).not.toContain('lg:hidden')
  })

  it('抽屉的关闭按钮收起抽屉，并把焦点归还给触发按钮', async () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    const trigger = screen.getByRole('button', { name: '打开文档导航' })
    fireEvent.click(trigger)
    // 顶栏的同一个按钮切换成「关闭」语义；全页只有这一个关闭入口（侧栏顶部不再重复）。
    fireEvent.click(screen.getByRole('button', { name: '关闭文档导航' }))
    expect(panel().className).not.toContain('fixed')
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('顶栏的搜索图标与侧栏触发器打开同一个弹窗', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    expect(screen.queryByRole('dialog')).toBeNull()
    // 侧栏在窄屏是隐藏的，顶栏的图标是那里唯一的搜索入口。
    fireEvent.click(within(header()).getByRole('button', { name: '搜索文档' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('⌘K / Ctrl+K 打开搜索弹窗', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('侧栏收起后，展开入口移到侧栏之外（否则再也点不到）', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    // 展开态：收起按钮在侧栏内，浮动工具条不存在。
    expect(within(panel()).getByRole('button', { name: '收起文档导航' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '展开文档导航' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '收起文档导航' }))
    // 侧栏整体隐藏（`lg:hidden`），展开按钮必须落在它外面才点得到。
    const expand = screen.getByRole('button', { name: '展开文档导航' })
    expect(panel().contains(expand)).toBe(false)
    expect(expand.parentElement?.className).toContain('fixed')

    fireEvent.click(expand)
    expect(panel().className).not.toContain('lg:hidden')
  })

  it('抽屉按 Escape 关闭', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    fireEvent.click(screen.getByRole('button', { name: '打开文档导航' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(panel().className).not.toContain('fixed')
  })

  it('侧栏内始终包含搜索、导航与左下角工具条', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    const aside = panel()
    expect(within(aside).getByRole('button', { name: '搜索文档' })).toBeTruthy()
    expect(within(aside).getByRole('navigation', { name: '文档导航' })).toBeTruthy()
    expect(within(aside).getByRole('button', { name: '切换语言' })).toBeTruthy()
    expect(within(aside).getByRole('button', { name: /切换主题/ })).toBeTruthy()
  })
})
