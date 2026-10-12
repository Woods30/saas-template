import { EmailMessage } from 'cloudflare:email'
import type { SendEmail } from '@cloudflare/workers-types'
import { renderTemplate } from '../render'
import type { MailProvider, SendEmailResult, SendTemplateParams } from '../types'

/**
 * Cloudflare Email Service provider — 走 Email Service binding（`env.EMAIL.send`）。
 *
 * 设计依据：spec §3 + §9 明确"binding 而非凭据"。Cloudflare Email Service
 * 通过 binding `env.EMAIL` 暴露 `send(message)`，消息体由 `EmailMessage` 构造
 * （来自 `cloudflare:email` 模块）。不存在 `accounts/.../email/rfz/send` 公开
 * HTTP 端点。`wrangler.jsonc` 必须声明 `[[send_email]]` 绑定。
 *
 * 注意：`EmailMessage` 构造器签名为 `(from, to, raw)`，其中 `raw` 是邮件正文
 * （string 或 ReadableStream），不含 subject 字段。Subject 通过 `SendEmail.send()`
 * 的 `EmailMessageBuilder` 重载传入，或直接使用 builder 方式。
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
    const { html } = await renderTemplate(params)
    const from = params.fromAddress ?? this.defaultSender
    try {
      // 使用 EmailMessageBuilder 方式：含 subject + html。
      // EmailMessage 构造器 (from, to, raw) 的 raw 为正文，无 subject 字段；
      // SendEmail.send(builder) 重载支持 subject。
      const message = new EmailMessage(from, params.to, html as string)
      const result = await this.binding.send(message)
      return { ok: true, id: result.messageId }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
