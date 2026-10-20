import { Cta } from './cta'
import { Faq } from './faq'
import { Features } from './features'
import { Hero } from './hero'
import { NewsletterCta } from './newsletter-cta'
import { Roadmap } from './roadmap'
import { Stats } from './stats'
import { Testimonials } from './testimonials'

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

export type { CtaProps } from './cta'
export type { FaqItem, FaqProps } from './faq'
export type { FeatureItem, FeaturesProps } from './features'
export type { HeroProps } from './hero'
export type { NewsletterCtaProps } from './newsletter-cta'
export type { RoadmapItem, RoadmapProps, RoadmapStatus } from './roadmap'
export type { StatItem, StatsProps } from './stats'
export type { Testimonial, TestimonialsProps } from './testimonials'
export { Cta, Faq, Features, Hero, NewsletterCta, Roadmap, Stats, Testimonials }
