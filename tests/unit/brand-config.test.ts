import { describe, expect, it } from 'vitest'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'

describe('websiteConfig 品牌信息', () => {
  it('站点名为 Jerbix', () => {
    expect(websiteConfig.metadata.name).toBe('Jerbix')
  })

  it('site_name 消息在两种语言下都解析为 Jerbix', () => {
    // 品牌名不随语言变化；<title> 取自 site_name，须与 Navbar / footer / manifest 一致。
    expect(m.site_name({}, { locale: 'zh' })).toBe('Jerbix')
    expect(m.site_name({}, { locale: 'en' })).toBe('Jerbix')
  })

  it('图片路径指向存在的品牌资产', () => {
    expect(websiteConfig.metadata.images.ogImage).toBe('/logo.png')
    expect(websiteConfig.metadata.images.logoLight).toBe('/logo.png')
    expect(websiteConfig.metadata.images.logoDark).toBe('/logo.png')
  })
})
