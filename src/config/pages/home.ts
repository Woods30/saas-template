import {
  IconCloud,
  IconCreditCard,
  IconDatabase,
  IconLanguage,
  IconMail,
  IconShieldLock,
} from '@tabler/icons-react'
import { createElement } from 'react'
import type { CtaProps, FaqProps, FeaturesProps, HeroProps } from '@/components/sections'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

/**
 * docs CTA 目标：模块启用时指向当前语言的文档入口，关闭时回退首页 `#features`。
 * 语言在调用时求值，不固化首次请求的 locale。
 */
function docsCtaHref(): string {
  return websiteConfig.docs.enabled ? `/${getLocale()}/docs` : '#features'
}

// getter：消息在读取配置时求值，避免模块缓存固化第一次请求的语言。
export const homeBlocks = {
  get Hero() {
    return {
      title: m.home_hero_title(),
      titleLang: 'en',
      titleEmphasis: m.home_hero_title_emphasis(),
      eyebrow: m.home_hero_eyebrow(),
      description: m.home_hero_description(),
      note: m.home_hero_note(),
      primaryCta: { label: m.home_hero_primary_cta(), href: docsCtaHref() },
      secondaryCta: { label: m.home_hero_secondary_cta(), href: '#features' },
      variant: 'split',
    } satisfies HeroProps
  },
  get Features() {
    return {
      eyebrow: m.home_features_eyebrow(),
      title: m.home_features_title(),
      subtitle: m.home_features_subtitle(),
      variant: 'bento',
      items: [
        {
          icon: createElement(IconShieldLock, { size: 22 }),
          title: m.home_features_auth_title(),
          description: m.home_features_auth_description(),
          detail: m.home_features_auth_detail(),
          wide: true,
        },
        {
          icon: createElement(IconCreditCard, { size: 22 }),
          title: m.home_features_payment_title(),
          description: m.home_features_payment_description(),
          detail: m.home_features_payment_detail(),
          wide: true,
        },
        {
          icon: createElement(IconCloud, { size: 22 }),
          title: m.home_features_edge_title(),
          description: m.home_features_edge_description(),
          detail: m.home_features_edge_detail(),
        },
        {
          icon: createElement(IconDatabase, { size: 22 }),
          title: m.home_features_storage_title(),
          description: m.home_features_storage_description(),
          detail: m.home_features_storage_detail(),
        },
        {
          icon: createElement(IconMail, { size: 22 }),
          title: m.home_features_email_title(),
          description: m.home_features_email_description(),
          detail: m.home_features_email_detail(),
        },
        {
          icon: createElement(IconLanguage, { size: 22 }),
          title: m.home_features_i18n_title(),
          description: m.home_features_i18n_description(),
          detail: m.home_features_i18n_detail(),
        },
      ],
    } satisfies FeaturesProps
  },
  get Faq() {
    return {
      eyebrow: m.home_faq_eyebrow(),
      title: m.home_faq_title(),
      variant: 'split',
      items: [
        { question: m.home_faq_q1(), answer: m.home_faq_a1() },
        { question: m.home_faq_q2(), answer: m.home_faq_a2() },
        { question: m.home_faq_q3(), answer: m.home_faq_a3() },
        { question: m.home_faq_q4(), answer: m.home_faq_a4() },
        { question: m.home_faq_q5(), answer: m.home_faq_a5() },
      ],
    } satisfies FaqProps
  },
  get Cta() {
    return {
      title: m.home_cta_title(),
      description: m.home_cta_description(),
      primaryCta: { label: m.home_cta_primary(), href: docsCtaHref() },
      variant: 'quiet',
    } satisfies CtaProps
  },
}
