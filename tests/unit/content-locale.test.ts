import { describe, expect, it } from 'vitest'
import { resolveContentLocale } from '@/lib/content-locale'

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
