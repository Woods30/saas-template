import type { Locale } from '@/config/locale'
import { EmailLayout } from '../components/EmailLayout'

interface Props {
  username: string
  locale: Locale
}

/** 邮箱验证通过后的欢迎邮件。正文按收件人语言渲染（主题由 `render.ts` 决定）。 */
export default function Welcome({ username, locale }: Props) {
  const copy =
    locale === 'zh'
      ? {
          preview: '欢迎加入',
          greeting: `你好，${username}。`,
          body: '你的邮箱已验证，账号已就绪。',
        }
      : {
          preview: 'Welcome aboard',
          greeting: `Hi ${username},`,
          body: 'Your email is verified and your account is ready to go.',
        }

  return (
    <EmailLayout preview={copy.preview}>
      <p>{copy.greeting}</p>
      <p>{copy.body}</p>
    </EmailLayout>
  )
}
