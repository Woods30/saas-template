import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { DB } from '@/core/db'
import { changelogs } from '@/core/db/schema'
import { safeRecordAuditLog } from '@/modules/audit/service'
import { listPosts, type PostRecord } from '@/modules/posts/service'
import { listTaxonomies, type TaxonomyRecord } from '@/modules/taxonomy/service'

export type ChangelogStatus = 'draft' | 'published'

export interface ChangelogRecord {
  id: string
  version: string
  locale: string
  title: string
  content: string
  status: ChangelogStatus
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export async function listChangelogs(
  db: DB,
  filter: { locale?: string; status?: ChangelogStatus } = {},
): Promise<ChangelogRecord[]> {
  const conditions = []
  if (filter.locale) conditions.push(eq(changelogs.locale, filter.locale))
  if (filter.status) conditions.push(eq(changelogs.status, filter.status))

  const rows = await db
    .select()
    .from(changelogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(changelogs.publishedAt), desc(changelogs.createdAt), desc(changelogs.id))

  return rows.map((row) => ({
    ...row,
    status: row.status as ChangelogStatus,
  }))
}

export async function upsertChangelog(
  db: DB,
  input: {
    id?: string
    version: string
    locale?: string
    title: string
    content: string
    status?: ChangelogStatus
  },
): Promise<ChangelogRecord> {
  const version = input.version.trim()
  const locale = (input.locale ?? 'zh').trim()
  const status: ChangelogStatus = input.status ?? 'published'
  const now = new Date()

  const existingRows = await db
    .select()
    .from(changelogs)
    .where(
      input.id
        ? eq(changelogs.id, input.id)
        : and(eq(changelogs.locale, locale), eq(changelogs.version, version)),
    )
    .limit(1)

  const existing = existingRows[0]
  if (existing) {
    const publishedAt =
      status === 'published' ? (existing.publishedAt ?? now) : existing.publishedAt
    await db
      .update(changelogs)
      .set({
        version,
        locale,
        title: input.title.trim(),
        content: input.content,
        status,
        publishedAt,
        updatedAt: now,
      })
      .where(eq(changelogs.id, existing.id))

    return {
      id: existing.id,
      version,
      locale,
      title: input.title.trim(),
      content: input.content,
      status,
      publishedAt,
      createdAt: existing.createdAt,
      updatedAt: now,
    }
  }

  const id = `chg_${crypto.randomUUID()}`
  const publishedAt = status === 'published' ? now : null
  const created: ChangelogRecord = {
    id,
    version,
    locale,
    title: input.title.trim(),
    content: input.content,
    status,
    publishedAt,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(changelogs).values(created)
  return created
}

const upsertChangelogSchema = z.object({
  id: z.string().optional(),
  version: z.string().trim().min(1).max(40),
  locale: z.enum(['zh', 'en']).default('zh'),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  status: z.enum(['draft', 'published']).default('published'),
})

export const saveAdminChangelog = createServerFn({ method: 'POST' })
  .validator((input: unknown) => upsertChangelogSchema.parse(input))
  .handler(async ({ data }): Promise<ChangelogRecord> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db, adminId } = await requirePermissionDb('admin.content.write')
    const saved = await upsertChangelog(db, data)
    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: 'cms.changelog.save',
      targetType: 'changelog',
      targetId: saved.id,
      summary: `保存更新日志 ${saved.version} (${saved.title})`,
    })
    return saved
  })

/** 管理台内容页一次性加载文章、更新日志与分类标签（需 `admin.content.read`）。 */
export const fetchAdminContentOverview = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{
    posts: PostRecord[]
    changelogs: ChangelogRecord[]
    taxonomies: TaxonomyRecord[]
  }> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db } = await requirePermissionDb('admin.content.read')
    const [postList, changelogList, taxonomyList] = await Promise.all([
      listPosts(db),
      listChangelogs(db),
      listTaxonomies(db),
    ])
    return {
      posts: postList,
      changelogs: changelogList,
      taxonomies: taxonomyList,
    }
  },
)
