import { EMAIL_THEME, EmailLayout } from '../components/EmailLayout'

interface Props {
  fromName: string
  fromEmail: string
  subject: string
  message: string
}

export default function ContactMessage({ fromName, fromEmail, subject, message }: Props) {
  return (
    <EmailLayout preview="新的联系表单消息">
      <p>
        <strong>{fromName}</strong>（{fromEmail}）提交了消息：
      </p>
      <p>
        <em>{subject}</em>
      </p>
      <blockquote
        style={{
          borderLeft: `3px solid ${EMAIL_THEME.border}`,
          paddingLeft: 12,
          color: EMAIL_THEME.mutedForeground,
          margin: '16px 0',
        }}
      >
        {message}
      </blockquote>
    </EmailLayout>
  )
}
