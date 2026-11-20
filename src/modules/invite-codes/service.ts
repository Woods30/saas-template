import { createServerFn } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { DB } from '@/core/db'
import { inviteCodes } from '@/core/db/schema'
import { safeRecordAuditLog } from '@/modules/audit/service'
import { grantCredits } from '@/modules/credits/service'
import { type AdminTicketItem, listAdminTickets } from '@/modules/tickets/service'

export type InviteCodeStatus = 'active' | 'disabled'

export interface InviteCodeRecord {
  id: string
  code: string
  bonusCredits: number
  maxUses: number
  usedCount: number
  status: InviteCodeStatus
  expiresAt: Date | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export async function createInviteCode(
  db: DB,
  input: {
    code: string
    bonusCredits?: number
    maxUses?: number
    expiresAt?: Date | null
    createdBy?: string | null
  },
): Promise<InviteCodeRecord> {
  const normalizedCode = input.code.trim().toUpperCase()
  const now = new Date()
  const row: InviteCodeRecord = {
    id: `inv_${crypto.randomUUID()}`,
    code: normalizedCode,
    bonusCredits: Math.max(0, Math.trunc(input.bonusCredits ?? 0)),
    maxUses: Math.max(1, Math.trunc(input.maxUses ?? 1)),
    usedCount: 0,
    status: 'active',
    expiresAt: input.expiresAt ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(inviteCodes).values(row)
  return row
}

/** 兑换邀请码并向目标用户发放奖励积分。 */
export async function redeemInviteCode(
  db: DB,
  input: {
    userId: string
    code: string
    now?: Date
  },
): Promise<InviteCodeRecord> {
  const normalizedCode = input.code.trim().toUpperCase()
  const now = input.now ?? new Date()

  const rows = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, normalizedCode))
    .limit(1)
  const existing = rows[0]
  if (!existing) {
    throw new Error('INVITE_CODE_NOT_FOUND')
  }
  if (existing.status !== 'active') {
    throw new Error('INVITE_CODE_DISABLED')
  }
  if (existing.expiresAt && existing.expiresAt.getTime() <= now.getTime()) {
    throw new Error('INVITE_CODE_EXPIRED')
  }
  if (existing.usedCount >= existing.maxUses) {
    throw new Error('INVITE_CODE_EXHAUSTED')
  }

  const nextUsedCount = existing.usedCount + 1
  await db
    .update(inviteCodes)
    .set({
      usedCount: nextUsedCount,
      updatedAt: now,
    })
    .where(eq(inviteCodes.id, existing.id))

  if (existing.bonusCredits > 0) {
    await grantCredits(db, {
      userId: input.userId,
      amount: existing.bonusCredits,
      source: 'bonus',
      reference: `invite:${existing.code}`,
      idempotencyKey: `invite-redeem:${existing.id}:${input.userId}`,
    })
  }

  return {
    ...existing,
    status: existing.status as InviteCodeStatus,
    usedCount: nextUsedCount,
    updatedAt: now,
  }
}

export async function listInviteCodes(db: DB): Promise<InviteCodeRecord[]> {
  const rows = await db
    .select()
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt), desc(inviteCodes.id))
  return rows.map((row) => ({
    ...row,
    status: row.status as InviteCodeStatus,
  }))
}

const createInviteSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/),
  bonusCredits: z.number().int().min(0).max(10000).default(50),
  maxUses: z.number().int().min(1).max(10000).default(10),
})

export const saveAdminInviteCode = createServerFn({ method: 'POST' })
  .validator((input: unknown) => createInviteSchema.parse(input))
  .handler(async ({ data }): Promise<InviteCodeRecord> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db, adminId } = await requirePermissionDb('admin.tickets.write')
    const created = await createInviteCode(db, {
      code: data.code,
      bonusCredits: data.bonusCredits,
      maxUses: data.maxUses,
      createdBy: adminId,
    })
    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: 'invite.create',
      targetType: 'invite_code',
      targetId: created.id,
      summary: `创建邀请码 ${created.code}（赠 ${created.bonusCredits} 积分，上限 ${created.maxUses} 次）`,
    })
    return created
  })

/** 运营与客服页一次性加载工单队列与邀请码列表（需 `admin.tickets.read`）。 */
export const fetchAdminTicketsAndInvites = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{
    tickets: AdminTicketItem[]
    inviteCodes: InviteCodeRecord[]
  }> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db } = await requirePermissionDb('admin.tickets.read')
    const [ticketList, inviteList] = await Promise.all([listAdminTickets(db), listInviteCodes(db)])
    return {
      tickets: ticketList,
      inviteCodes: inviteList,
    }
  },
)
