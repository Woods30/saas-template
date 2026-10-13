import { Cta } from './cta'
import { Faq } from './faq'
import { Features } from './features'
import { Hero } from './hero'
import { NewsletterCta } from './newsletter-cta'
import { Stats } from './stats'
import { Testimonials } from './testimonials'

export const blocks = {
  Hero,
  Features,
  Stats,
  Faq,
  Testimonials,
  NewsletterCta,
  Cta,
} as const

export type BlockName = keyof typeof blocks

export { Cta, Faq, Features, Hero, NewsletterCta, Stats, Testimonials }

export type { HeroProps } from './hero'
export type { FeaturesProps, FeatureItem } from './features'
export type { StatsProps, StatItem } from './stats'
export type { FaqProps, FaqItem } from './faq'
export type { TestimonialsProps, Testimonial } from './testimonials'
export type { NewsletterCtaProps } from './newsletter-cta'
export type { CtaProps } from './cta'
