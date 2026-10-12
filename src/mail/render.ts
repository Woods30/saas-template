import type { FunctionComponent } from 'react'
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
  const { render } = await import('@react-email/render')
  const Component = templateMap[params.template] as FunctionComponent<TemplateContext[K]>
  const html = await render(await Component(params.context as TemplateContext[K]))
  return {
    subject: subjects[params.template][params.locale],
    html,
  }
}
