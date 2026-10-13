import { describe, expect, it } from 'vitest'
import { blocks } from '@/components/blocks/marketing'

describe('blocks registry', () => {
  it('导出全部 7 个通用 blocks（不含 Pricing）', () => {
    expect(Object.keys(blocks).sort()).toEqual(
      ['Cta', 'Faq', 'Features', 'Hero', 'NewsletterCta', 'Stats', 'Testimonials'].sort(),
    )
  })
})
