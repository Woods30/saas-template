import { z } from 'zod'

const schema = z.object({
  VITE_BASE_URL: z.url().default('http://localhost:3000'),
  VITE_PAYMENT_PROVIDER: z.enum(['stripe']).optional(),
  VITE_STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  VITE_STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  VITE_STRIPE_PRICE_LIFETIME: z.string().optional(),
  VITE_GA_ID: z.string().optional(),
  VITE_PLAUSIBLE_DOMAIN: z.string().optional(),
  VITE_UMAMI_ID: z.string().optional(),
  VITE_CLARITY_ID: z.string().optional(),
  VITE_TURNSTILE_SITE_KEY: z.string().optional(),
})

export type PublicEnv = z.infer<typeof schema>

export function parsePublicEnv(raw: unknown): PublicEnv {
  return schema.parse(raw)
}
