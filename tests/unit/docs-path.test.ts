import { describe, expect, it } from 'vitest'
import {
  docsLegacyRedirect,
  docsPublicPath,
  rewriteDocsInput,
  rewriteDocsOutput,
} from '@/modules/docs/service'

/**
 * 文档站独立部署时（`docs.asHome`），对外地址不应再带一层 `/docs`：
 * `docs.example.com/zh/getting-started`，而不是 `docs.example.com/zh/docs/getting-started`。
 *
 * 内部路由保持 `/{locale}/docs/...` 不动，靠 Router 的 input/output rewrite
 * 在「真实地址」与「内部地址」之间换算，这样官网站关闭 docs 时不受影响。
 */

describe('对外文档地址', () => {
  it('文档站模式下省略 /docs 段', () => {
    // 首页返回空串：调用方拼上语言前缀后得到 `/zh`，不会多出尾斜杠。
    expect(docsPublicPath(undefined, true)).toBe('')
    expect(docsPublicPath('getting-started', true)).toBe('/getting-started')
  })

  it('文档在站内时保留 /docs 段', () => {
    expect(docsPublicPath(undefined, false)).toBe('/docs')
    expect(docsPublicPath('getting-started', false)).toBe('/docs/getting-started')
  })
})

describe('输入重写（真实地址 → 内部路由）', () => {
  it('把根级文档地址补上 /docs', () => {
    expect(rewriteDocsInput('/zh/getting-started', true)).toBe('/zh/docs/getting-started')
    expect(rewriteDocsInput('/getting-started', true)).toBe('/docs/getting-started')
  })

  it('已带 /docs 的地址原样放行', () => {
    expect(rewriteDocsInput('/zh/docs/getting-started', true)).toBeUndefined()
    expect(rewriteDocsInput('/docs', true)).toBeUndefined()
  })

  it('语言根直接进文档首页，站点根交给语言协商', () => {
    // `/zh` 若落回营销首页路由，会被它重定向到 `/zh` 形成自跳转。
    expect(rewriteDocsInput('/zh', true)).toBe('/zh/docs')
    expect(rewriteDocsInput('/zh/', true)).toBe('/zh/docs')
    expect(rewriteDocsInput('/', true)).toBeUndefined()
  })

  it('接口、静态资源与非文档前缀不参与重写', () => {
    expect(rewriteDocsInput('/api/payment', true)).toBeUndefined()
    expect(rewriteDocsInput('/assets/app.js', true)).toBeUndefined()
    expect(rewriteDocsInput('/favicon.ico', true)).toBeUndefined()
    expect(rewriteDocsInput('/llms.txt', true)).toBeUndefined()
    expect(rewriteDocsInput('/sitemap.xml', true)).toBeUndefined()
    expect(rewriteDocsInput('/marketing/about', true)).toBeUndefined()
  })

  it('非文档站模式不重写', () => {
    expect(rewriteDocsInput('/zh/getting-started', false)).toBeUndefined()
  })
})

describe('输出重写（内部路由 → 真实地址）', () => {
  it('生成链接时去掉 /docs 段', () => {
    expect(rewriteDocsOutput('/zh/docs', true)).toBe('/zh')
    expect(rewriteDocsOutput('/zh/docs/getting-started', true)).toBe('/zh/getting-started')
    expect(rewriteDocsOutput('/docs', true)).toBe('/')
    expect(rewriteDocsOutput('/docs/getting-started', true)).toBe('/getting-started')
  })

  it('不含 /docs 的地址不动', () => {
    expect(rewriteDocsOutput('/zh/pricing', true)).toBeUndefined()
    expect(rewriteDocsOutput('/api/payment', true)).toBeUndefined()
  })

  it('非文档站模式不重写', () => {
    expect(rewriteDocsOutput('/zh/docs/getting-started', false)).toBeUndefined()
  })
})

describe('旧地址重定向', () => {
  it('文档站模式下 /docs* 跳到去掉 /docs 的地址', () => {
    expect(docsLegacyRedirect('/docs', true)).toBe('/')
    expect(docsLegacyRedirect('/docs/getting-started', true)).toBe('/getting-started')
    expect(docsLegacyRedirect('/zh/docs/getting-started', true)).toBe('/zh/getting-started')
  })

  it('非 /docs 地址不重定向', () => {
    expect(docsLegacyRedirect('/zh/getting-started', true)).toBeUndefined()
    expect(docsLegacyRedirect('/docs', false)).toBeUndefined()
  })
})
