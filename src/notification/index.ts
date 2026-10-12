// Env is a global interface declared in src/types/cloudflare.d.ts — no import needed
import { getServerContext } from '@/lib/server-context'
import { DiscordNotificationProvider } from './provider/discord'
import { FeishuNotificationProvider } from './provider/feishu'
import type { NotificationChannel, NotificationPayload, NotificationProvider } from './types'

type ProviderFactory = () => NotificationProvider

/**
 * 按当前请求 env 构建 notification provider 注册表。
 * 在 src/server.ts 的 als.run() 中调用，结果注入 ServerContext.notificationProviderRegistry。
 */
export function buildNotificationProviderRegistry(
  _env: Env,
): Partial<Record<NotificationChannel, ProviderFactory>> {
  return {
    discord: _env.DISCORD_WEBHOOK_URL
      ? () => new DiscordNotificationProvider(_env.DISCORD_WEBHOOK_URL ?? '')
      : undefined,
    feishu: _env.FEISHU_WEBHOOK_URL
      ? () => new FeishuNotificationProvider(_env.FEISHU_WEBHOOK_URL ?? '')
      : undefined,
  }
}

export async function notify(
  name: NotificationChannel,
  payload: NotificationPayload,
): Promise<boolean> {
  const { notificationProviderRegistry } = getServerContext()
  const factory = notificationProviderRegistry?.[name]
  if (!factory) {
    console.warn(`[notification] provider 未注册：${name}`)
    return false
  }
  try {
    const ok = await factory().send(payload)
    if (!ok) {
      console.warn(`[notification] ${name} 投递失败`)
    }
    return ok
  } catch (err) {
    console.warn(
      `[notification] ${name} 异常:`,
      err instanceof Error ? err.message.split('\n')[0] : String(err),
    )
    return false
  }
}

export { DiscordNotificationProvider } from './provider/discord'
export { FeishuNotificationProvider } from './provider/feishu'
export type { NotificationChannel, NotificationPayload, NotificationProvider }
