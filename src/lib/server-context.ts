/**
 * 服务端请求上下文。
 *
 * 使用 AsyncLocalStorage（ALS）在整个请求生命周期内存储 env，
 * 使业务代码无需逐层透传即可访问 Cloudflare bindings。
 *
 * 在 `src/server.ts` 的 fetch handler 中通过 `als.run({ env }, ...)`
 * 注入，每个请求相互隔离。
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { KVCacheProvider } from '@/cache/provider/kv'
import type { MailProvider } from '@/mail/types'
import type { NewsletterProviderName } from '@/newsletter'
import type { NewsletterProvider } from '@/newsletter/types'
import type { NotificationChannel } from '@/notification'
import type { NotificationProvider } from '@/notification/types'
import type { PaymentProviderName } from '@/payment'
import type { PaymentProvider } from '@/payment/types'
import type { R2StorageProvider } from '@/storage/provider/r2'

interface ServerContext {
  env: Env
  cacheProvider: KVCacheProvider
  storageProvider: R2StorageProvider
  mailProviderRegistry?: Record<string, (() => MailProvider) | undefined>
  newsletterProviderRegistry?: Partial<Record<NewsletterProviderName, () => NewsletterProvider>>
  notificationProviderRegistry?: Partial<Record<NotificationChannel, () => NotificationProvider>>
  paymentProviderRegistry?: Partial<Record<PaymentProviderName, () => PaymentProvider>>
  /**
   * Per-request CSP nonce。`src/server.ts` 在每个请求入口生成，并通过 ALS
   * 注入；`streamHandlerWithNonce` 读取后写入 `router.options.ssr.nonce`，
   * 让 TanStack Router 的 `Asset` / `HydrationScriptsOwner` 把它展开到
   * 所有 SSR 输出的 `<script>` 上。没有 nonce，CSP `script-src` 就会
   * 阻止这些 inline 脚本并导致 `window.$_TSR` 缺失，进而 hydration 失败。
   */
  nonce: string
}

const als = new AsyncLocalStorage<ServerContext>()

/**
 * 获取当前请求的 env。仅在 server-side 代码中有效，
 * 客户端调用会得到 undefined。
 */
export function getServerContext(): ServerContext {
  const ctx = als.getStore()
  if (!ctx) {
    // 客户端调用或 outside of ALS context — 典型于测试环境
    // 返回带 undefined env 的宽松对象，调用方需自行防御
    return {
      env: undefined as unknown as Env,
      cacheProvider: undefined as unknown as KVCacheProvider,
      storageProvider: undefined as unknown as R2StorageProvider,
      newsletterProviderRegistry: undefined,
      notificationProviderRegistry: undefined,
      paymentProviderRegistry: undefined,
      // 客户端 / 测试环境无 per-request nonce；空串会被 CSP 拒绝但不会让代码崩
      nonce: '',
    }
  }
  return ctx
}

export { als }
