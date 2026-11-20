import { Button } from '@react-email/components'
import { EMAIL_THEME } from './EmailLayout'

interface Props {
  href: string
  children: React.ReactNode
}

export function EmailButton({ href, children }: Props) {
  return (
    <Button
      href={href}
      style={{
        // 与站点主按钮一致：`bg-primary text-primary-foreground`。
        background: EMAIL_THEME.primary,
        color: EMAIL_THEME.primaryForeground,
        padding: '12px 24px',
        borderRadius: 8,
        fontWeight: 600,
        textDecoration: 'none',
        display: 'inline-block',
      }}
    >
      {children}
    </Button>
  )
}
