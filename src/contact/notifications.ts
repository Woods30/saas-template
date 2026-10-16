import { defaultLocale } from '@/config/locale'
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
  // 收件人与发件 provider 均取自站点配置，与 mail registry 使用同一归一化来源。
  const supportEmail = websiteConfig.mail.supportEmail

  // 1. 邮件通知（核心通道；失败要记 log）
  const mailResult = await sendMail(websiteConfig.mail.provider, {
    to: supportEmail,
    template: 'contactMessage',
    // 收件人是站长（站点配置里的 supportEmail），语言固定为默认语言，不随访客语言变化。
    locale: defaultLocale,
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

  // 2. Webhook 通知（按 notification.provider；仅当 enabled；失败不阻塞）
  // Discord embed title limited to 200 chars, description to 1000 chars.
  if (websiteConfig.notification.enabled) {
    const truncatedSubject =
      input.subject.length > 200 ? `${input.subject.slice(0, 197)}...` : input.subject
    const truncatedMessage =
      input.message.length > 1000 ? `${input.message.slice(0, 997)}...` : input.message
    const ok = await notify(websiteConfig.notification.provider, {
      title: `新的联系消息：${truncatedSubject}`,
      message: truncatedMessage,
      meta: { from: `${input.name} <${input.fromEmail}>` },
    })
    if (!ok) {
      console.warn('[contact] 通知失败')
    }
  }
}
