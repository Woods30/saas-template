import type { NotificationPayload, NotificationProvider } from '../types'

/** 单次 webhook 请求的超时。挂住的 webhook 会拖住整个请求，必须设上限。 */
const REQUEST_TIMEOUT_MS = 5_000

/**
 * Discord channel webhook。
 *
 * URL 由 env 层校验（必须以 `https://discord.com/api/webhooks/` 开头）。
 *
 * 只判断 `res.ok`：Discord 的错误确实体现在 HTTP 状态上（429 限流、401 失效、
 * 400 格式错误），响应体里没有「200 但业务失败」这种形态，因此不需要解析 body。
 * 429 不在这里重试——重试语义属于调用方，provider 只如实返回 `false`。
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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      return res.ok
    } catch {
      return false
    }
  }
}
