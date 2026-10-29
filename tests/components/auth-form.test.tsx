import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons'
import { SubmitButton } from '@/components/auth/SubmitButton'
import { websiteConfig } from '@/config/website'
import { setLocale } from '@/locale/paraglide/runtime.js'
import { Route as LoginRoute } from '@/routes/{-$locale}/auth/login'
import { Route as RegisterRoute } from '@/routes/{-$locale}/auth/register'
import { Route as VerifyRoute } from '@/routes/{-$locale}/auth/verify-email'

const flow = vi.hoisted(() => ({
  search: { redirect: '/zh/#pricing' } as Record<string, unknown>,
  signup: vi.fn().mockResolvedValue({ error: null }),
  social: vi.fn(),
}))
vi.mock('@/auth/client', () => ({
  signIn: { social: flow.social, email: vi.fn() },
  signUp: { email: flow.signup },
}))
vi.mock('@/auth/providers', () => ({ fetchAuthProviderAvailability: vi.fn() }))
vi.mock('@/lib/analytics/events', () => ({ trackSignUp: vi.fn(), trackLogin: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  flow.search = { redirect: '/zh/#pricing' }
  vi.unstubAllGlobals()
  websiteConfig.auth.requireEmailVerification = false
})

/** 认证页共享 UI：提交态（含水合前禁用）、社交登录按钮、布局外壳。 */
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useSearch: () => flow.search,
    useRouteContext: () => ({ google: true }),
  }),
  Link: ({
    children,
    to,
    search,
    params: _params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string
    search?: Record<string, string>
    params?: unknown
  }) => (
    <a
      href={`${to ?? '#'}${search?.redirect ? `?redirect=${encodeURIComponent(search.redirect)}` : ''}`}
      {...props}
    >
      {children}
    </a>
  ),
}))

describe('购买后的认证回跳', () => {
  it('验证邮件过期时显示失败并保留登录后的购买目标', () => {
    setLocale('zh', { reload: false })
    const validate = VerifyRoute.options.validateSearch as {
      parse: (input: Record<string, unknown>) => Record<string, unknown>
    }
    flow.search = validate.parse({ error: 'TOKEN_EXPIRED', redirect: '/zh/#pricing' })
    const Page = VerifyRoute.options.component as React.ComponentType
    render(<Page />)
    expect(screen.getByText(/验证链接无效或已过期/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute(
      'href',
      '/{-$locale}/auth/login?redirect=%2Fzh%2F%23pricing',
    )
    flow.search = { redirect: '/zh/#pricing' }
  })
  it('登录页切换注册时携带购买目标', () => {
    setLocale('zh', { reload: false })
    const Page = LoginRoute.options.component as React.ComponentType
    render(<Page />)
    expect(screen.getByRole('link', { name: '立即注册' })).toHaveAttribute(
      'href',
      '/{-$locale}/auth/register?redirect=%2Fzh%2F%23pricing',
    )
  })

  it.each(['/zh/#pricing', '//evil.example', '/\\\\evil.example'])(
    '注册只接受安全回跳 %s',
    (redirect) => {
      const validate = RegisterRoute.options.validateSearch as (
        search: Record<string, unknown>,
      ) => Record<string, unknown>
      expect(validate({ redirect }).redirect).toBe(
        redirect === '/zh/#pricing' ? redirect : undefined,
      )
    },
  )

  it.each([false, true])('注册完成后保留购买目标，邮箱验证=%s', async (verify) => {
    setLocale('zh', { reload: false })
    websiteConfig.auth.requireEmailVerification = verify
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const Page = RegisterRoute.options.component as React.ComponentType
    render(<Page />)
    fireEvent.click(screen.getByRole('button', { name: /Google/ }))
    expect(flow.social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/zh/#pricing' })
    fireEvent.change(screen.getByRole('textbox', { name: '昵称' }), { target: { value: 'Buyer' } })
    fireEvent.change(screen.getByRole('textbox', { name: '邮箱' }), {
      target: { value: 'buyer@example.com' },
    })
    fireEvent.change(screen.getByLabelText('密码（≥ 8 字符）'), {
      target: { value: 'StrongPassword123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: '注册' }))
    await waitFor(() =>
      expect(flow.signup).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: '/zh/auth/verify-email?redirect=%2Fzh%2F%23pricing',
        }),
      ),
    )
    if (verify) {
      await waitFor(() =>
        expect(screen.getByRole('link', { name: '已有账号？立即登录' })).toHaveAttribute(
          'href',
          '/{-$locale}/auth/login?redirect=%2Fzh%2F%23pricing',
        ),
      )
    } else {
      await waitFor(() => expect(assign).toHaveBeenCalledWith('/zh/#pricing'))
    }
  })
})

describe('SubmitButton', () => {
  it('空闲态显示传入文案', () => {
    render(<SubmitButton pending={false}>登录</SubmitButton>)
    const button = screen.getByRole('button', { name: '登录' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('aria-busy', 'false')
  })

  it('提交中禁用并标记 aria-busy，文案换成 pendingLabel', () => {
    render(
      <SubmitButton pending pendingLabel="提交中…">
        登录
      </SubmitButton>,
    )
    const button = screen.getByRole('button', { name: '提交中…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('服务端渲染时禁用：水合前点击会退化为原生 GET，把密码写进 URL', () => {
    // `renderToStaticMarkup` 走 getServerSnapshot 分支，与真实 SSR 输出一致。
    const html = renderToStaticMarkup(<SubmitButton pending={false}>登录</SubmitButton>)
    // 断言 `disabled` 属性本身：class 里含 `disabled:pointer-events-none`，子串匹配会误通过。
    expect(html).toMatch(/<button[^>]*\sdisabled(?:=|[\s>])/)
  })

  it('水合后恢复可点击（不能把禁用态留在客户端）', () => {
    render(<SubmitButton pending={false}>登录</SubmitButton>)
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled()
  })
})

describe('SocialAuthButtons', () => {
  it('未配置 Google 时不渲染任何按钮', () => {
    const { container } = render(
      <SocialAuthButtons googleEnabled={false} onGoogleClick={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('配置了 Google 时渲染可点击的 Google 按钮', () => {
    const onClick = vi.fn()
    render(<SocialAuthButtons googleEnabled onGoogleClick={onClick} />)
    const button = screen.getByRole('button', { name: /Google/ })
    button.click()
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('AuthLayout', () => {
  it('渲染标题、描述与内容槽，并带品牌链接', () => {
    render(
      <AuthLayout title="登录" description="欢迎回来">
        <p>表单</p>
      </AuthLayout>,
    )
    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument()
    expect(screen.getByText('欢迎回来')).toBeInTheDocument()
    expect(screen.getByText('表单')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  // 法律声明只属于创建账号 / 登录页；verify-email 与找回密码页显示它像 bug，
  // 因此默认不渲染，由 login / register 显式打开。
  it('默认不渲染法律声明', () => {
    setLocale('zh', { reload: false })
    render(<AuthLayout title="登录">表单</AuthLayout>)
    expect(screen.queryByText('服务条款')).not.toBeInTheDocument()
    expect(screen.queryByText('隐私政策')).not.toBeInTheDocument()
  })

  it('传 legalNotice 时渲染 Terms 与 Privacy 两个链接', () => {
    setLocale('zh', { reload: false })
    render(
      <AuthLayout title="注册" legalNotice>
        表单
      </AuthLayout>,
    )
    // 只断言文案：本文件的 `Link` mock 吃不到 `params`，href 由 `navigation.test.ts` 覆盖。
    expect(screen.getByRole('link', { name: '服务条款' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '隐私政策' })).toBeInTheDocument()
  })
})
