import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { assertPageEnabled } from '@/lib/module-access'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/auth/verify-email')({
  // 未识别的参数一律忽略：用户可能手改 URL，不应因此 400。
  validateSearch: z.object({ error: z.string().optional() }),
  beforeLoad: () => assertPageEnabled('auth'),
  component: VerifyEmailPage,
})

/**
 * 邮箱验证落地页。
 *
 * 校验由邮件链接指向的 better-auth GET 端点完成，失败时重定向回本页并追加
 * `?error=<code>`。因此本页不调用任何客户端 SDK，只按查询参数渲染结果。
 */
const INVALID_TOKEN_CODES = new Set(['INVALID_TOKEN', 'TOKEN_EXPIRED', 'USER_NOT_FOUND'])

function VerifyEmailPage() {
  const { error } = Route.useSearch()
  const failed = error !== undefined && INVALID_TOKEN_CODES.has(error)

  return (
    <AuthLayout title={m.auth_verify_title()}>
      <p className="text-sm text-muted-foreground">
        {failed ? m.auth_verify_invalid() : m.auth_verify_verified()}
      </p>
      <Link
        to="/{-$locale}/auth/login"
        className="mt-4 block text-center text-sm text-muted-foreground underline hover:text-foreground"
      >
        {m.auth_error_back()}
      </Link>
    </AuthLayout>
  )
}
