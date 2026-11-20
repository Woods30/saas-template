import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, like, or } from 'drizzle-orm'
import { z } from 'zod'
import type { DB } from '@/core/db'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/db/paging'
import { auditLogs, users } from '@/core/db/schema'

export type AuditActorType = 'user' | 'admin' | 'system' | 'apikey'

export interface RecordAuditLogInput {
  actorId?: string | null
  actorType?: AuditActorType
  operation: string
  targetType?: string | null
  targetId?: string | null
  summary?: string | null
  ipAddress?: string | null
  createdAt?: Date
}

export interface AuditLogRecord {
  id: string
  actorId: string | null
  actorType: string
  operation: string
  targetType: string | null
  targetId: string | null
  summary: string | null
  ipAddress: string | null
  createdAt: Date
}

export interface AuditLogItem extends AuditLogRecord {
  actorEmail: string | null
  actorName: string | null
}

export interface QueryAuditLogsInput {
  operation?: string
  actorId?: string
  targetType?: string
  search?: string
  limit?: number
  offset?: number
}

/** 写入一条审计日志（只追加不修改）。 */
export async function recordAuditLog(db: DB, input: RecordAuditLogInput): Promise<AuditLogRecord> {
  const id = crypto.randomUUID()
  const createdAt = input.createdAt ?? new Date()
  const row: AuditLogRecord = {
    id,
    actorId: input.actorId ?? null,
    actorType: input.actorType ?? 'admin',
    operation: input.operation,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    summary: input.summary ?? null,
    ipAddress: input.ipAddress ?? null,
    createdAt,
  }
  await db.insert(auditLogs).values(row)
  return row
}

/**
 * 安全写入审计日志：任何数据库异常均被吞掉并返回 `null`，
 * 确保审计写入失败不会中断已提交的主业务流程。
 */
export async function safeRecordAuditLog(
  db: DB,
  input: RecordAuditLogInput,
): Promise<AuditLogRecord | null> {
  try {
    return await recordAuditLog(db, input)
  } catch {
    return null
  }
}

/** 分页查询审计日志，按时间倒序并关联操作人邮箱与名称。 */
export async function queryAuditLogs(
  db: DB,
  input: QueryAuditLogsInput = {},
): Promise<{ logs: AuditLogItem[]; total: number }> {
  const conditions = []

  if (input.operation?.trim()) {
    conditions.push(eq(auditLogs.operation, input.operation.trim()))
  }
  if (input.actorId?.trim()) {
    conditions.push(eq(auditLogs.actorId, input.actorId.trim()))
  }
  if (input.targetType?.trim()) {
    conditions.push(eq(auditLogs.targetType, input.targetType.trim()))
  }
  if (input.search?.trim()) {
    const pattern = `%${input.search.trim()}%`
    conditions.push(
      or(
        like(auditLogs.operation, pattern),
        like(auditLogs.targetId, pattern),
        like(auditLogs.summary, pattern),
        like(users.email, pattern),
      ),
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  const offset = Math.max(input.offset ?? 0, 0)

  const totalRows = await db
    .select({ value: count() })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .where(whereClause)

  const rows = await db
    .select({
      id: auditLogs.id,
      actorId: auditLogs.actorId,
      actorEmail: users.email,
      actorName: users.name,
      actorType: auditLogs.actorType,
      operation: auditLogs.operation,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      summary: auditLogs.summary,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit)
    .offset(offset)

  return {
    logs: rows.map((row) => ({
      ...row,
      actorEmail: row.actorEmail ?? null,
      actorName: row.actorName ?? null,
    })),
    total: Number(totalRows[0]?.value ?? 0),
  }
}

const adminAuditQuerySchema = z.object({
  operation: z.string().trim().max(120).optional(),
  targetType: z.string().trim().max(80).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
})

/** 管理台审计日志查询 server function（需 `admin.audit.read` 权限）。 */
export const fetchAdminAuditLogs = createServerFn({ method: 'GET' })
  .validator((input: unknown) => adminAuditQuerySchema.parse(input))
  .handler(async ({ data }): Promise<{ logs: AuditLogItem[]; total: number }> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db } = await requirePermissionDb('admin.audit.read')
    return queryAuditLogs(db, data)
  })
