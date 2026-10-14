import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { authClient } from '@/auth/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/settings/sessions')({
  head: () => {
    const base = seo('/settings/sessions', {
      title: m.settings_sessions_title(),
      description: m.settings_sessions_description(),
      locale: getRequestLocale(),
    })
    return { ...base, meta: [...base.meta, { name: 'robots', content: 'noindex' }] }
  },
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

  async function onRevoke(token: string) {
    const { error: revokeError } = await authClient.revokeSession({ token })
    if (revokeError) {
      setError(revokeError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    await load()
  }

  async function onRevokeOthers() {
    const { error: revokeError } = await authClient.revokeOtherSessions()
    if (revokeError) {
      setError(revokeError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    await load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{m.settings_sessions_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.settings_sessions_description()}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.settings_sessions_title()}</CardTitle>
          <CardDescription>{m.settings_sessions_description()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {sessions === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.settings_sessions_empty()}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.settings_sessions_created()}</TableHead>
                  <TableHead>{m.settings_sessions_expires()}</TableHead>
                  <TableHead className="text-right">{m.settings_sessions_revoke()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>{formatDate(session.createdAt)}</TableCell>
                    <TableCell>{formatDate(session.expiresAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onRevoke(session.token)}
                      >
                        {m.settings_sessions_revoke()}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onRevokeOthers}>
            {m.settings_sessions_revoke_others()}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

/** 用当前语言格式化时间；无效值原样返回，不显示 `Invalid Date`。 */
function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}
