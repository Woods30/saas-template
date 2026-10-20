import type { CtaProps, HeroProps } from '@/components/blocks/marketing'
import type { RoadmapProps } from '@/components/blocks/marketing/roadmap'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 路线图页的块内容。
 *
 * getter 的理由同 `home.ts`：`m.*()` 必须在读取时求值，否则首次请求的语言会被模块
 * 缓存固化，SSR 下所有后续请求都显示同一种语言。
 */
export const roadmapBlocks = {
  get Hero(): HeroProps {
    return {
      title: m.roadmap_hero_title(),
      subtitle: m.roadmap_hero_subtitle(),
      align: 'center',
    }
  },
  get Roadmap(): RoadmapProps {
    return {
      title: m.roadmap_hero_title(),
      items: [
        {
          status: 'done',
          title: m.feature_auth_title(),
          description: m.feature_auth_description(),
        },
        {
          status: 'done',
          title: m.feature_payment_title(),
          description: m.feature_payment_description(),
        },
        {
          status: 'active',
          title: m.feature_notification_title(),
          description: m.feature_notification_description(),
        },
        {
          status: 'planned',
          title: m.feature_storage_title(),
          description: m.feature_storage_description(),
        },
      ],
    }
  },
  get Cta(): CtaProps {
    return {
      title: m.roadmap_cta_title(),
      variant: 'quiet',
      primaryCta: { label: m.roadmap_cta_primary(), href: '/docs' },
    }
  },
}
