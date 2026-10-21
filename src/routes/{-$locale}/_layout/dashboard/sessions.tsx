import { IconDevices } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { authClient } from '@/auth/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from '@/components/ui/toast'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/dashboard/sessions')({
  head: () =>
    seo('/dashboard/sessions', {
      title: m.settings_sessions_title(),
      description: m.settings_sessions_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
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
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // `listSessions` 不标注哪条是「本机」，需靠 `getSession` 对照；
  // 否则用户点「注销」当前设备会把自己踢下线。
  const [currentToken, setCurrentToken] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: listError } = await authClient.listSessions()
    if (listError) {
      setError(listError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    setSessions((data as SessionEntry[] | null) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void authClient.getSession().then(({ data }) => {
      setCurrentToken((data as { session?: { token?: string } } | null)?.session?.token ?? null)
    })
  }, [])

  async function onRevoke(token: string) {
    const { error: revokeError } = await authClient.revokeSession({ token })
    if (revokeError) {
      setError(revokeError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    await load()
    toast.add({ type: 'success', title: m.settings_sessions_revoked_toast() })
  }

  async function onRevokeOthers() {
    const { error: revokeError } = await authClient.revokeOtherSessions()
    if (revokeError) {
      setError(revokeError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    await load()
    toast.add({ type: 'success', title: m.settings_sessions_revoked_others_toast() })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{m.settings_sessions_title()}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{m.settings_sessions_description()}</p>
      </div>

      {/* 表格直接放在内容区，外面不再套 `Card`。

          与 API 密钥 / 用户管理同一套：`Table` 的滚动容器已由 globals.css 统一给了
          边框 + 圆角，`TableHeader` 给了 `sticky top-0 bg-muted`；外面再套一张卡
          就是「框里套框」——卡片一道边框、表格又一道，两圈间距还不等宽。

          「注销其他设备」按 shadcn 的做法放在表格上方的工具行右侧，与表格共用
          一套 `px` 留白；它是作用于**整张列表**的操作，不属于某一行。 */}
      <div className="space-y-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {sessions !== null && sessions.length > 0 && (
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onRevokeOthers}>
              {m.settings_sessions_revoke_others()}
            </Button>
          </div>
        )}

        {sessions === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
          </div>
        ) : sessions.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconDevices aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{m.settings_sessions_empty()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              {/* 窄屏逐级收起次要列：设备与「注销」始终可见，时间列按断点放出。
                  表格不能靠横向滚动读——滚动区把主操作推到屏幕外，用户看不到。
                  被收起的列在宽屏上照常显示，信息没有删减。 */}
              <TableRow>
                <TableHead>{m.settings_sessions_device()}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {m.settings_sessions_created()}
                </TableHead>
                <TableHead className="hidden xl:table-cell">
                  {m.settings_sessions_expires()}
                </TableHead>
                <TableHead className="text-right">{m.settings_sessions_revoke()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => {
                const isCurrent = currentToken !== null && session.token === currentToken
                return (
                  <TableRow key={session.id}>
                    {/* 设备列在窄屏下要能换行：`TableCell` 默认 `whitespace-nowrap`,
                        UA 字符串会把列宽顶到 200px 以上，把「注销」挤出可视区。 */}
                    <TableCell className="min-w-0 whitespace-normal">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {session.userAgent ? (
                          <span className="line-clamp-2 min-w-0 max-w-64 break-words">
                            {session.userAgent}
                          </span>
                        ) : (
                          m.settings_sessions_unknown_device()
                        )}
                        {isCurrent && (
                          <Badge variant="outline">{m.settings_sessions_current()}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(session.createdAt)}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {formatDate(session.expiresAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        // 禁用而非隐藏：让用户知道这条就是自己，而不是以为漏了一行。
                        disabled={isCurrent}
                        onClick={() => onRevoke(session.token)}
                      >
                        {m.settings_sessions_revoke()}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

/** 用当前语言格式化时间；无效值原样返回，不显示 `Invalid Date`。 */
function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}
