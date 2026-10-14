import type { Locale } from '@/config/locale'

export type EmailTemplate = 'verifyEmail' | 'forgotPassword' | 'contactMessage' | 'welcome'

export interface SendTemplateParams {
  to: string
  template: EmailTemplate
  locale: Locale
  context: Record<string, unknown>
  fromAddress?: string
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
}

export interface MailProvider {
  getProviderName(): string
  sendTemplate(params: SendTemplateParams): Promise<SendEmailResult>
}
