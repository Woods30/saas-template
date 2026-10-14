import { describe, expect, it } from 'vitest'
import { LOCALES } from '@/config/locale'
import { BASE_LOCALE, contentSlug, resolveContentLocale } from '@/lib/content-locale'

describe('resolveContentLocale', () => {
  it('.zh.md 文件识别为 zh', () => {
    expect(resolveContentLocale('hello-world.zh.md')).toBe('zh')
  })

  it('不带 .zh 的文件识别为 en', () => {
    expect(resolveContentLocale('hello-world.md')).toBe('en')
  })

  it('路径中的 .zh 不会误判（只看 fileName 末尾）', () => {
    // 如果未来 content-collections 暴露带路径的 fileName，必须仍按末尾判断。
    expect(resolveContentLocale('nested/hello.zh.md')).toBe('zh')
    expect(resolveContentLocale('nested/hello.md')).toBe('en')
  })

  it('.zh 后缀缺失 .md 时不被识别（避免 foo.zh 误判）', () => {
    // _meta.path 是 hello-world.zh（已剥掉 .md），但 fileName 永远带扩展名。
    // 假如错误地用 path 调用，结果会相反——这是历史 bug 的回归守卫。
    expect(resolveContentLocale('hello-world.zh')).toBe('en')
  })

  it('其他 locale 后缀（未支持）一律回落到 en', () => {
    expect(resolveContentLocale('hello.ja.md')).toBe('en')
    expect(resolveContentLocale('hello.fr.md')).toBe('en')
  })
})

describe('contentSlug', () => {
  it('剥掉 .md 扩展名', () => {
    expect(contentSlug('getting-started.md')).toBe('getting-started')
  })

  it('剥掉 .zh.md 后缀，得到与语言无关的 slug', () => {
    expect(contentSlug('getting-started.zh.md')).toBe('getting-started')
  })

  it('中英同名文件产生相同 slug（切换语言不 404 的关键）', () => {
    expect(contentSlug('getting-started.md')).toBe(contentSlug('getting-started.zh.md'))
  })

  it('不再产生泄漏语言的 slug（历史 bug 回归守卫）', () => {
    // 旧实现用 _meta.path 会得到 "getting-started.zh"，本函数必须避免。
    expect(contentSlug('getting-started.zh.md')).not.toBe('getting-started.zh')
  })

  it('多段路径保留（只剥末尾扩展名与 locale）', () => {
    expect(contentSlug('guide/install.zh.md')).toBe('guide/install')
  })

  it('不剥掉非 locale 的相似后缀', () => {
    // `guide.zh-cn.md` 的后缀不是受支持 locale，应保留原样。
    expect(contentSlug('guide.zh-cn.md')).toBe('guide.zh-cn')
    expect(contentSlug('guide.v2.md')).toBe('guide.v2')
  })
})

describe('语言后缀的派生（新增语言时不漏改正则）', () => {
  // 后缀识别必须由 `LOCALES` 派生，而不是写死 `zh|en`。这里用一份**自定义**语言
  // 列表来证明派生成立：若实现写死 zh/en，`ja` 不会被剥掉，用例即失败。
  const WITH_JA = [...LOCALES, 'ja'] as const

  it('剥掉列表内任意语言的后缀', () => {
    for (const locale of WITH_JA) {
      expect(contentSlug(`getting-started.${locale}.md`, WITH_JA)).toBe('getting-started')
      expect(resolveContentLocale(`getting-started.${locale}.md`, WITH_JA)).toBe(locale)
    }
  })

  it('列表外的语言后缀不被剥掉，也不会被识别为 locale', () => {
    // `fr` 不在自定义列表内：slug 保留后缀，locale 回落到基准语言。
    expect(contentSlug('getting-started.fr.md', WITH_JA)).toBe('getting-started.fr')
    expect(resolveContentLocale('getting-started.fr.md', WITH_JA)).toBe(BASE_LOCALE)
  })

  it('默认参数使用站点配置的受支持语言', () => {
    for (const locale of LOCALES) {
      expect(contentSlug(`a.${locale}.md`)).toBe('a')
    }
    // 未支持的后缀保留原样。
    expect(contentSlug('a.ja.md')).toBe('a.ja')
  })
})
