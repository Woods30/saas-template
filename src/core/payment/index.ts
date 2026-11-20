import type { RuntimeEnv } from '@/core/env/server'
import { getServerContext } from '@/lib/server-context'
import { CreemPaymentProvider, parseCreemProducts } from './provider/creem'
import { StripePaymentProvider } from './provider/stripe'
import type { PaymentProvider } from './types'

export type PaymentProviderName = 'stripe' | 'creem'
type PaymentProviderFactory = () => PaymentProvider
type PaymentEnv = Pick<
  RuntimeEnv,
  | 'STRIPE_SECRET_KEY'
  | 'STRIPE_WEBHOOK_SECRET'
  | 'CREEM_API_KEY'
  | 'CREEM_WEBHOOK_SECRET'
  | 'CREEM_PRODUCTS'
  | 'CREEM_DEBUG'
>

/**
 * 按配置好的密钥注册支付渠道。
 *
 * 只注册有密钥的渠道：缺 key 时 `getPaymentProvider` 会抛错，但价格目录会先检查
 * `isPaymentProviderConfigured` 并优雅降级（模板工程出厂没有收款账号）。
 */
export function buildPaymentProviderRegistry(
  env: PaymentEnv,
): Partial<Record<PaymentProviderName, PaymentProviderFactory>> {
  const registry: Partial<Record<PaymentProviderName, PaymentProviderFactory>> = {}
  const stripeKey = env.STRIPE_SECRET_KEY
  if (stripeKey) {
    registry.stripe = () => new StripePaymentProvider(stripeKey, env.STRIPE_WEBHOOK_SECRET ?? '')
  }
  const creemKey = env.CREEM_API_KEY
  if (creemKey) {
    registry.creem = () =>
      new CreemPaymentProvider(
        creemKey,
        env.CREEM_WEBHOOK_SECRET ?? '',
        parseCreemProducts(env.CREEM_PRODUCTS),
        env.CREEM_DEBUG === 'true',
      )
  }
  return registry
}

/** 支付渠道是否已配置：缺 key 时 `buildPaymentProviderRegistry` 不注册该渠道。 */
export function isPaymentProviderConfigured(name: PaymentProviderName): boolean {
  return Boolean(getServerContext().paymentProviderRegistry?.[name])
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
export { CreemPaymentProvider, StripePaymentProvider }
