import type { Locale } from '@/config/locale'
import { EmailButton } from '../components/EmailButton'
import { EmailLayout } from '../components/EmailLayout'

interface Props {
  username: string
  actionUrl: string
  locale: Locale
}

export default function VerifyEmail({ username, actionUrl, locale }: Props) {
  const copy =
    locale === 'zh'
      ? {
          preview: '验证邮箱',
          greeting: `你好，${username}。`,
          body: '请点击下方按钮完成注册：',
          button: '验证邮箱',
        }
      : {
          preview: 'Verify your email',
          greeting: `Hi ${username},`,
          body: 'Click the button below to finish creating your account:',
          button: 'Verify email',
        }

  return (
    <EmailLayout preview={copy.preview}>
      <p>{copy.greeting}</p>
      <p>{copy.body}</p>
      <EmailButton href={actionUrl}>{copy.button}</EmailButton>
    </EmailLayout>
  )
}
