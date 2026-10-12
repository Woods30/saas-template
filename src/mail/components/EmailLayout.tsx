import { Body, Container, Heading, Html } from '@react-email/components'

interface Props {
  preview: string
  children: React.ReactNode
}

export function EmailLayout({ preview, children }: Props) {
  return (
    <Html>
      <Body style={{ fontFamily: 'sans-serif', background: '#f4f4f5', padding: 24 }}>
        <Container style={{ background: '#ffffff', padding: 24, borderRadius: 8 }}>
          <Heading as="h2" style={{ marginTop: 0 }}>
            {preview}
          </Heading>
          {children}
        </Container>
      </Body>
    </Html>
  )
}
