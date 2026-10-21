import { describe, expect, it } from 'vitest'
import {
  defaultLocale,
  htmlLang,
  isLocale,
  LOCALE_COOKIE_NAME,
  LOCALE_OPTIONS,
  LOCALES,
  localeConfig,
  localeSchema,
  parseLocale,
} from '@/config/locale'

/**
 * 受支持语言的单一事实来源：新增语言时若漏了元数据或默认值，这里直接失败。
 */

describe('LOCALE_OPTIONS', () => {
  it('每个受支持语言都有完整元数据', () => {
    for (const option of LOCALE_OPTIONS) {
      expect(option.code).toBeTruthy()
      // 三者都是渲染或 SEO 的必需字段。
      expect(option.name).toBeTruthy()
      expect(option.englishName).toBeTruthy()
      expect(option.hreflang).toBeTruthy()
      expect(option.ogLocale).toBeTruthy()
    }
  })

  it('code 唯一，且 LOCALES 与 LOCALE_OPTIONS 顺序一致', () => {
    const codes = LOCALE_OPTIONS.map((o) => o.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(LOCALES).toEqual(codes)
  })

  it('默认语言在受支持列表内', () => {
    // 默认语言不在列表里时，`parseLocale` 的兜底会指向不存在的语言。
    expect(LOCALES).toContain(defaultLocale)
  })

  it('localeConfig 覆盖每一个受支持语言', () => {
    for (const code of LOCALES) {
      expect(localeConfig[code].code).toBe(code)
    }
    expect(Object.keys(localeConfig).sort()).toEqual([...LOCALES].sort())
  })
})

describe('parseLocale / isLocale', () => {
  it('识别受支持的语言并归一化大小写与空白', () => {
    expect(parseLocale('zh')).toBe('zh')
    expect(parseLocale('EN')).toBe('en')
    expect(parseLocale('  En  ')).toBe('en')
  })

  it('对未知、空或缺失取值返回 undefined', () => {
    expect(parseLocale('fr')).toBeUndefined()
    expect(parseLocale('')).toBeUndefined()
    expect(parseLocale(undefined)).toBeUndefined()
  })

  it('isLocale 只认受支持的 locale', () => {
    expect(isLocale('zh')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    // 非字符串输入不应抛错（内容 schema / API body 可能是任意 JSON）。
    expect(isLocale(undefined)).toBe(false)
    expect(isLocale(null)).toBe(false)
    expect(isLocale(1)).toBe(false)
    expect(isLocale({ code: 'zh' })).toBe(false)
  })
})

describe('localeSchema', () => {
  it('接受受支持的 locale', () => {
    expect(localeSchema.safeParse('zh').success).toBe(true)
    expect(localeSchema.safeParse('en').success).toBe(true)
  })

  it('拒绝未支持的 locale，供 API 边界直接返回 400', () => {
    expect(localeSchema.safeParse('fr').success).toBe(false)
    expect(localeSchema.safeParse('').success).toBe(false)
    expect(localeSchema.safeParse(undefined).success).toBe(false)
  })
})

describe('htmlLang', () => {
  it('返回 hreflang 而非裸 code（zh → zh-CN）', () => {
    expect(htmlLang('zh')).toBe('zh-CN')
    expect(htmlLang('en')).toBe('en')
  })
})

describe('LOCALE_COOKIE_NAME', () => {
  it('是稳定的 cookie 名，与 Paraglide 客户端策略一致', () => {
    expect(LOCALE_COOKIE_NAME).toBe('NEXT_LOCALE')
  })
})
