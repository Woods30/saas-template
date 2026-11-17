/**
 * 后台「系统设置」接口。
 *
 * 读：返回当前生效的六组配置（进程内快照，与页面看到的完全一致）。
 * 写：校验 → 落库 → 立即刷新进程内快照，保存完前台立刻生效。
 *
 * 权限：只认 `role === 'admin'`。密钥类配置不在这里——支付 / 邮件的凭据仍只在
 * env，数据库只存渠道选择与公开参数。
 */
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSettingsSnapshot, saveSettings } from '@/core/config/service'
import { SETTINGS_KEYS, type SettingsGroups, type SettingsKey } from '@/core/config/settings'
import { createDbFromEnv } from '@/core/db'

/** 取当前请求的管理员会话；非管理员一律 403（不回空数据）。 */
async function requireAdmin(): Promise<void> {
  const [{ getServerContext }, { getAuth }, { getRequestHeaders }] = await Promise.all([
    import('@/lib/server-context'),
    import('@/core/auth/auth'),
    import('@tanstack/react-start/server'),
  ])
  const env = getServerContext().env
  const session = await getAuth(env).api.getSession({ headers: getRequestHeaders() })
  if (session?.user.role !== 'admin') throw new Response(null, { status: 403 })
}

export const fetchAdminSettings = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SettingsGroups> => {
    await requireAdmin()
    return getSettingsSnapshot()
  },
)

const saveInputSchema = z.object({
  key: z.enum(SETTINGS_KEYS),
  value: z.unknown(),
})

export const saveAdminSettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) => saveInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ saved: SettingsKey }> => {
    await requireAdmin()
    const [{ getServerContext }] = await Promise.all([import('@/lib/server-context')])
    const db = createDbFromEnv(getServerContext().env)
    await saveSettings(db, data.key, data.value)
    return { saved: data.key }
  })
