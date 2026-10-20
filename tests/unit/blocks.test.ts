import { describe, expect, it } from 'vitest'
import { blocks } from '@/components/blocks/marketing'

describe('blocks registry', () => {
  it('导出全部 8 个通用 blocks（不含 Pricing）', () => {
    // 守的是「registry 不意外漂移」：新增组件必须显式登记，不能只放进目录。
    expect(Object.keys(blocks).sort()).toEqual(
      [
        'Cta',
        'Faq',
        'Features',
        'Hero',
        'NewsletterCta',
        'Roadmap',
        'Stats',
        'Testimonials',
      ].sort(),
    )
  })
})
