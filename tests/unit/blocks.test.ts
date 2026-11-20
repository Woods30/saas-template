import { describe, expect, it } from 'vitest'
import { Cta } from '@/blocks/cta'
import { Faq } from '@/blocks/faq'
import { Features } from '@/blocks/features'
import { Hero } from '@/blocks/hero'
import { NewsletterCta } from '@/blocks/newsletter-cta'
import { Roadmap } from '@/blocks/roadmap'
import { Stats } from '@/blocks/stats'
import { Testimonials } from '@/blocks/testimonials'

describe('blocks 层导出', () => {
  it('每个通用 block 都以 PascalCase 具名导出组件', () => {
    // blocks 层不设 barrel：新增 block 直接以文件导出，路由按需引用。
    const blocks = [Cta, Faq, Features, Hero, NewsletterCta, Roadmap, Stats, Testimonials]
    for (const block of blocks) {
      expect(typeof block).toBe('function')
    }
  })
})
