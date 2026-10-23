import { Cta } from './Cta'
import { Faq } from './Faq'
import { Features } from './Features'
import { Hero } from './Hero'
import { NewsletterCta } from './NewsletterCta'
import { Pricing } from './Pricing'
import { Roadmap } from './Roadmap'
import { Stats } from './Stats'
import { Testimonials } from './Testimonials'

/**
 * 通用区块注册表，恰好 8 个键、不含 `Pricing`（定价需接 `renderCta` 与周期切换）。
 * `tests/unit/blocks.test.ts` 钉死了这一点。
 */
export const blocks = {
  Hero,
  Features,
  Stats,
  Faq,
  Testimonials,
  NewsletterCta,
  Roadmap,
  Cta,
} as const

export type BlockName = keyof typeof blocks

export type { CtaProps } from './Cta'
export type { FaqItem, FaqProps } from './Faq'
export type { FeatureItem, FeaturesProps } from './Features'
export type { HeroProps } from './Hero'
export type { NewsletterCtaProps } from './NewsletterCta'
export type { PricingProduct, PricingProps, ProductPrice } from './Pricing'
export type { RoadmapItem, RoadmapProps, RoadmapStatus } from './Roadmap'
export type { StatItem, StatsProps } from './Stats'
export type { Testimonial, TestimonialsProps } from './Testimonials'
export { Cta, Faq, Features, Hero, NewsletterCta, Pricing, Roadmap, Stats, Testimonials }
