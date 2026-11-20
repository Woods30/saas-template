export type NotificationChannel = 'discord' | 'feishu'

export interface NotificationPayload {
  title: string
  message: string
  meta?: Record<string, string>
}

export interface NotificationProvider {
  getProviderName(): string
  send(payload: NotificationPayload): Promise<boolean>
}
