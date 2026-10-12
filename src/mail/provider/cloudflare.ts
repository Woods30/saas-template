import type { SendEmail } from '@cloudflare/workers-types'
import { renderTemplate } from '../render'
import type { MailProvider, SendEmailResult, SendTemplateParams } from '../types'

/**
 * Cloudflare Email Service provider — 走 Email Service binding（`env.EMAIL.send`）。
 *
 * 设计依据：spec §3 + §9 明确"binding 而非凭据"。Cloudflare Email Service
 * 通过 binding `env.EMAIL` 暴露 `send(message)`。`wrangler.jsonc` 必须声明
 * `[[send_email]]` 绑定。
 *
 * 注意：`SendEmail.send()` 有两个重载：
 *   - `send(message: EmailMessage)` — 构造器 (from, to, raw) 仅为正文，无 subject
 *   - `send(builder: EmailMessageBuilder)` — 支持 from/subject/html 等字段
 * 本实现使用后者以正确传递 subject。
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
      // EmailMessageBuilder: plain object with from/subject/html/to.
      // EmailMessageBuilder = EmailReplyMessageBuilder & EmailDestinations
      // (workers-types/index.d.ts line 15231)
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
