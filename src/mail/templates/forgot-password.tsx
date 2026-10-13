import { EmailButton } from '../components/EmailButton'
import { EmailLayout } from '../components/EmailLayout'

interface Props {
  username: string
  actionUrl: string
}

export default function ForgotPassword({ username, actionUrl }: Props) {
  return (
    <EmailLayout preview="重置密码">
      <p>你好，{username}。</p>
      <p>如需重置密码，请点击下方按钮（1 小时内有效）：</p>
      <EmailButton href={actionUrl}>重置密码</EmailButton>
    </EmailLayout>
  )
}
