import { Button } from '@react-email/components'

interface Props {
  href: string
  children: React.ReactNode
}

export function EmailButton({ href, children }: Props) {
  return (
    <Button
      href={href}
      style={{ background: '#0070f3', color: '#fff', padding: '12px 24px', borderRadius: 6 }}
    >
      {children}
    </Button>
  )
}
