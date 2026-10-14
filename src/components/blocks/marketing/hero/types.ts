import type { ReactNode } from 'react'

export interface HeroProps {
  title: string
  titleLang?: string
  titleEmphasis?: string
  eyebrow?: string
  subtitle?: string
  description?: string
  note?: string
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  visual?: ReactNode
  variant?: 'default' | 'split'
  image?: { src: string; alt: string }
  /** 覆盖图片默认样式，用于品牌吉祥物等无边框场景。 */
  imageClassName?: string
  align?: 'left' | 'center'
}
