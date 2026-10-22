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
 *
 * 只要求 `STRIPE_SECRET_KEY`：`webhook secret` 是**验签**用的，取价（列表、创建
 * Checkout）不需要它。把它也当注册前提，会让「还没接 webhook、只想先看定价页」的
 * 部署连价格都取不到。验签路径自己守卫（见 `src/routes/api/webhooks/stripe.ts`）。
 */
export function buildPaymentProviderRegistry(
  env: PaymentEnv,
): Partial<Record<PaymentProviderName, PaymentProviderFactory>> {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = env
  if (STRIPE_SECRET_KEY) {
    return {
      stripe: () => new StripePaymentProvider(STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET ?? ''),
    }
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
