import { describe, expect, it } from 'vitest'
import { destructiveFocusRing } from '@/lib/a11y'
import { cn } from '@/lib/utils'

/**
 * destructive 按钮的焦点环可访问性：原件的 `ring-destructive/20` 深色下对比度仅 1.70:1，
 * 低于 WCAG 3:1。ui 原件不本地修改，改在调用处用 className 覆盖。
 */
describe('destructiveFocusRing', () => {
  const upstreamDestructive =
    'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40'

  it('覆盖后不再包含低对比的 destructive 焦点环', () => {
    const merged = cn(upstreamDestructive, destructiveFocusRing)
    expect(merged).not.toContain('focus-visible:ring-destructive')
    expect(merged).not.toContain('focus-visible:border-destructive')
  })

  it('覆盖后焦点环指回高对比的 --ring', () => {
    const merged = cn(upstreamDestructive, destructiveFocusRing)
    expect(merged).toContain('focus-visible:ring-ring/50')
    expect(merged).toContain('focus-visible:border-ring')
  })
})
