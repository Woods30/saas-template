import type { CtaProps, HeroProps } from '@/components/blocks/marketing'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 联系页的块内容。
 *
 * 用 getter 而非普通对象字面量：`m.*()` 在**读取时**才求值，否则模块加载那一刻就把
 * 首次请求的语言固化下来，SSR 下后续所有请求都会拿到同一种语言。`homeBlocks` 与
 * `pricingBlocks` 同一模式，理由见 `home.ts` 的注释。
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
