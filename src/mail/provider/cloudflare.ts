import type { SendEmail } from '@cloudflare/workers-types'
import { renderTemplate } from '../render'
import type { MailProvider, SendEmailResult, SendTemplateParams } from '../types'

/**
 * Cloudflare Email Service provider — 走 binding（`env.EMAIL.send`），
 * `wrangler.jsonc` 必须声明 `[[send_email]]` 绑定。
 *
 * `send()` 有两个重载：传 `EmailMessage` 构造器时没有 subject，必须传
 * `EmailMessageBuilder` 对象才能带上 from/subject/html。
 */
export class CloudflareEmailProvider implements MailProvider {
  constructor(
    private readonly binding: SendEmail,
    private readonly defaultSender: string,
  ) {}

  getProviderName() {
    return 'cloudflare'
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendEmailResult> {
    const { html, subject } = await renderTemplate(params)
    const from = params.fromAddress ?? this.defaultSender
    try {
      const message = {
        from,
        to: params.to,
        subject,
        html,
      }
      const result = await this.binding.send(message)
      return { ok: true, id: result.messageId }
    } catch (err) {
      // Redact sensitive fields before logging — never expose html, to, subject, context.
      const safeError = err instanceof Error ? err.message.split('\n')[0] : String(err)
      return { ok: false, error: safeError }
    }
  }
}
