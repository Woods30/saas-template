import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { assertPageEnabled } from '@/lib/module-access'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/auth/verify-email')({
  // better-auth 失败时会重定向回本页并追加 `?error=<code>`；只取用得到的字段，
  // 未识别的参数一律忽略（用户可能手改 URL，不应因此 400）。
  validateSearch: z.object({ error: z.string().optional() }),
  beforeLoad: () => assertPageEnabled('auth'),
  component: VerifyEmailPage,
})

/**
 * 邮箱验证落地页。
 *
 * 真正的校验由邮件里的链接完成——它指向 better-auth 的 **GET**
 * `/api/auth/verify-email?token=…&callbackURL=/{locale}/auth/verify-email`。该端点校验
 * 后**重定向**回本页，并在失败时追加 `?error=<code>`（见 better-auth
 * `email-verification.mjs` 的 `redirectOnError`）。因此本页不调用任何客户端 SDK，
 * 只按查询参数渲染三种状态：
 *
 * - 无 `error`：验证成功（或用户直接访问了本页）；
 * - `error=INVALID_TOKEN` / `TOKEN_EXPIRED`：链接无效或过期。
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
