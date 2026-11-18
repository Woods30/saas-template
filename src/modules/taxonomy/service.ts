import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { DB } from '@/core/db'
import { taxonomies } from '@/core/db/schema'
import { safeRecordAuditLog } from '@/modules/audit/service'
import { DEFAULT_TAXONOMIES, type TaxonomySeed, type TaxonomyType, taxonomyIdOf } from './catalog'

export { DEFAULT_TAXONOMIES, type TaxonomySeed, type TaxonomyType, taxonomyIdOf }

export interface TaxonomyRecord {
  id: string
  type: TaxonomyType
  slug: string
  name: string
  description: string | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

/** 幂等初始化默认分类与标签。 */
export async function ensureDefaultTaxonomies(db: DB): Promise<void> {
  const existing = await db
    .select({ type: taxonomies.type, slug: taxonomies.slug })
    .from(taxonomies)
  const existingKeys = new Set(existing.map((item) => `${item.type}:${item.slug}`))
  const now = new Date()

  const missing = DEFAULT_TAXONOMIES.filter(
    (seed) => !existingKeys.has(`${seed.type}:${seed.slug}`),
  ).map((seed) => ({
    id: taxonomyIdOf(seed.type, seed.slug),
    type: seed.type,
    slug: seed.slug,
    name: seed.name,
    description: seed.description,
    sortOrder: seed.sortOrder,
    createdAt: now,
    updatedAt: now,
  }))

  if (missing.length > 0) {
    await db.insert(taxonomies).values(missing).onConflictDoNothing()
  }
}

export async function listTaxonomies(db: DB, type?: TaxonomyType): Promise<TaxonomyRecord[]> {
  await ensureDefaultTaxonomies(db)
  const rows = await db
    .select()
    .from(taxonomies)
    .where(type ? eq(taxonomies.type, type) : undefined)
    .orderBy(asc(taxonomies.sortOrder), asc(taxonomies.slug))

  return rows.map((row) => ({
    ...row,
    type: row.type as TaxonomyType,
  }))
}

export async function upsertTaxonomy(
  db: DB,
  input: {
    id?: string
    type: TaxonomyType
    slug: string
    name: string
    description?: string | null
    sortOrder?: number
  },
): Promise<TaxonomyRecord> {
  const normalizedSlug = input.slug.trim().toLowerCase()
  const now = new Date()

  const existingRows = await db
    .select()
    .from(taxonomies)
    .where(
      input.id
        ? eq(taxonomies.id, input.id)
        : and(eq(taxonomies.type, input.type), eq(taxonomies.slug, normalizedSlug)),
    )
    .limit(1)

  const existing = existingRows[0]
  if (existing) {
    const updated: TaxonomyRecord = {
      ...existing,
      type: input.type,
      slug: normalizedSlug,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      updatedAt: now,
    }
    await db
      .update(taxonomies)
      .set({
        type: updated.type,
        slug: updated.slug,
        name: updated.name,
        description: updated.description,
        sortOrder: updated.sortOrder,
        updatedAt: updated.updatedAt,
      })
      .where(eq(taxonomies.id, existing.id))
    return updated
  }

  const created: TaxonomyRecord = {
    id: taxonomyIdOf(input.type, normalizedSlug),
    type: input.type,
    slug: normalizedSlug,
    name: input.name.trim(),
    description: input.description?.trim() ?? null,
    sortOrder: input.sortOrder ?? 100,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(taxonomies).values(created)
  return created
}

export async function deleteTaxonomy(db: DB, id: string): Promise<void> {
  await db.delete(taxonomies).where(eq(taxonomies.id, id))
}

const upsertTaxonomySchema = z.object({
  id: z.string().optional(),
  type: z.enum(['category', 'tag']).default('category'),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(100),
})

export const saveAdminTaxonomy = createServerFn({ method: 'POST' })
  .validator((input: unknown) => upsertTaxonomySchema.parse(input))
  .handler(async ({ data }): Promise<TaxonomyRecord> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db, adminId } = await requirePermissionDb('admin.content.write')
    const saved = await upsertTaxonomy(db, data)
    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: 'cms.taxonomy.save',
      targetType: 'taxonomy',
      targetId: saved.id,
      summary: `保存分类/标签 ${saved.name} (${saved.slug})`,
    })
    return saved
  })
