import type { NotificationPayload, NotificationProvider } from '../types'

/**
 * Discord webhook provider — POSTs to a Discord channel webhook.
 * Webhook URL is validated at env layer (must start with https://discord.com/api/webhooks/).
 */
export class DiscordNotificationProvider implements NotificationProvider {
  constructor(private readonly webhookUrl: string) {}

  getProviderName() {
    return 'discord'
  }

  async send({ title, message, meta }: NotificationPayload): Promise<boolean> {
    try {
      const fields = Object.entries(meta ?? {}).map(([name, value]) => ({ name, value }))
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{ title, description: message, fields }],
        }),
      })
      return res.ok
    } catch {
      return false
    }
  }
}
