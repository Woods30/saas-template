import { websiteConfig } from '@/config/website'
import { sendMail } from '@/mail'
import { notify } from '@/notification'

export interface ContactInput {
  name: string
  fromEmail: string
  subject: string
  message: string
}

export async function deliverContactNotification(input: ContactInput): Promise<void> {
  const supportEmail = websiteConfig.mail?.supportEmail ?? 'support@example.com'

  // 1. 邮件通知（核心通道；失败要记 log）
  const mailResult = await sendMail('cloudflare', {
    to: supportEmail,
    template: 'contactMessage',
    locale: 'zh',
    context: {
      fromName: input.name,
      fromEmail: input.fromEmail,
      subject: input.subject,
      message: input.message,
    },
  })
  if (!mailResult.ok) {
    console.warn(`[contact] 邮件通知失败: ${mailResult.error?.split('\n')[0] ?? 'unknown'}`)
  }

  // 2. Discord 通知（仅当 enable；失败不阻塞）
  // Discord embed title limited to 200 chars, description to 1000 chars.
  if (websiteConfig.notification?.enable) {
    const truncatedSubject =
      input.subject.length > 200 ? `${input.subject.slice(0, 197)}...` : input.subject
    const truncatedMessage =
      input.message.length > 1000 ? `${input.message.slice(0, 997)}...` : input.message
    const ok = await notify('discord', {
      title: `新的联系消息：${truncatedSubject}`,
      message: truncatedMessage,
      meta: { from: `${input.name} <${input.fromEmail}>` },
    })
    if (!ok) {
      console.warn('[contact] Discord 通知失败')
    }
  }
}
