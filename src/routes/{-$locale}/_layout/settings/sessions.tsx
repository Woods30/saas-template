import { IconDevices } from '@tabler/icons-react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
import { LocalDateTime } from '@/components/local-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { settingsRoutes } from '@/config/routes'
import { authClient } from '@/core/auth/client'
import { fetchSessionsOverview } from '@/core/auth/session'
import { getRequestLocale } from '@/lib/locale'
import { settingsHead } from '@/lib/page-head'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/settings/sessions')({
  // 数据在路由加载阶段取好：客户端导航时内容随路由一起出现，不会先渲染空壳再补数据。
  // 服务端并行取列表与当前会话，避免「列表 + 当前 token」拆成两次往返。
  loader: () => fetchSessionsOverview(),
  head: () => settingsHead(settingsRoutes.sessions),
  component: SessionsPage,
})

/** better-auth `listSessions` 返回的会话条目（只取渲染需要的字段）。 */
interface SessionEntry {
  id: string
  token: string
  createdAt: Date | string
  expiresAt: Date | string
  ipAddress?: string | null
  userAgent?: string | null
}

function SessionsPage() {
  const router = useRouter()
  const initial = Route.useLoaderData()
  const locale = getRequestLocale()
  // `listSessions` 不标注哪条是「本机」，由 loader 一并取回的 `currentToken` 对照；
  // 否则用户点「注销」当前设备会把自己踢下线。
  const [currentToken] = useState<string | null>(initial.currentToken)
  const [error, setError] = useState<string | null>(null)

  const sessions = initial.sessions as SessionEntry[]

  const onRevoke = useCallback(
    async (token: string) => {
      const { error: revokeError } = await authClient.revokeSession({ token })
      if (revokeError) {
        setError(revokeError.message?.split('\n')[0] ?? m.settings_error_generic())
        return
      }
      await router.invalidate()
      toast.add({ type: 'success', title: m.settings_sessions_revoked_toast() })
    },
    [router],
  )

  async function onRevokeOthers() {
    setError(null)
    const { error: revokeError } = await authClient.revokeOtherSessions()
    if (revokeError) {
      setError(revokeError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    await router.invalidate()
    toast.add({ type: 'success', title: m.settings_sessions_revoked_others_toast() })
  }

  const columns = useMemo<DataTableColumn<SessionEntry>[]>(
    () => [
      {
        // 设备列在窄屏下要能换行：`TableCell` 默认 `whitespace-nowrap`，
        // UA 字符串会把列宽顶到 200px 以上，把「注销」挤出可视区。
        id: 'device',
        header: m.settings_sessions_device(),
        className: 'min-w-0 whitespace-normal',
        cell: (session) => {
          const isCurrent = currentToken !== null && session.token === currentToken
          return (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {session.userAgent ? (
                <span className="line-clamp-2 min-w-0 max-w-64 break-words">
                  {session.userAgent}
                </span>
              ) : (
                m.settings_sessions_unknown_device()
              )}
              {isCurrent && <Badge variant="outline">{m.settings_sessions_current()}</Badge>}
            </div>
          )
        },
      },
      // 窄屏逐级收起次要列：设备与「注销」始终可见，时间列按断点放出。
      {
        id: 'createdAt',
        header: m.settings_sessions_created(),
        className: 'hidden md:table-cell',
        cell: (session) => <LocalDateTime value={session.createdAt} locale={locale} />,
      },
      {
        id: 'expiresAt',
        header: m.settings_sessions_expires(),
        className: 'hidden xl:table-cell',
        cell: (session) => <LocalDateTime value={session.expiresAt} locale={locale} />,
      },
      {
        id: 'actions',
        header: m.settings_sessions_revoke(),
        className: 'text-right',
        cell: (session) => {
          const isCurrent = currentToken !== null && session.token === currentToken
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              // 禁用而非隐藏：让用户知道这条就是自己，而不是以为漏了一行。
              disabled={isCurrent}
              onClick={() => void onRevoke(session.token)}
            >
              {m.settings_sessions_revoke()}
            </Button>
          )
        },
      },
    ],
    [currentToken, locale, onRevoke],
  )

  return (
    <div className="space-y-6">
      <DataTable
        columns={columns}
        data={sessions}
        rowKey={(session) => session.id}
        error={error}
        emptyIcon={<IconDevices aria-hidden />}
        emptyTitle={m.settings_sessions_empty()}
        // 「注销其他设备」作用于整张列表，放工具行；它不属于某一行。
        toolbar={
          sessions.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => void onRevokeOthers()}
            >
              {m.settings_sessions_revoke_others()}
            </Button>
          ) : null
        }
      />
    </div>
  )
}
