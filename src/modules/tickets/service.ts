import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { DB } from '@/core/db'
import { tickets, users } from '@/core/db/schema'
import { safeRecordAuditLog } from '@/modules/audit/service'

export type TicketPriority = 'low' | 'normal' | 'high'
export type TicketStatus = 'open' | 'replied' | 'closed'

export interface TicketRecord {
  id: string
  userId: string
  subject: string
  category: string
  priority: TicketPriority
  content: string
  status: TicketStatus
  adminReply: string | null
  repliedBy: string | null
  repliedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface AdminTicketItem extends TicketRecord {
  userEmail: string | null
}

export async function createTicket(
  db: DB,
  input: {
    userId: string
    subject: string
    category?: string
    priority?: TicketPriority
    content: string
  },
): Promise<TicketRecord> {
  const now = new Date()
  const row: TicketRecord = {
    id: `tkt_${crypto.randomUUID()}`,
    userId: input.userId,
    subject: input.subject.trim(),
    category: (input.category ?? 'general').trim(),
    priority: input.priority ?? 'normal',
    content: input.content.trim(),
    status: 'open',
    adminReply: null,
    repliedBy: null,
    repliedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(tickets).values(row)
  return row
}

export async function replyOrCloseTicket(
  db: DB,
  input: {
    ticketId: string
    adminId: string
    adminReply?: string
    status?: TicketStatus
  },
): Promise<TicketRecord> {
  const rows = await db.select().from(tickets).where(eq(tickets.id, input.ticketId)).limit(1)
  const existing = rows[0]
  if (!existing) {
    throw new Error(`TICKET_NOT_FOUND: ${input.ticketId}`)
  }

  const now = new Date()
  const adminReply =
    input.adminReply !== undefined ? input.adminReply.trim() || null : existing.adminReply
  const status: TicketStatus =
    input.status ?? (adminReply ? 'replied' : (existing.status as TicketStatus))
  const repliedAt = adminReply ? now : existing.repliedAt
  const repliedBy = adminReply ? input.adminId : existing.repliedBy

  await db
    .update(tickets)
    .set({
      adminReply,
      status,
      repliedBy,
      repliedAt,
      updatedAt: now,
    })
    .where(eq(tickets.id, existing.id))

  return {
    ...existing,
    priority: existing.priority as TicketPriority,
    status,
    adminReply,
    repliedBy,
    repliedAt,
    updatedAt: now,
  }
}

export async function listAdminTickets(
  db: DB,
  filter: { status?: string } = {},
): Promise<AdminTicketItem[]> {
  const conditions = []
  if (filter.status && filter.status !== 'all') {
    conditions.push(eq(tickets.status, filter.status))
  }

  const rows = await db
    .select({
      id: tickets.id,
      userId: tickets.userId,
      userEmail: users.email,
      subject: tickets.subject,
      category: tickets.category,
      priority: tickets.priority,
      content: tickets.content,
      status: tickets.status,
      adminReply: tickets.adminReply,
      repliedBy: tickets.repliedBy,
      repliedAt: tickets.repliedAt,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
    })
    .from(tickets)
    .leftJoin(users, eq(tickets.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tickets.createdAt), desc(tickets.id))

  return rows.map((row) => ({
    ...row,
    userEmail: row.userEmail ?? null,
    priority: row.priority as TicketPriority,
    status: row.status as TicketStatus,
  }))
}

const createAdminDemoTicketSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(40).default('billing'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  content: z.string().trim().min(1).max(2000),
})

export const createAdminTicket = createServerFn({ method: 'POST' })
  .validator((input: unknown) => createAdminDemoTicketSchema.parse(input))
  .handler(async ({ data }): Promise<TicketRecord> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db, adminId } = await requirePermissionDb('admin.tickets.write')
    const created = await createTicket(db, {
      userId: adminId,
      subject: data.subject,
      category: data.category,
      priority: data.priority,
      content: data.content,
    })
    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: 'tickets.create',
      targetType: 'ticket',
      targetId: created.id,
      summary: `提交工单 ${created.subject}`,
    })
    return created
  })

const replyTicketSchema = z.object({
  ticketId: z.string().trim().min(1),
  adminReply: z.string().trim().max(2000).optional(),
  status: z.enum(['open', 'replied', 'closed']).optional(),
})

export const updateAdminTicket = createServerFn({ method: 'POST' })
  .validator((input: unknown) => replyTicketSchema.parse(input))
  .handler(async ({ data }): Promise<TicketRecord> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db, adminId } = await requirePermissionDb('admin.tickets.write')
    const updated = await replyOrCloseTicket(db, {
      ticketId: data.ticketId,
      adminId,
      adminReply: data.adminReply,
      status: data.status,
    })
    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: 'tickets.reply',
      targetType: 'ticket',
      targetId: updated.id,
      summary: `处理工单 ${updated.subject} -> ${updated.status}`,
    })
    return updated
  })
