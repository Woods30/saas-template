import type { FunctionComponent } from 'react'
import { z } from 'zod'
import type { Locale } from '@/config/locale'
import { getBaseUrl } from '@/lib/urls'
import ContactMessageTemplate from './templates/contact-message'
import ForgotPasswordTemplate from './templates/forgot-password'
import VerifyEmailTemplate from './templates/verify-email'
import WelcomeTemplate from './templates/welcome'
import type { EmailTemplate, SendTemplateParams } from './types'

/**
 * 邮件主题，按模板 × 语言。
 *
 * 键类型是 `Record<Locale, string>` 而非 `Record<'zh' | 'en', string>`：
 * 新增语言时会**编译报错**，迫使补齐译文，而不是让收件人收到空白主题。
 */
const subjects: Record<EmailTemplate, Record<Locale, string>> = {
  verifyEmail: { zh: '验证你的邮箱', en: 'Verify your email' },
  forgotPassword: { zh: '重置密码', en: 'Reset your password' },
  contactMessage: { zh: '新的联系消息', en: 'New contact message' },
  welcome: { zh: '欢迎加入', en: 'Welcome aboard' },
}

type TemplateContext = {
  verifyEmail: { username: string; actionUrl: string }
  forgotPassword: { username: string; actionUrl: string }
  contactMessage: { fromName: string; fromEmail: string; subject: string; message: string }
  welcome: { username: string }
}

/**
 * `actionUrl` 允许的主机后缀：站点自身主机及其子域。
 *
 * 主机取自 `VITE_BASE_URL` 而非独立域名配置，避免两处漂移。**按调用求值**，
 * 不要在模块加载期固化，否则会缓存住首次请求的配置。
 */
export function allowedHostSuffixes(baseUrl: string = getBaseUrl()): string[] {
  try {
    return [new URL(baseUrl).hostname]
  } catch {
    return []
  }
}

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
          allowedHostSuffixes().some(
            (suffix) => parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`),
          )
        )
      } catch {
        return false
      }
    },
    { message: 'URL must be https and match an allowed host' },
  )

// strict() 拒绝未知字段，防止 __proto__ 污染与意外的模板行为。
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
  welcome: z
    .object({
      username: z.string().max(200),
    })
    .strict(),
} as const

const templateMap: Record<EmailTemplate, FunctionComponent<unknown>> = {
  verifyEmail: VerifyEmailTemplate as FunctionComponent<unknown>,
  forgotPassword: ForgotPasswordTemplate as FunctionComponent<unknown>,
  contactMessage: ContactMessageTemplate as FunctionComponent<unknown>,
  welcome: WelcomeTemplate as FunctionComponent<unknown>,
}

// 动态 import：避免把 React Email（~200KB）打入客户端 bundle。
// 仅在 server function / worker 中按需加载。
export async function renderTemplate<K extends EmailTemplate>(
  params: SendTemplateParams & { template: K },
): Promise<{ subject: string; html: string }> {
  const validatedContext = contextSchemas[params.template].parse(params.context)
  const { render } = await import('@react-email/render')
  const Component = templateMap[params.template] as FunctionComponent<TemplateContext[K]>
  // `locale` 必须随 context 一起交给模板，否则只有主题按语言取值、正文仍写死。
  // 模板各自决定是否使用它（联系表单的收件人是站长，语言固定，忽略即可）。
  const html = await render(
    await Component({ ...(validatedContext as TemplateContext[K]), locale: params.locale }),
  )
  return {
    subject: subjects[params.template][params.locale],
    html,
  }
}
