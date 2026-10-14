export interface CtaProps {
  title: string
  variant?: 'default' | 'quiet'
  description?: string
  primaryCta: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
}
