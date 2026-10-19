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
 * 返回值而不是「失败就抛」：调用方（`/api/contact`）需要区分「消息已送达」与
 * 「消息丢了」——前者回 200，后者必须回 503 并让访客知道没发成功。旧实现两类
 * 情况都返回成功，访客看到的提交成功提示其实是假的。
 *
 * 内部通道**互不阻塞**：邮件失败不阻止 webhook 通知，反之亦然。任一线成功即视为
 * 已送达——两条通道互为备份，全失败才报告失败。
 */
export async function deliverContactNotification(
  input: ContactInput,
): Promise<ContactDeliveryResult> {
  // 收件人与发件 provider 均取自站点配置，与 mail registry 使用同一归一化来源。
  const supportEmail = websiteConfig.mail.supportEmail

  // 1. 邮件通知（核心通道）
  //
  // `sendMail` 对**注册表未注册、模板渲染校验失败**这类内部错误会直接抛异常
  // （只对 provider 返回的 `{ ok: false }` 做重试）。这里必须接住：否则异常一路冒到
  // route handler，访客拿到 500 而不是「发送失败」。
  let mailSent = false
  try {
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
    mailSent = mailResult.ok
    if (!mailResult.ok) {
      console.warn(`[contact] 邮件通知失败: ${mailResult.error?.split('\n')[0] ?? 'unknown'}`)
    }
  } catch (err) {
    console.warn(
      `[contact] 邮件通知异常: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
    )
  }

  // 2. Webhook 通知（按 notification.provider；仅当 enabled；失败不阻塞）
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
