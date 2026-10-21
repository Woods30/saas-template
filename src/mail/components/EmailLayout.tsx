import { Body, Container, Heading, Html } from '@react-email/components'

/**
 * 邮件配色：站点主题 token 的**静态快照**（取自 `globals.css` 浅色档）。
 *
 * 邮件客户端不执行站点 CSS，`var(--primary)` 读不到，颜色只能写字面量。
 * 改主题时这些值要一起改，`tests/unit/mail-theme.test.ts` 会校验漂移。
 */
export const EMAIL_THEME = {
  /** `--background` */
  background: '#FCFAFF',
  /** `--foreground` */
  foreground: '#121217',
  /** `--card` */
  card: '#FFFFFF',
  /** `--muted-foreground` */
  mutedForeground: '#5E5E6E',
  /** `--border` */
  border: '#E6E6F0',
  /** `--primary` */
  primary: '#6B46FF',
  /** `--primary-foreground` */
  primaryForeground: '#FFFFFF',
} as const

interface Props {
  preview: string
  children: React.ReactNode
}

export function EmailLayout({ preview, children }: Props) {
  return (
    <Html>
      <Body
        style={{
          // 与站点同一套字体栈：拉丁字母用主题字体，中日韩字形交给系统。
          fontFamily:
            "'Inter', -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
          background: EMAIL_THEME.background,
          color: EMAIL_THEME.foreground,
          padding: 24,
        }}
      >
        <Container
          style={{
            background: EMAIL_THEME.card,
            padding: 24,
            borderRadius: 12,
            border: `1px solid ${EMAIL_THEME.border}`,
          }}
        >
          <Heading as="h2" style={{ marginTop: 0 }}>
            {preview}
          </Heading>
          {children}
        </Container>
      </Body>
    </Html>
  )
}
