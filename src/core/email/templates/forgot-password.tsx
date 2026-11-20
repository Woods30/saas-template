import type { Locale } from '@/config/locale'
import { EmailButton } from '../components/EmailButton'
import { EmailLayout } from '../components/EmailLayout'

interface Props {
  username: string
  actionUrl: string
  locale: Locale
}

export default function ForgotPassword({ username, actionUrl, locale }: Props) {
  const copy =
    locale === 'zh'
      ? {
          preview: '重置密码',
          greeting: `你好，${username}。`,
          body: '如需重置密码，请点击下方按钮（1 小时内有效）：',
          button: '重置密码',
        }
      : {
          preview: 'Reset your password',
          greeting: `Hi ${username},`,
          body: 'To reset your password, click the button below (valid for 1 hour):',
          button: 'Reset password',
        }

  return (
    <EmailLayout preview={copy.preview}>
      <p>{copy.greeting}</p>
      <p>{copy.body}</p>
      <EmailButton href={actionUrl}>{copy.button}</EmailButton>
    </EmailLayout>
  )
}
