import { describe, expect, it } from 'vitest'
import { occupiesSubscriptionSlot } from '@/payment/plan-state'

describe('账号订阅名额', () => {
  it.each(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])(
    '%s 占用订阅名额',
    (status) => {
      expect(occupiesSubscriptionSlot(status)).toBe(true)
    },
  )
  it.each(['canceled', 'incomplete_expired'])('%s 允许重新购买', (status) => {
    expect(occupiesSubscriptionSlot(status)).toBe(false)
  })
})
