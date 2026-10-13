export interface HeroProps {
  title: string
  subtitle?: string
  description?: string
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  image?: { src: string; alt: string }
  /** 覆盖图片默认样式（默认 `mt-10 rounded-lg border shadow-sm`）；用于品牌吉祥物等无边框场景。 */
  imageClassName?: string
  align?: 'left' | 'center'
}
