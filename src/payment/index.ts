import type { ServerEnv } from '@/env/server'
import { getServerContext } from '@/lib/server-context'
import { StripePaymentProvider } from './provider/stripe'
import type { PaymentProvider } from './types'

export type PaymentProviderName = 'stripe'
type PaymentProviderFactory = () => PaymentProvider
type PaymentEnv = Pick<ServerEnv, 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET'>

export function buildPaymentProviderRegistry(
  env: PaymentEnv,
): Partial<Record<PaymentProviderName, PaymentProviderFactory>> {
  const secretKey = env.STRIPE_SECRET_KEY
  return secretKey
    ? { stripe: () => new StripePaymentProvider(secretKey, env.STRIPE_WEBHOOK_SECRET ?? '') }
    : {}
}

export function getPaymentProvider(name: PaymentProviderName): PaymentProvider {
  const factory = getServerContext().paymentProviderRegistry?.[name]
  if (!factory) throw new Error(`Payment provider 未注册：${name}`)
  return factory()
}

export type {
  CheckoutParams,
  CheckoutResult,
  PaymentProvider,
  PortalParams,
  PortalResult,
  ProviderSubscription,
} from './types'
export { StripePaymentProvider }
