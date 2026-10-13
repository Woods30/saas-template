import { describe, expect, it } from 'vitest'
import { websiteConfig } from '@/config/website'

describe('websiteConfig 品牌信息', () => {
  it('站点名为 Jerbix', () => {
    expect(websiteConfig.metadata.name).toBe('Jerbix')
  })

  it('图片路径指向存在的品牌资产', () => {
    expect(websiteConfig.metadata.images.ogImage).toBe('/logo.png')
    expect(websiteConfig.metadata.images.logoLight).toBe('/logo.png')
    expect(websiteConfig.metadata.images.logoDark).toBe('/logo.png')
  })
})
