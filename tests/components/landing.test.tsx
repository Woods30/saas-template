import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingPage } from '@/components/marketing/LandingPage'
import { getLocale, setLocale } from '@/locale/paraglide/runtime.js'

// 只替换路由边界，正文与 locale 使用真实组件和运行时。
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    hash,
    preload: _preload,
    params: _params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string
    hash?: string
    preload?: string
    params?: unknown
  }) => (
    <a {...props} href={`${to === '.' ? '' : (to ?? '')}${hash ? `#${hash}` : ''}`}>
      {children}
    </a>
  ),
}))

beforeEach(() => setLocale('zh', { reload: false }))
afterEach(() => {
  cleanup()
  setLocale('zh', { reload: false })
})

describe('LandingPage', () => {
  it.each(['zh', 'en'] as const)('%s 首页连接品牌 Slogan、跳鼠故事与独立创造者', (locale) => {
    setLocale(locale, { reload: false })
    const { container } = render(<LandingPage />)
    expect(container).toHaveTextContent('Small Steps. Big Leaps.')
    expect(container).toHaveTextContent('Jerbix Starter')
    const story = screen.getByRole('region', {
      name: locale === 'zh' ? '小小的身躯，也能跨越远方。' : 'Small makers. Far horizons.',
    })
    expect(story).toHaveTextContent(locale === 'zh' ? '跳鼠' : 'jerboa')
    expect(story).toHaveTextContent(locale === 'zh' ? '一个人' : 'solo maker')
    expect(story).toHaveTextContent('Small Steps. Big Leaps.')
    expect(container).not.toHaveTextContent(/工程能力示意|Engineering illustration|JERBIX \/ LAB/)
  })
  it.each(['zh', 'en'] as const)('%s 首页优先呈现技术栈与可复用组件，首屏保持简短', (locale) => {
    setLocale(locale, { reload: false })
    const { container } = render(<LandingPage />)
    const hero = container.querySelector('.lab-hero')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Leap from Idea to Launch.')
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('lang', 'en')
    expect(hero).not.toHaveTextContent('Small Steps. Big Leaps.')
    const stack = container.querySelector('#stack')
    expect(stack).toHaveTextContent('TanStack Start')
    expect(stack).toHaveTextContent('Cloudflare')
    expect(stack).toHaveTextContent('shadcn/ui')
    expect(stack).toHaveTextContent('Base UI')
    expect(stack).toHaveTextContent('Biome')
    expect(stack).toHaveTextContent('Vitest')
    expect(container.querySelectorAll('#story')).toHaveLength(1)
  })
  it('跳跃旅程串联灵感、构建与上线，并可暂停和恢复动效', () => {
    const { container } = render(<LandingPage />)
    const idea = screen.getByRole('button', { name: '01 灵感' })
    const build = screen.getByRole('button', { name: '02 构建' })
    const launch = screen.getByRole('button', { name: '03 上线' })
    expect(idea).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(build)
    expect(build).toHaveAttribute('aria-pressed', 'true')
    expect(idea).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('region', { name: '02 构建' })).toHaveTextContent('Jerbix Starter')
    expect(container.querySelector('.leap-scene')).toHaveAttribute('data-step', '1')
    fireEvent.click(launch)
    expect(screen.getByRole('region', { name: '03 上线' })).toHaveTextContent('用户')
    expect(container.querySelector('.leap-scene')).toHaveAttribute('data-step', '2')
    fireEvent.click(screen.getByRole('button', { name: '暂停动效' }))
    expect(screen.getByRole('button', { name: '恢复动效' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '恢复动效' }))
    expect(screen.getByRole('button', { name: '暂停动效' })).toBeInTheDocument()
  })

  it('启动步骤可切换对应预览面板', () => {
    render(<LandingPage />)
    const resources = screen.getByRole('button', { name: /配置自己的资源/ })
    const business = screen.getByRole('button', { name: /接入产品业务/ })
    const deploy = screen.getByRole('button', { name: /检查，然后部署/ })
    expect(resources).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(business)
    expect(business).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: /接入产品业务/ })).toHaveTextContent('src/routes/')
    fireEvent.click(deploy)
    expect(screen.getByRole('region', { name: /检查，然后部署/ })).toHaveTextContent('pnpm build')
  })

  it('双语场景可以切换预览，不改变页面语言', () => {
    render(<LandingPage />)
    const preview = screen.getByRole('group', { name: '语言预览' })
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(preview).toHaveTextContent('Build your next idea.')
    expect(getLocale()).toBe('zh')
    fireEvent.click(screen.getByRole('button', { name: '中文' }))
    expect(preview).toHaveTextContent('构建你的下一个想法。')
  })
  it('保留特性 / 源码说明 / FAQ 锚点，并提供三步启动流程', () => {
    const { container } = render(<LandingPage />)
    for (const id of ['features', 'pricing', 'faq', 'workflow']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
  })

  it('连续 zh → en → zh render 时，标题、能力正文与文档入口跟随真实 locale', () => {
    const { rerender } = render(<LandingPage />)
    const cases = [
      {
        locale: 'zh',
        title: 'Leap from Idea to Launch.',
        feature: '认证基础，少写重复代码',
        cta: '了解如何开始',
      },
      {
        locale: 'en',
        title: 'Leap from Idea to Launch.',
        feature: 'Auth foundations, less repetitive code',
        cta: 'See how to start',
      },
      {
        locale: 'zh',
        title: 'Leap from Idea to Launch.',
        feature: '认证基础，少写重复代码',
        cta: '了解如何开始',
      },
    ] as const
    for (const { locale, title, feature, cta } of cases) {
      setLocale(locale, { reload: false })
      expect(getLocale()).toBe(locale)
      rerender(<LandingPage />)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title)
      expect(screen.getByRole('heading', { name: feature })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: cta })).toHaveAttribute('href', `/${locale}/docs`)
    }
  })

  it.each(['zh', 'en'] as const)(
    '%s 首页说明源码与自有资源，不展示演示套餐、性能数字或用户评价',
    (locale) => {
      setLocale(locale, { reload: false })
      const { container } = render(<LandingPage />)
      expect(container).not.toHaveTextContent(
        /\$29|\$99|100ms|200\+|最多 3 个用户|Up to 3 users|用户怎么说|What users say|三天上线 MVP|Launched our MVP/i,
      )
      expect(
        screen.queryByRole('link', { name: /立即注册|Create account/i }),
      ).not.toBeInTheDocument()
      expect(container.querySelector('#pricing')).toHaveTextContent(
        locale === 'zh' ? '源码可修改' : 'Source you can modify',
      )
      expect(container.querySelector('#pricing')).toHaveTextContent(
        locale === 'zh' ? '服务凭据' : 'service credentials',
      )
      expect(
        screen.getByRole('link', {
          name: locale === 'zh' ? '探索内置能力' : 'Explore built-in capabilities',
        }),
      ).toHaveAttribute('href', '#features')
    },
  )

  it.each(['zh', 'en'] as const)(
    '%s FAQ 包含五问，展开后准确说明 D1 SQLite 与 Drizzle',
    (locale) => {
      setLocale(locale, { reload: false })
      const { container } = render(<LandingPage />)
      const faq = container.querySelector('#faq')
      expect(faq?.querySelectorAll('details')).toHaveLength(5)
      const summary = screen.getByText(
        locale === 'zh' ? '使用什么数据库？' : 'Which database does it use?',
      )
      fireEvent.click(summary)
      expect(summary.closest('details')).toHaveAttribute('open')
      expect(summary.closest('details')).toHaveTextContent(
        locale === 'zh' ? 'D1（SQLite）' : 'D1 (SQLite)',
      )
      expect(summary.closest('details')).toHaveTextContent('Drizzle')
      expect(faq).not.toHaveTextContent(
        /PostgreSQL|MySQL|MFA|Magic Link|退款全流程|delivery tracking/i,
      )
    },
  )
})
