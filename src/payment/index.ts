import type { ServerEnv } from '@/env/server'
import { getServerContext } from '@/lib/server-context'
import { StripePaymentProvider } from './provider/stripe'
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentProvider,
  PortalParams,
  PortalResult,
} from './types'

export type PaymentProviderName = 'stripe'
type PaymentProviderFactory = () => PaymentProvider

/** 归一化后 provider 所需的 server env 子集。 */
type PaymentEnv = Pick<ServerEnv, 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET'>

/**
 * 按当前请求 env 构建 payment provider 注册表，在 `src/server.ts` 的 `als.run()` 中调用。
 * 只消费 `parseServerEnv` 归一化后的字段。
 */
export function buildPaymentProviderRegistry(
  env: PaymentEnv,
): Partial<Record<PaymentProviderName, PaymentProviderFactory>> {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = env
  if (STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET) {
    return { stripe: () => new StripePaymentProvider(STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) }
  }
  return { stripe: undefined }
}

export function getPaymentProvider(name: PaymentProviderName): PaymentProvider {
  const { paymentProviderRegistry } = getServerContext()
  const factory = paymentProviderRegistry?.[name]
  if (!factory) throw new Error(`Payment provider 未注册：${name}`)
  return factory()
}

export type { CheckoutParams, CheckoutResult, PaymentProvider, PortalParams, PortalResult }
export { StripePaymentProvider }
