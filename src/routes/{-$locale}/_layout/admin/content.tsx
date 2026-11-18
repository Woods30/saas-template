import { IconFileText, IconPlus, IconTrash } from '@tabler/icons-react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
import { LocalDateTime } from '@/components/local-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { getRequestLocale } from '@/lib/locale'
import { adminHead } from '@/lib/page-head'
import { m } from '@/locale/paraglide/messages.js'
import { fetchAdminContentOverview, saveAdminChangelog } from '@/modules/changelog/service'
import { removeAdminPost, saveAdminPost } from '@/modules/posts/service'
import { saveAdminTaxonomy } from '@/modules/taxonomy/service'

export const Route = createFileRoute('/{-$locale}/_layout/admin/content')({
  loader: () => fetchAdminContentOverview(),
  head: () => adminHead(adminRoutes.content),
  component: AdminContentPage,
})

function AdminContentPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const locale = getRequestLocale()

  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [changelogDialogOpen, setChangelogDialogOpen] = useState(false)
  const [taxonomyDialogOpen, setTaxonomyDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Post form state
  const [postSlug, setPostSlug] = useState('')
  const [postTitle, setPostTitle] = useState('')
  const [postCategory, setPostCategory] = useState('announcement')
  const [postBody, setPostBody] = useState('')

  // Changelog form state
  const [logVersion, setLogVersion] = useState('')
  const [logTitle, setLogTitle] = useState('')
  const [logBody, setLogBody] = useState('')

  // Taxonomy form state
  const [taxType, setTaxType] = useState<'category' | 'tag'>('category')
  const [taxSlug, setTaxSlug] = useState('')
  const [taxName, setTaxName] = useState('')

  async function handleSavePost(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await saveAdminPost({
        data: {
          slug: postSlug.trim().toLowerCase(),
          locale: 'zh',
          title: postTitle.trim(),
          description: postTitle.trim(),
          content: postBody.trim(),
          categorySlug: postCategory.trim() || null,
          tags: [],
          status: 'published',
        },
      })
      toast.add({ type: 'success', title: m.admin_content_saved_toast() })
      setPostDialogOpen(false)
      setPostSlug('')
      setPostTitle('')
      setPostBody('')
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeletePost = useCallback(
    async (id: string) => {
      try {
        await removeAdminPost({ data: { id } })
        await router.invalidate()
      } catch {
        toast.add({ type: 'error', title: m.settings_error_generic() })
      }
    },
    [router],
  )

  async function handleSaveChangelog(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await saveAdminChangelog({
        data: {
          version: logVersion.trim(),
          locale: 'zh',
          title: logTitle.trim(),
          content: logBody.trim(),
          status: 'published',
        },
      })
      toast.add({ type: 'success', title: m.admin_content_saved_toast() })
      setChangelogDialogOpen(false)
      setLogVersion('')
      setLogTitle('')
      setLogBody('')
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveTaxonomy(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await saveAdminTaxonomy({
        data: {
          type: taxType,
          slug: taxSlug.trim().toLowerCase(),
          name: taxName.trim(),
          sortOrder: 100,
        },
      })
      toast.add({ type: 'success', title: m.admin_content_saved_toast() })
      setTaxonomyDialogOpen(false)
      setTaxSlug('')
      setTaxName('')
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    } finally {
      setSubmitting(false)
    }
  }

  const postColumns = useMemo<DataTableColumn<(typeof data.posts)[number]>[]>(
    () => [
      {
        id: 'title',
        header: m.admin_content_col_title(),
        className: 'font-medium',
        cell: (post) => post.title,
      },
      {
        id: 'slug',
        header: m.admin_content_col_slug(),
        cell: (post) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{post.slug}</code>,
      },
      {
        id: 'category',
        header: m.admin_content_col_category(),
        className: 'text-xs',
        cell: (post) => post.categorySlug ?? '-',
      },
      {
        id: 'locale',
        header: m.admin_content_col_locale(),
        className: 'text-xs',
        cell: (post) => post.locale,
      },
      {
        id: 'status',
        header: m.admin_content_col_status(),
        cell: (post) => <Badge variant="outline">{post.status}</Badge>,
      },
      {
        id: 'updatedAt',
        header: m.admin_content_col_updated_at(),
        className: 'text-xs text-muted-foreground',
        cell: (post) => <LocalDateTime value={post.updatedAt} locale={locale} />,
      },
      {
        id: 'actions',
        header: '',
        className: 'text-right',
        cell: (post) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleDeletePost(post.id)}
          >
            <IconTrash className="size-4 text-destructive" />
          </Button>
        ),
      },
    ],
    [handleDeletePost, locale],
  )

  const changelogColumns = useMemo<DataTableColumn<(typeof data.changelogs)[number]>[]>(
    () => [
      {
        id: 'version',
        header: m.admin_content_col_slug(),
        cell: (log) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{log.version}</code>
        ),
      },
      {
        id: 'title',
        header: m.admin_content_col_title(),
        className: 'font-medium',
        cell: (log) => log.title,
      },
      {
        id: 'locale',
        header: m.admin_content_col_locale(),
        className: 'text-xs',
        cell: (log) => log.locale,
      },
      {
        id: 'status',
        header: m.admin_content_col_status(),
        cell: (log) => <Badge variant="outline">{log.status}</Badge>,
      },
      {
        id: 'updatedAt',
        header: m.admin_content_col_updated_at(),
        className: 'text-xs text-muted-foreground',
        cell: (log) => <LocalDateTime value={log.updatedAt} locale={locale} />,
      },
    ],
    [locale],
  )

  return (
    <div className="space-y-8">
      {/* 分类与标签 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{m.admin_content_section_taxonomies()}</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTaxonomyDialogOpen(true)}
            data-testid="create-taxonomy-button"
          >
            <IconPlus className="mr-1.5 size-4" />
            {m.admin_content_create_taxonomy()}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.taxonomies.map((tax) => (
            <Badge
              key={tax.id}
              variant={tax.type === 'category' ? 'default' : 'secondary'}
              data-testid={`taxonomy-badge-${tax.slug}`}
            >
              {tax.name} ({tax.slug})
            </Badge>
          ))}
        </div>
      </section>

      {/* 文章列表 */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">{m.admin_content_section_posts()}</h3>
        <DataTable
          columns={postColumns}
          data={data.posts}
          rowKey={(post) => post.id}
          rowTestId={(post) => `post-row-${post.slug}`}
          emptyIcon={<IconFileText aria-hidden />}
          emptyTitle={m.admin_content_empty_posts()}
          toolbar={
            <Button
              type="button"
              size="sm"
              className="ml-auto"
              onClick={() => setPostDialogOpen(true)}
              data-testid="create-post-button"
            >
              <IconPlus className="mr-1.5 size-4" />
              {m.admin_content_create_post()}
            </Button>
          }
        />
      </section>

      {/* 更新日志 */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">{m.admin_content_section_changelogs()}</h3>
        <DataTable
          columns={changelogColumns}
          data={data.changelogs}
          rowKey={(log) => log.id}
          rowTestId={(log) => `changelog-row-${log.version}`}
          emptyIcon={<IconFileText aria-hidden />}
          emptyTitle={m.admin_content_empty_changelogs()}
          toolbar={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setChangelogDialogOpen(true)}
              data-testid="create-changelog-button"
            >
              <IconPlus className="mr-1.5 size-4" />
              {m.admin_content_create_changelog()}
            </Button>
          }
        />
      </section>

      {/* 新建文章 Dialog */}
      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.admin_content_create_post()}</DialogTitle>
            <DialogDescription>{m.admin_content_description()}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePost} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="post-slug">{m.admin_content_field_slug()}</Label>
              <Input
                id="post-slug"
                value={postSlug}
                onChange={(e) => setPostSlug(e.target.value)}
                required
                data-testid="post-slug-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-title">{m.admin_content_field_title()}</Label>
              <Input
                id="post-title"
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                required
                data-testid="post-title-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-category">{m.admin_content_field_category()}</Label>
              <Input
                id="post-category"
                value={postCategory}
                onChange={(e) => setPostCategory(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-body">{m.admin_content_field_body()}</Label>
              <Input
                id="post-body"
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                required
                data-testid="post-body-input"
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                {m.admin_content_cancel()}
              </DialogClose>
              <Button type="submit" disabled={submitting} data-testid="save-post-submit">
                {submitting ? <Spinner className="mr-1.5 size-4" /> : null}
                {m.admin_content_save()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 发布更新日志 Dialog */}
      <Dialog open={changelogDialogOpen} onOpenChange={setChangelogDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.admin_content_create_changelog()}</DialogTitle>
            <DialogDescription>{m.admin_content_description()}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveChangelog} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="log-version">{m.admin_content_field_version()}</Label>
              <Input
                id="log-version"
                value={logVersion}
                onChange={(e) => setLogVersion(e.target.value)}
                required
                data-testid="changelog-version-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-title">{m.admin_content_field_title()}</Label>
              <Input
                id="log-title"
                value={logTitle}
                onChange={(e) => setLogTitle(e.target.value)}
                required
                data-testid="changelog-title-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-body">{m.admin_content_field_body()}</Label>
              <Input
                id="log-body"
                value={logBody}
                onChange={(e) => setLogBody(e.target.value)}
                required
                data-testid="changelog-body-input"
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                {m.admin_content_cancel()}
              </DialogClose>
              <Button type="submit" disabled={submitting} data-testid="save-changelog-submit">
                {submitting ? <Spinner className="mr-1.5 size-4" /> : null}
                {m.admin_content_save()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 新建分类/标签 Dialog */}
      <Dialog open={taxonomyDialogOpen} onOpenChange={setTaxonomyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.admin_content_create_taxonomy()}</DialogTitle>
            <DialogDescription>{m.admin_content_description()}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTaxonomy} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tax-type">{m.admin_content_field_type()}</Label>
              <select
                id="tax-type"
                value={taxType}
                onChange={(e) => setTaxType(e.target.value as 'category' | 'tag')}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="category">category</option>
                <option value="tag">tag</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax-slug">{m.admin_content_field_slug()}</Label>
              <Input
                id="tax-slug"
                value={taxSlug}
                onChange={(e) => setTaxSlug(e.target.value)}
                required
                data-testid="taxonomy-slug-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax-name">{m.admin_content_field_name()}</Label>
              <Input
                id="tax-name"
                value={taxName}
                onChange={(e) => setTaxName(e.target.value)}
                required
                data-testid="taxonomy-name-input"
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                {m.admin_content_cancel()}
              </DialogClose>
              <Button type="submit" disabled={submitting} data-testid="save-taxonomy-submit">
                {submitting ? <Spinner className="mr-1.5 size-4" /> : null}
                {m.admin_content_save()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
