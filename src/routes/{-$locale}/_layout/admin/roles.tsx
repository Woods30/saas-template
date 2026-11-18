import { IconPlus, IconShieldLock, IconTrash } from '@tabler/icons-react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { adminRoutes } from '@/config/routes'
import { adminHead } from '@/lib/page-head'
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
  loader: () => fetchAdminRoles(),
  head: () => adminHead(adminRoutes.roles),
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
  const canWriteRoles = matchPermission('admin.roles.write', actorPermissions)

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

  const openEditDialog = useCallback((role: RoleWithPermissions) => {
    setEditing({
      id: role.id,
      name: role.name,
      title: role.title,
      description: role.description ?? '',
      isSystem: role.isSystem,
      permissionCodes: [...role.permissions],
    })
  }, [])

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
      await saveAdminRole({
        data: {
          id: editing.id,
          name: editing.name.trim().toLowerCase(),
          title: editing.title.trim(),
          description: editing.description.trim() || null,
          status: 'active',
          permissionCodes: editing.permissionCodes,
        },
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

  const handleDelete = useCallback(
    async (role: RoleWithPermissions) => {
      if (role.isSystem) return
      setDeletingId(role.id)
      try {
        await removeAdminRole({ data: { roleId: role.id } })
        toast.add({ type: 'success', title: m.admin_roles_deleted_toast() })
        await router.invalidate()
      } catch {
        toast.add({ type: 'error', title: m.settings_error_generic() })
      } finally {
        setDeletingId(null)
      }
    },
    [router],
  )

  const columns = useMemo<DataTableColumn<RoleWithPermissions>[]>(
    () => [
      {
        id: 'title',
        header: m.admin_roles_col_title(),
        cell: (role) => (
          <>
            <div className="font-medium">{role.title}</div>
            {role.description ? (
              <div className="text-xs text-muted-foreground">{role.description}</div>
            ) : null}
          </>
        ),
      },
      {
        id: 'name',
        header: m.admin_roles_col_name(),
        cell: (role) => (
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{role.name}</code>
            <Badge variant={role.isSystem ? 'secondary' : 'outline'}>
              {role.isSystem ? m.admin_roles_builtin_badge() : m.admin_roles_custom_badge()}
            </Badge>
          </div>
        ),
      },
      {
        id: 'permissions',
        header: m.admin_roles_col_permissions(),
        cell: (role) => (
          <div className="flex max-w-md flex-wrap gap-1">
            {role.permissions.map((code) => (
              <Badge key={code} variant="outline" className="font-mono text-xs">
                {code}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: 'users',
        header: m.admin_roles_col_users(),
        className: 'text-right tabular-nums',
        cell: (role) => role.userCount,
      },
      {
        id: 'status',
        header: m.admin_roles_col_status(),
        cell: (role) => (
          <Badge variant={role.status === 'active' ? 'default' : 'secondary'}>
            {role.status === 'active'
              ? m.admin_roles_status_active()
              : m.admin_roles_status_disabled()}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: m.admin_roles_col_actions(),
        className: 'text-right',
        cell: (role) =>
          canWriteRoles ? (
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
          ) : null,
      },
    ],
    [canWriteRoles, deletingId, handleDelete, openEditDialog],
  )

  return (
    <div className="space-y-6">
      <DataTable
        columns={columns}
        data={loaderData.roles}
        rowKey={(role) => role.id}
        rowTestId={(role) => `role-row-${role.name}`}
        emptyIcon={<IconShieldLock aria-hidden />}
        emptyTitle={m.admin_roles_empty()}
        toolbar={
          canWriteRoles ? (
            <Button
              type="button"
              size="sm"
              onClick={openCreateDialog}
              data-testid="create-role-button"
            >
              <IconPlus className="mr-1.5 size-4" />
              {m.admin_roles_create()}
            </Button>
          ) : null
        }
      />

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
