/**
 * Mail module — ALS-based provider registry.
 *
 * Architecture: Option A（推荐）— consistent with Tasks 4/5.
 * Provider factories are registered per-request in `src/server.ts` via
 * `als.run({ ..., mailProviderRegistry }, ...)`. 业务代码 calls
 * `getMailProvider(name)` to retrieve a provider from the current ALS context.
 * No module-level singleton state for provider instances.
 */
import { als } from '@/lib/server-context'
import type { MailProvider, SendEmailResult, SendTemplateParams } from './types'

type ProviderName = 'cloudflare' | 'resend'
type ProviderFactory = () => MailProvider

interface MailProviderRegistry {
  [key: string]: ProviderFactory | undefined
}

function getRegistry(): MailProviderRegistry {
  const ctx = als.getStore() as { mailProviderRegistry?: MailProviderRegistry } | undefined
  return ctx?.mailProviderRegistry ?? {}
}

/**
 * Register a mail provider factory into the current request's ALS context.
 * Called once per request in `src/server.ts`.
 */
export function registerMailProvider(name: ProviderName, factory: ProviderFactory) {
  const ctx = als.getStore() as { mailProviderRegistry?: MailProviderRegistry } | undefined
  if (ctx) {
    ctx.mailProviderRegistry ??= {}
    ctx.mailProviderRegistry[name] = factory
  }
}

/**
 * Retrieve a mail provider from the current request's ALS context.
 */
export function getMailProvider(name: ProviderName): MailProvider {
  const factory = getRegistry()[name]
  if (!factory) throw new Error(`Mail provider 未注册：${name}`)
  return factory()
}

/**
 * Send an email via the named provider, with up to 3 attempts.
 */
export async function sendMail(
  providerName: ProviderName,
  params: SendTemplateParams,
): Promise<SendEmailResult> {
  const provider = getMailProvider(providerName)
  let lastErr: string | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await provider.sendTemplate(params)
    if (result.ok) return result
    lastErr = result.error
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
  }
  return { ok: false, error: lastErr ?? 'unknown' }
}

export { CloudflareEmailProvider } from './provider/cloudflare'
export { ResendMailProvider } from './provider/resend'
export type { MailProvider, SendEmailResult, SendTemplateParams }
