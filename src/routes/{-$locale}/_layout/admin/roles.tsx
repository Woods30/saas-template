import { IconPlus, IconShieldLock, IconTrash } from '@tabler/icons-react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { assertAdminRole, assertFeatureEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import {
  fetchAdminRoles,
  matchPermission,
  ROLES,
  type RoleWithPermissions,
  removeAdminRole,
  saveAdminRole,
} from '@/modules/rbac/service'

export const Route = createFileRoute('/{-$locale}/_layout/admin/roles')({
  beforeLoad: ({ context }) => {
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  loader: () => fetchAdminRoles(),
  head: () =>
    seo('/admin/roles', {
      title: m.admin_roles_title(),
      description: m.admin_roles_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: AdminRolesPage,
})

interface RoleFormState {
  id?: string
  name: string
  title: string
  description: string
  isSystem: boolean
  permissionCodes: string[]
}

function AdminRolesPage() {
  const router = useRouter()
  const loaderData = Route.useLoaderData()
  const { permissionsCatalog, actorPermissions } = loaderData
  const [roles, setRoles] = useState<RoleWithPermissions[]>(loaderData.roles)
  const canWriteRoles = matchPermission('admin.roles.write', actorPermissions)

  useEffect(() => {
    setRoles(loaderData.roles)
  }, [loaderData.roles])

  const [editing, setEditing] = useState<RoleFormState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openCreateDialog() {
    setEditing({
      name: '',
      title: '',
      description: '',
      isSystem: false,
      permissionCodes: [],
    })
  }

  function openEditDialog(role: RoleWithPermissions) {
    setEditing({
      id: role.id,
      name: role.name,
      title: role.title,
      description: role.description ?? '',
      isSystem: role.isSystem,
      permissionCodes: [...role.permissions],
    })
  }

  function togglePermission(code: string, checked: boolean) {
    setEditing((prev) => {
      if (!prev) return prev
      const next = new Set(prev.permissionCodes)
      if (checked) {
        next.add(code)
      } else {
        next.delete(code)
      }
      return { ...prev, permissionCodes: Array.from(next) }
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSubmitting(true)
    try {
      const saved = await saveAdminRole({
        data: {
          id: editing.id,
          name: editing.name.trim().toLowerCase(),
          title: editing.title.trim(),
          description: editing.description.trim() || null,
          status: 'active',
          permissionCodes: editing.permissionCodes,
        },
      })
      setRoles((prev) => {
        const exists = prev.some((r) => r.id === saved.id)
        return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved]
      })
      toast.add({ type: 'success', title: m.admin_roles_saved_toast() })
      setEditing(null)
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(role: RoleWithPermissions) {
    if (role.isSystem) return
    setDeletingId(role.id)
    try {
      await removeAdminRole({ data: { roleId: role.id } })
      setRoles((prev) => prev.filter((r) => r.id !== role.id))
      toast.add({ type: 'success', title: m.admin_roles_deleted_toast() })
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{m.admin_roles_title()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{m.admin_roles_description()}</p>
        </div>
        {canWriteRoles ? (
          <Button
            type="button"
            size="sm"
            onClick={openCreateDialog}
            data-testid="create-role-button"
          >
            <IconPlus className="mr-1.5 size-4" />
            {m.admin_roles_create()}
          </Button>
        ) : null}
      </div>

      {roles.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconShieldLock className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{m.admin_roles_empty()}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.admin_roles_col_title()}</TableHead>
                <TableHead>{m.admin_roles_col_name()}</TableHead>
                <TableHead>{m.admin_roles_col_permissions()}</TableHead>
                <TableHead className="text-right">{m.admin_roles_col_users()}</TableHead>
                <TableHead>{m.admin_roles_col_status()}</TableHead>
                <TableHead className="text-right">{m.admin_roles_col_actions()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id} data-testid={`role-row-${role.name}`}>
                  <TableCell>
                    <div className="font-medium">{role.title}</div>
                    {role.description ? (
                      <div className="text-xs text-muted-foreground">{role.description}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{role.name}</code>
                      <Badge variant={role.isSystem ? 'secondary' : 'outline'}>
                        {role.isSystem
                          ? m.admin_roles_builtin_badge()
                          : m.admin_roles_custom_badge()}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-md flex-wrap gap-1">
                      {role.permissions.map((code) => (
                        <Badge key={code} variant="outline" className="font-mono text-xs">
                          {code}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{role.userCount}</TableCell>
                  <TableCell>
                    <Badge variant={role.status === 'active' ? 'default' : 'secondary'}>
                      {role.status === 'active'
                        ? m.admin_roles_status_active()
                        : m.admin_roles_status_disabled()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canWriteRoles ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={role.name === ROLES.SUPER_ADMIN}
                          onClick={() => openEditDialog(role)}
                          data-testid={`edit-role-${role.name}`}
                        >
                          {m.admin_roles_edit()}
                        </Button>
                        {!role.isSystem ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="xs"
                            disabled={deletingId === role.id}
                            onClick={() => void handleDelete(role)}
                            data-testid={`delete-role-${role.name}`}
                          >
                            {deletingId === role.id ? (
                              <Spinner className="size-3.5" />
                            ) : (
                              <IconTrash className="size-3.5" />
                            )}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !submitting) setEditing(null)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? m.admin_roles_edit_title() : m.admin_roles_create_title()}
            </DialogTitle>
            <DialogDescription>{m.admin_roles_description()}</DialogDescription>
          </DialogHeader>
          {editing ? (
            <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="role-name-input">{m.admin_roles_field_name()}</Label>
                <Input
                  id="role-name-input"
                  value={editing.name}
                  disabled={editing.isSystem || submitting}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                  }
                  placeholder="support_agent"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role-title-input">{m.admin_roles_field_title()}</Label>
                <Input
                  id="role-title-input"
                  value={editing.title}
                  disabled={submitting}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                  }
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role-desc-input">{m.admin_roles_field_description()}</Label>
                <Input
                  id="role-desc-input"
                  value={editing.description}
                  disabled={submitting}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, description: e.target.value } : prev))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>{m.admin_roles_field_permissions()}</Label>
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
                  {permissionsCatalog.map((perm) => {
                    const checked = editing.permissionCodes.includes(perm.code)
                    const allowedByCeiling = matchPermission(perm.code, actorPermissions)
                    return (
                      <label
                        key={perm.code}
                        className="flex cursor-pointer items-start gap-2.5 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!allowedByCeiling || submitting}
                          onCheckedChange={(val) => togglePermission(perm.code, Boolean(val))}
                          data-testid={`perm-checkbox-${perm.code}`}
                        />
                        <div className="leading-tight">
                          <div className="flex items-center gap-1.5 font-medium">
                            <span>{perm.title}</span>
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">
                              {perm.code}
                            </code>
                          </div>
                          {perm.description ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {perm.description}
                            </p>
                          ) : null}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  {m.admin_roles_cancel()}
                </DialogClose>
                <Button type="submit" disabled={submitting} data-testid="save-role-submit">
                  {submitting ? <Spinner className="mr-1.5 size-4" /> : null}
                  {m.admin_roles_save()}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
