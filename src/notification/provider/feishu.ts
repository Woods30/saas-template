import type { NotificationPayload, NotificationProvider } from '../types'

/**
 * 飞书 webhook provider — POSTs to a Feishu bot incoming webhook.
 * Webhook URL is validated at env layer (must start with https://open.feishu.cn/open-apis/bot/v2/hook/).
 */
export class FeishuNotificationProvider implements NotificationProvider {
  constructor(private readonly webhookUrl: string) {}

  getProviderName() {
    return 'feishu'
  }

  async send({ title, message, meta }: NotificationPayload): Promise<boolean> {
    try {
      const text = [
        `**${title}**`,
        message,
        ...Object.entries(meta ?? {}).map(([k, v]) => `${k}: ${v}`),
      ].join('\n')
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'interactive',
          card: { elements: [{ tag: 'markdown', content: text }] },
        }),
      })
      return res.ok
    } catch {
      return false
    }
  }
}
