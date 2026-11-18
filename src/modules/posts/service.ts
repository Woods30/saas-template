import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { DB } from '@/core/db'
import { posts } from '@/core/db/schema'
import { safeRecordAuditLog } from '@/modules/audit/service'

export type PostStatus = 'draft' | 'published'

export interface PostRecord {
  id: string
  slug: string
  locale: string
  title: string
  description: string
  content: string
  categorySlug: string | null
  tags: string[]
  status: PostStatus
  authorName: string
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function parseTags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function toPostRecord(row: typeof posts.$inferSelect): PostRecord {
  return {
    ...row,
    tags: parseTags(row.tags),
    status: row.status as PostStatus,
  }
}

export async function listPosts(
  db: DB,
  filter: { locale?: string; status?: PostStatus } = {},
): Promise<PostRecord[]> {
  const conditions = []
  if (filter.locale) conditions.push(eq(posts.locale, filter.locale))
  if (filter.status) conditions.push(eq(posts.status, filter.status))

  const rows = await db
    .select()
    .from(posts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt), desc(posts.id))

  return rows.map(toPostRecord)
}

export async function upsertPost(
  db: DB,
  input: {
    id?: string
    slug: string
    locale?: string
    title: string
    description?: string
    content: string
    categorySlug?: string | null
    tags?: string[]
    status?: PostStatus
    authorName?: string
  },
): Promise<PostRecord> {
  const slug = input.slug.trim().toLowerCase()
  const locale = (input.locale ?? 'zh').trim()
  const status: PostStatus = input.status ?? 'published'
  const now = new Date()

  const existingRows = await db
    .select()
    .from(posts)
    .where(input.id ? eq(posts.id, input.id) : and(eq(posts.locale, locale), eq(posts.slug, slug)))
    .limit(1)

  const existing = existingRows[0]
  const tagsJson = JSON.stringify(input.tags ?? [])

  if (existing) {
    const publishedAt =
      status === 'published' ? (existing.publishedAt ?? now) : existing.publishedAt
    await db
      .update(posts)
      .set({
        slug,
        locale,
        title: input.title.trim(),
        description: (input.description ?? '').trim(),
        content: input.content,
        categorySlug: input.categorySlug ?? null,
        tags: tagsJson,
        status,
        authorName: input.authorName?.trim() || existing.authorName,
        publishedAt,
        updatedAt: now,
      })
      .where(eq(posts.id, existing.id))

    return {
      id: existing.id,
      slug,
      locale,
      title: input.title.trim(),
      description: (input.description ?? '').trim(),
      content: input.content,
      categorySlug: input.categorySlug ?? null,
      tags: input.tags ?? [],
      status,
      authorName: input.authorName?.trim() || existing.authorName,
      publishedAt,
      createdAt: existing.createdAt,
      updatedAt: now,
    }
  }

  const id = `post_${crypto.randomUUID()}`
  const publishedAt = status === 'published' ? now : null
  const row: typeof posts.$inferInsert = {
    id,
    slug,
    locale,
    title: input.title.trim(),
    description: (input.description ?? '').trim(),
    content: input.content,
    categorySlug: input.categorySlug ?? null,
    tags: tagsJson,
    status,
    authorName: input.authorName?.trim() || 'Admin',
    publishedAt,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(posts).values(row)
  return {
    id,
    slug,
    locale,
    title: row.title,
    description: row.description ?? '',
    content: row.content,
    categorySlug: row.categorySlug ?? null,
    tags: input.tags ?? [],
    status,
    authorName: row.authorName ?? 'Admin',
    publishedAt,
    createdAt: now,
    updatedAt: now,
  }
}

export async function deletePost(db: DB, id: string): Promise<void> {
  await db.delete(posts).where(eq(posts.id, id))
}

const upsertPostSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  locale: z.enum(['zh', 'en']).default('zh'),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).default(''),
  content: z.string().trim().min(1),
  categorySlug: z.string().trim().max(60).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  status: z.enum(['draft', 'published']).default('published'),
})

export const saveAdminPost = createServerFn({ method: 'POST' })
  .validator((input: unknown) => upsertPostSchema.parse(input))
  .handler(async ({ data }): Promise<PostRecord> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db, adminId } = await requirePermissionDb('admin.content.write')
    const saved = await upsertPost(db, data)
    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: 'cms.post.save',
      targetType: 'post',
      targetId: saved.id,
      summary: `保存文章 ${saved.title} (${saved.slug})`,
    })
    return saved
  })

const deletePostSchema = z.object({
  id: z.string().trim().min(1),
})

export const removeAdminPost = createServerFn({ method: 'POST' })
  .validator((input: unknown) => deletePostSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db, adminId } = await requirePermissionDb('admin.content.write')
    await deletePost(db, data.id)
    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: 'cms.post.delete',
      targetType: 'post',
      targetId: data.id,
      summary: `删除文章 ${data.id}`,
    })
    return { ok: true }
  })
