import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { websiteConfig } from '@/config/website'
import { getPaymentProvider } from '@/payment'

const createCheckoutSchema = z.object({
  priceId: z.string(),
  userId: z.string(),
  customerEmail: z.email(),
  successUrl: z.url(),
  cancelUrl: z.url(),
  locale: z.enum(['zh', 'en']).optional(),
  mode: z.enum(['subscription', 'payment']),
})

export const createCheckoutSession = createServerFn({ method: 'POST' })
  .validator(createCheckoutSchema)
  .handler(async ({ data }) => {
    const provider = getPaymentProvider(websiteConfig.payment.provider)
    return provider.createCheckoutSession(data)
  })

const createPortalSchema = z.object({
  customerId: z.string(),
  returnUrl: z.url(),
})

export const createCustomerPortal = createServerFn({ method: 'POST' })
  .validator(createPortalSchema)
  .handler(async ({ data }) => {
    const provider = getPaymentProvider(websiteConfig.payment.provider)
    return provider.createCustomerPortalLink(data)
  })
