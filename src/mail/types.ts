export type EmailTemplate = 'verifyEmail' | 'forgotPassword' | 'contactMessage'

export interface SendTemplateParams {
  to: string
  template: EmailTemplate
  locale: 'zh' | 'en'
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
