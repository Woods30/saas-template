import { EmailButton } from '../components/EmailButton'
import { EmailLayout } from '../components/EmailLayout'

interface Props {
  username: string
  actionUrl: string
}

export default function VerifyEmail({ username, actionUrl }: Props) {
  return (
    <EmailLayout preview="验证邮箱">
      <p>你好，{username}。</p>
      <p>请点击下方按钮完成注册：</p>
      <EmailButton href={actionUrl}>验证邮箱</EmailButton>
    </EmailLayout>
  )
}
