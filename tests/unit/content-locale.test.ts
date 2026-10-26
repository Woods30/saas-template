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
    // 若未来暴露带路径的 fileName，仍须按末尾判断。
    expect(resolveContentLocale('nested/hello.zh.md')).toBe('zh')
    expect(resolveContentLocale('nested/hello.md')).toBe('en')
  })

  it('.zh 后缀缺失 .md 时不被识别（避免 foo.zh 误判）', () => {
    // fileName 永远带扩展名，用 path 调用会得到相反结果（历史 bug 回归守卫）。
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
    // 用 _meta.path 会得到 `getting-started.zh`，本函数必须避免。
    expect(contentSlug('getting-started.zh.md')).not.toBe('getting-started.zh')
  })

  it('多段路径保留（只剥末尾扩展名与 locale）', () => {
    expect(contentSlug('guide/install.zh.md')).toBe('guide/install')
  })

  it('不剥掉非 locale 的相似后缀', () => {
    expect(contentSlug('guide.zh-cn.md')).toBe('guide.zh-cn')
    expect(contentSlug('guide.v2.md')).toBe('guide.v2')
  })
})

describe('语言后缀的派生（新增语言时不漏改正则）', () => {
  // 用自定义语言列表证明后缀识别由 `LOCALES` 派生，而非写死 `zh|en`。
  const WITH_JA = [...LOCALES, 'ja'] as const

  it('剥掉列表内任意语言的后缀', () => {
    for (const locale of WITH_JA) {
      expect(contentSlug(`getting-started.${locale}.md`, WITH_JA)).toBe('getting-started')
      expect(resolveContentLocale(`getting-started.${locale}.md`, WITH_JA)).toBe(locale)
    }
  })

  it('列表外的语言后缀不被剥掉，也不会被识别为 locale', () => {
    expect(contentSlug('getting-started.fr.md', WITH_JA)).toBe('getting-started.fr')
    expect(resolveContentLocale('getting-started.fr.md', WITH_JA)).toBe(BASE_LOCALE)
  })

  it('默认参数使用站点配置的受支持语言', () => {
    for (const locale of LOCALES) {
      expect(contentSlug(`a.${locale}.md`)).toBe('a')
    }
    expect(contentSlug('a.ja.md')).toBe('a.ja')
  })
})
