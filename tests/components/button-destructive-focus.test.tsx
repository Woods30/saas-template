import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import { destructiveFocusRing } from '@/lib/a11y'

describe('Button destructive 焦点环', () => {
  it('调用处传入 override 后，最终类名不含低对比 destructive 焦点环', () => {
    render(
      <Button variant="destructive" className={destructiveFocusRing}>
        删除
      </Button>,
    )
    const btn = screen.getByRole('button', { name: '删除' })
    expect(btn.className).not.toContain('focus-visible:ring-destructive')
    expect(btn.className).toContain('focus-visible:ring-ring/50')
  })
})
