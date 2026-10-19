import { Body, Container, Heading, Html } from '@react-email/components'

/**
 * 邮件配色：站点主题 token 的**静态快照**。
 *
 * 邮件客户端不执行站点的 CSS，`var(--primary)` / `light-dark()` 都读不到，颜色只能
 * 写成字面量。这里的值取自 `src/styles/globals.css` 的**浅色档**——邮件没有主题
 * 切换，深色客户端会自行反色，按浅色设计是通行做法。
 *
 * 改站点主题时这几个值要一起改：它们与 `--background` / `--foreground` / `--card` /
 * `--primary` 一一对应，`tests/unit/mail-theme.test.ts` 会校验漂移。
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
