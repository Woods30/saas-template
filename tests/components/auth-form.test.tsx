import { render, screen } from '@testing-library/react'
import type React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons'
import { SubmitButton } from '@/components/auth/SubmitButton'

/**
 * 认证页共享 UI 组件。
 *
 * 这里覆盖提交态（含「水合前禁用」）、社交登录按钮的条件渲染与布局外壳。
 * 字段组件 `AuthFormField` 由 `auth-form-field.test.tsx` 用真实 `useForm` 驱动覆盖，
 * 不在此重复——脱离表单实例的断言无法反映它的实际接线。
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: unknown }) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
}))

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
    // `renderToStaticMarkup` 走 `useSyncExternalStore` 的 getServerSnapshot 分支，
    // 与真实 SSR 输出一致。
    const html = renderToStaticMarkup(<SubmitButton pending={false}>登录</SubmitButton>)
    // 断言 `disabled` 属性本身，不能用 `toContain('disabled')`：Button 的 class
    // 里就含 `disabled:pointer-events-none`，那样即使属性缺失也会通过。
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
})
