/**
 * 服务端请求上下文。
 *
 * 使用 AsyncLocalStorage（ALS）在整个请求生命周期内存储 env，使业务代码无需逐层
 * 透传即可访问 Cloudflare bindings。由 `src/server.ts` 的 fetch handler 注入，
 * 每个请求相互隔离。
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { KVCacheProvider } from '@/cache/provider/kv'
import type { ServerEnv } from '@/env/server'
import { defaultTheme, type Theme } from '@/lib/theme'
import type { MailProvider } from '@/mail/types'
import type { NewsletterProviderName } from '@/newsletter'
import type { NewsletterProvider } from '@/newsletter/types'
import type { NotificationChannel } from '@/notification'
import type { NotificationProvider } from '@/notification/types'
import type { PaymentProviderName } from '@/payment'
import type { PaymentProvider } from '@/payment/types'
import type { R2StorageProvider } from '@/storage/provider/r2'

interface ServerContext {
  /**
   * 每请求归一化 env：同时具备已校验的字符串字段与原始资源 binding
   * （DB / CACHE / BUCKET / EMAIL）。
   */
  env: Env & ServerEnv
  cacheProvider: KVCacheProvider
  storageProvider: R2StorageProvider
  mailProviderRegistry?: Record<string, (() => MailProvider) | undefined>
  newsletterProviderRegistry?: Partial<Record<NewsletterProviderName, () => NewsletterProvider>>
  notificationProviderRegistry?: Partial<Record<NotificationChannel, () => NotificationProvider>>
  paymentProviderRegistry?: Partial<Record<PaymentProviderName, () => PaymentProvider>>
  /**
   * Per-request CSP nonce，写入 `router.options.ssr.nonce`，由 TanStack Router 展开到
   * 所有 SSR 输出的 `<script>`。缺失会让 CSP 阻止 inline 脚本，导致 hydration 失败。
   */
  nonce: string
  /** 请求主题（来自 `THEME` cookie），`__root.tsx` 据此输出 `<html data-theme>` 避免首屏闪烁。 */
  theme: Theme
  /** 文档侧边栏是否收起（来自 `DOCS_SIDEBAR` cookie），用于避免 hydration 闪烁。 */
  docsSidebarCollapsed: boolean
}

const als = new AsyncLocalStorage<ServerContext>()

/** 获取当前请求的上下文。仅在 server-side 代码中有效，客户端调用会得到宽松兜底对象。 */
export function getServerContext(): ServerContext {
  const ctx = als.getStore()
  if (!ctx) {
    // 客户端调用或不在 ALS context 中（典型于测试环境）：调用方需自行防御。
    return {
      env: undefined as unknown as Env & ServerEnv,
      cacheProvider: undefined as unknown as KVCacheProvider,
      storageProvider: undefined as unknown as R2StorageProvider,
      newsletterProviderRegistry: undefined,
      notificationProviderRegistry: undefined,
      paymentProviderRegistry: undefined,
      nonce: '',
      theme: defaultTheme,
      docsSidebarCollapsed: false,
    }
  }
  return ctx
}

export { als }
