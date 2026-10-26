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

export interface ContactDeliveryResult {
  /** 至少一条通道投递成功（邮件或 webhook）。 */
  delivered: boolean
}

/**
 * 联系消息的投递。
 *
 * 返回值而不是「失败就抛」：调用方要区分「已送达」与「消息丢了」——后者必须回 503，
 * 不能给访客假的成功提示。
 *
 * 两条通道**互不阻塞**、互为备份：任一成功即视为已送达，全失败才报告失败。
 */
export async function deliverContactNotification(
  input: ContactInput,
): Promise<ContactDeliveryResult> {
  const supportEmail = websiteConfig.mail.supportEmail

  // `sendMail` 对注册表未注册、模板渲染校验失败这类内部错误会直接抛异常，
  // 这里必须接住，否则访客拿到 500 而不是「发送失败」。
  let mailSent = false
  try {
    const mailResult = await sendMail(websiteConfig.mail.provider, {
      to: supportEmail,
      template: 'contactMessage',
      // 收件人是站长，语言固定为默认语言，不随访客语言变化。
      locale: defaultLocale,
      context: {
        fromName: input.name,
        fromEmail: input.fromEmail,
        subject: input.subject,
        message: input.message,
      },
    })
    mailSent = mailResult.ok
    if (!mailResult.ok) {
      console.warn(`[contact] 邮件通知失败: ${mailResult.error?.split('\n')[0] ?? 'unknown'}`)
    }
  } catch (err) {
    console.warn(
      `[contact] 邮件通知异常: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
    )
  }

  let notificationSent = false
  if (websiteConfig.notification.enabled) {
    // Discord embed 的标题上限 200、正文上限 1000；超长内容截断，不改 provider 层。
    const truncatedSubject =
      input.subject.length > 200 ? `${input.subject.slice(0, 197)}...` : input.subject
    const truncatedMessage =
      input.message.length > 1000 ? `${input.message.slice(0, 997)}...` : input.message
    // `notify()` 自身吞掉 provider 异常并返回 false，这里不会再抛。
    notificationSent = await notify(websiteConfig.notification.provider, {
      title: `新的联系消息：${truncatedSubject}`,
      message: truncatedMessage,
      meta: { from: `${input.name} <${input.fromEmail}>` },
    })
  }

  return { delivered: mailSent || notificationSent }
}
