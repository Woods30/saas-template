import { describe, expect, it } from 'vitest'
import { getServerContext } from '@/lib/server-context'
import { defaultTheme } from '@/lib/theme'

describe('ServerContext.theme', () => {
  it('ALS 缺失时兜底为默认主题（不抛错）', () => {
    expect(getServerContext().theme).toBe(defaultTheme)
  })
})
