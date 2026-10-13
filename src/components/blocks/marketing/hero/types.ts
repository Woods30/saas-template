export interface HeroProps {
  title: string
  subtitle?: string
  description?: string
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  image?: { src: string; alt: string }
  align?: 'left' | 'center'
}
