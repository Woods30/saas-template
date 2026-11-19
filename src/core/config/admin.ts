/**
 * 后台「系统设置」接口。
 *
 * 读：返回当前生效的字段值（进程内快照，与页面看到的完全一致）；密钥只回显末四位。
 * 写：按组校验 → 落库（密钥加密）→ 立即刷新进程内快照，保存完前台立刻生效。
 *
 * 权限：只认 `role === 'admin'`。
 */
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { maskSecret } from '@/core/config/crypto'
import { type ProbeTarget, probeConnection } from '@/core/config/probes'
import { type SettingTab, settingField, settingTab } from '@/core/config/registry'
import { getSettingsSnapshot, saveSettingsTab } from '@/core/config/service'
import { createDbFromEnv } from '@/core/db'

/** 取当前请求的管理员会话；非管理员一律 403（不回空数据）。 */
async function requireAdmin(): Promise<void> {
  const [{ getServerContext }, { getAuth }, { getRequestHeaders }] = await Promise.all([
    import('@/lib/server-context'),
    import('@/core/auth/auth'),
    import('@tanstack/react-start/server'),
  ])
  const env = getServerContext().env
  const session = await (await getAuth(env)).api.getSession({ headers: getRequestHeaders() })
  if (session?.user.role !== 'admin') throw new Response(null, { status: 403 })
}

/** 可序列化到客户端的配置值形状。 */
export type AdminJsonValue =
  | string
  | number
  | boolean
  | null
  | AdminJsonValue[]
  | { [key: string]: AdminJsonValue }

/** 后台可见的配置值：密钥掩码，其余照原样。 */
export type AdminSettingsValues = Record<string, AdminJsonValue>

export const fetchAdminSettings = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminSettingsValues> => {
    await requireAdmin()
    const values = getSettingsSnapshot()
    const masked: AdminSettingsValues = {}
    for (const [key, value] of Object.entries(values)) {
      const field = settingField(key)
      masked[key] = (
        field?.secret && typeof value === 'string' && value !== '' ? maskSecret(value) : value
      ) as AdminJsonValue
    }
    return masked
  },
)

const saveInputSchema = z.object({
  tabId: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
})

/** 按 id 取 tab；未知 id 与旧的未知分组一样返回 400。 */
export function requireSettingTab(tabId: string): SettingTab {
  const tab = settingTab(tabId)
  if (!tab) throw new Response(null, { status: 400 })
  return tab
}

export const saveAdminSettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) => saveInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ saved: string }> => {
    await requireAdmin()
    const tab = requireSettingTab(data.tabId)
    const { getServerContext } = await import('@/lib/server-context')
    const env = getServerContext().env
    const values = { ...data.values }
    // 掩码值原样提交回来代表「没改」，交给服务层按空值处理（保持原值）。
    for (const [key, value] of Object.entries(values)) {
      const field = settingField(key)
      if (field?.secret && typeof value === 'string' && value.startsWith('••••')) {
        delete values[key]
      }
    }
    const db = await createDbFromEnv(env)
    await saveSettingsTab(db, tab.id, values, {
      baseEnv: env,
      encryptionKey: env.CONFIG_ENCRYPTION_KEY,
    })
    return { saved: tab.id }
  })

const testInputSchema = z.object({ target: z.enum(['payment', 'mail']) })

export const testAdminConnection = createServerFn({ method: 'POST' })
  .validator((input: unknown) => testInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    await requireAdmin()
    const { getServerContext } = await import('@/lib/server-context')
    const env = getServerContext().env
    const values = getSettingsSnapshot()
    return probeConnection(data.target as ProbeTarget, {
      payment: {
        provider: values['payment.provider'] === 'creem' ? 'creem' : 'stripe',
        stripeSecretKey: values['stripe.secretKey'] as string | undefined,
        creemApiKey: values['creem.apiKey'] as string | undefined,
        creemDebug: values['creem.debug'] === true,
      },
      mail: {
        provider: values['mail.provider'] === 'cloudflare' ? 'cloudflare' : 'resend',
        resendApiKey: values['resend.apiKey'] as string | undefined,
        cloudflareSender: values['cloudflareEmail.sender'] as string | undefined,
        cloudflareBinding: !!env.EMAIL,
      },
    })
  })
