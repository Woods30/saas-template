import type { NotificationPayload, NotificationProvider } from '../types'

/** 单次 webhook 请求的超时。挂住的 webhook 会拖住整个请求，必须设上限。 */
const REQUEST_TIMEOUT_MS = 5_000

/**
 * 飞书自定义机器人 webhook。
 *
 * URL 由 env 层校验（必须以 `https://open.feishu.cn/open-apis/bot/v2/hook/` 开头）。
 *
 * **必须解析响应体里的 `code`**：飞书在签名 / 关键词 / IP 白名单校验失败时返回
 * **HTTP 200** + `{ code: 19021, msg: ... }`。只看 `res.ok` 会把失败当成功，
 * `notify()` 也就不会告警——运营以为通知正常，实际一条都没发出去。
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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) return false

      // 飞书的业务错误藏在 200 响应体里：`code` 为 0 或缺失才算成功。
      const body = (await res.json().catch(() => null)) as { code?: number; msg?: string } | null
      if (body && typeof body.code === 'number' && body.code !== 0) {
        console.warn(`[notification] feishu 业务错误 code=${body.code} msg=${body.msg ?? ''}`)
        return false
      }
      return true
    } catch {
      return false
    }
  }
}
