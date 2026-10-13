import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'

describe('LocaleSwitcher', () => {
  it('渲染带可访问名的图标触发器', () => {
    render(<LocaleSwitcher value="zh" />)
    expect(screen.getByRole('button')).toHaveAccessibleName()
  })
})
