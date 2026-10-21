import type { CtaProps, HeroProps } from '@/components/sections'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 联系页的块内容。必须用 getter：`m.*()` 要在读取时求值，
 * 否则模块加载那一刻就把首次请求的语言固化下来（理由见 `home.ts`）。
 */
export const contactBlocks = {
  get Hero(): HeroProps {
    return {
      title: m.contact_hero_title(),
      subtitle: m.contact_hero_subtitle(),
      align: 'center',
    }
  },
  get Cta(): CtaProps {
    return {
      title: m.contact_cta_title(),
      variant: 'quiet',
      primaryCta: { label: m.contact_cta_primary(), href: '/docs' },
    }
  },
}
