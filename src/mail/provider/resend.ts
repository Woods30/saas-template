import { Resend } from 'resend'
import { renderTemplate } from '../render'
import type { MailProvider, SendEmailResult, SendTemplateParams } from '../types'

export class ResendMailProvider implements MailProvider {
  private readonly client: Resend

  constructor(
    apiKey: string,
    private readonly sender: string,
  ) {
    this.client = new Resend(apiKey)
  }

  getProviderName() {
    return 'resend'
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendEmailResult> {
    const { subject, html } = await renderTemplate(params)
    const { data, error } = await this.client.emails.send({
      from: params.fromAddress ?? this.sender,
      to: params.to,
      subject,
      html,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data?.id }
  }
}
