import type { CtaProps, FaqProps, HeroProps } from '@/components/blocks/marketing'
import type { NewsletterCtaProps } from '@/components/blocks/marketing/newsletter-cta'
import { m } from '@/locale/paraglide/messages.js'

/** getter 模式理由同 `home.ts`：`m.*()` 必须在读取时求值，否则固化首次请求语言。 */
export const waitlistBlocks = {
  get Hero(): HeroProps {
    return {
      title: m.waitlist_hero_title(),
      subtitle: m.waitlist_hero_subtitle(),
      align: 'center',
    }
  },
  get Newsletter(): NewsletterCtaProps {
    return {
      title: m.waitlist_hero_title(),
      description: m.waitlist_hero_subtitle(),
      successMessage: m.newsletter_success(),
    }
  },
  get Faq(): FaqProps {
    return {
      title: m.waitlist_hero_title(),
      items: [
        { question: m.waitlist_faq_q1(), answer: m.waitlist_faq_a1() },
        { question: m.waitlist_faq_q2(), answer: m.waitlist_faq_a2() },
      ],
    }
  },
  get Cta(): CtaProps {
    return {
      title: m.waitlist_cta_title(),
      variant: 'quiet',
      primaryCta: { label: m.waitlist_cta_primary(), href: '/marketing/contact' },
    }
  },
}
