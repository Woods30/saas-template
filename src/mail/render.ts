import type { FunctionComponent } from 'react'
import { z } from 'zod'
import ContactMessageTemplate from './templates/contact-message'
import ForgotPasswordTemplate from './templates/forgot-password'
import VerifyEmailTemplate from './templates/verify-email'
import type { EmailTemplate, SendTemplateParams } from './types'

const subjects: Record<EmailTemplate, Record<'zh' | 'en', string>> = {
  verifyEmail: { zh: '验证你的邮箱', en: 'Verify your email' },
  forgotPassword: { zh: '重置密码', en: 'Reset your password' },
  contactMessage: { zh: '新的联系消息', en: 'New contact message' },
}

type TemplateContext = {
  verifyEmail: { username: string; actionUrl: string }
  forgotPassword: { username: string; actionUrl: string }
  contactMessage: { fromName: string; fromEmail: string; subject: string; message: string }
}

/**
 * Per-template context schemas — strict() rejects unknown fields,
 * preventing __proto__ pollution and unexpected template behaviour.
 *
 * actionUrl fields in verifyEmail/forgotPassword are additionally validated
 * against a host allowlist (defense-in-depth; these templates are not
 * exposed through the public route — they are reserved for server-side
 * auth-flow calls with freshly-minted tokens).
 */
const ALLOWED_HOST_SUFFIXES = [process.env.APP_DOMAIN ?? 'example.com']

const actionUrlSchema = z
  .string()
  .url()
  .max(2000)
  .refine(
    (url) => {
      try {
        const parsed = new URL(url)
        return (
          parsed.protocol === 'https:' &&
          ALLOWED_HOST_SUFFIXES.some(
            (suffix) => parsed.hostname === suffix || parsed.hostname.endsWith('.' + suffix),
          )
        )
      } catch {
        return false
      }
    },
    { message: 'URL must be https and match an allowed host' },
  )

const contextSchemas = {
  verifyEmail: z
    .object({
      username: z.string().max(200),
      actionUrl: actionUrlSchema,
    })
    .strict(),
  forgotPassword: z
    .object({
      username: z.string().max(200),
      actionUrl: actionUrlSchema,
    })
    .strict(),
  contactMessage: z
    .object({
      fromName: z.string().max(200),
      fromEmail: z.string().email().max(200),
      subject: z.string().max(500),
      message: z.string().max(10000),
    })
    .strict(),
} as const

const templateMap: Record<EmailTemplate, FunctionComponent<unknown>> = {
  verifyEmail: VerifyEmailTemplate as FunctionComponent<unknown>,
  forgotPassword: ForgotPasswordTemplate as FunctionComponent<unknown>,
  contactMessage: ContactMessageTemplate as FunctionComponent<unknown>,
}

// 动态 import：避免把 React Email（~200KB）打入客户端 bundle。
// 仅在 server function / worker 中按需加载。
export async function renderTemplate<K extends EmailTemplate>(
  params: SendTemplateParams & { template: K },
): Promise<{ subject: string; html: string }> {
  const validatedContext = contextSchemas[params.template].parse(params.context)
  const { render } = await import('@react-email/render')
  const Component = templateMap[params.template] as FunctionComponent<TemplateContext[K]>
  const html = await render(await Component(validatedContext as TemplateContext[K]))
  return {
    subject: subjects[params.template][params.locale],
    html,
  }
}
