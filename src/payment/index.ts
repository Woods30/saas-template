// Env is a global interface declared in src/types/cloudflare.d.ts — no import needed
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

/**
 * 按当前请求 env 构建 payment provider 注册表。
 * 在 src/server.ts 的 als.run() 中调用，结果注入 ServerContext.paymentProviderRegistry。
 */
export function buildPaymentProviderRegistry(
  env: Env,
): Partial<Record<PaymentProviderName, PaymentProviderFactory>> {
  const secretKey = env.STRIPE_SECRET_KEY
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET
  if (secretKey && webhookSecret) {
    return { stripe: () => new StripePaymentProvider(secretKey, webhookSecret) }
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
