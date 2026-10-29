import { findProduct } from '@/config/products'
import { occupiesSubscriptionSlot } from './plan-state'

export interface SubscriptionRecord {
  id: string
  provider?: string
  customerId?: string | null
  subscriptionId?: string | null
  status: string
  priceId?: string | null
  productId?: string | null
  offerId?: string | null
  amount?: number | null
  currency?: string | null
  interval?: string | null
  intervalCount?: number | null
  currentPeriodStart?: Date | string | null
  currentPeriodEnd?: Date | string | null
  cancelAtPeriodEnd?: boolean | null
  createdAt: Date | string
}
export interface PaymentRecord {
  id: string
  type: string
  status: string
  amount: number
  refundedAmount?: number
  currency: string
  description?: string | null
  productId?: string | null
  paidAt?: Date | string | null
  refundedAt?: Date | string | null
  createdAt: Date | string
}

export function splitBillingDisplay(input: {
  subscriptions: SubscriptionRecord[]
  payments: PaymentRecord[]
}) {
  const currentSubscription =
    input.subscriptions.find((sub) => occupiesSubscriptionSlot(sub.status)) ?? null
  return {
    currentSubscription,
    historySubscriptions: input.subscriptions.filter((sub) => sub.id !== currentSubscription?.id),
  }
}
export function productNameForProductId(id: string | null | undefined): string | undefined {
  return id ? findProduct(id)?.name : undefined
}
export function subscriptionStatusMessageKey(status: string) {
  switch (status) {
    case 'active':
      return 'settings_billing_active'
    case 'trialing':
      return 'settings_billing_trialing'
    case 'canceled':
    case 'incomplete_expired':
      return 'settings_billing_cancelled'
    case 'past_due':
    case 'incomplete':
    case 'unpaid':
      return 'settings_billing_past_due'
    default:
      return 'settings_billing_status'
  }
}
export function paymentStatusMessageKey(status: string) {
  if (status === 'paid') return 'settings_billing_paid'
  if (status === 'refunded') return 'settings_billing_refunded'
  if (status === 'partially_refunded') return 'settings_billing_partially_refunded'
  if (status === 'failed') return 'settings_billing_failed'
  return 'settings_billing_payment_status'
}
export function subscriptionIntervalMessageKey(interval: string | null | undefined) {
  if (interval === 'month') return 'settings_billing_interval_month'
  if (interval === 'year') return 'settings_billing_interval_year'
  return null
}
