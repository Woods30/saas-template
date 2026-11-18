import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, like, or } from 'drizzle-orm'
import { z } from 'zod'
import {
  type AiMediaType,
  type AiProvider,
  type AiTaskStatus,
  createMockAiProvider,
  getAiProvider,
} from '@/core/ai'
import type { DB } from '@/core/db'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/db/paging'
import { aiTasks, users } from '@/core/db/schema'
import { safeRecordAuditLog } from '@/modules/audit/service'
import { consumeCredits, grantCredits, refundCredits } from '@/modules/credits/service'

export interface AiTaskRecord {
  id: string
  userId: string
  mediaType: AiMediaType
  provider: string
  model: string
  prompt: string
  options: string | null
  status: AiTaskStatus
  providerTaskId: string | null
  output: string | null
  errorMessage: string | null
  costCredits: number
  creditTxId: string | null
  refundTxId: string | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface AdminAiTaskItem extends AiTaskRecord {
  userEmail: string | null
}

export interface CreateAiTaskInput {
  userId: string
  mediaType: AiMediaType
  provider: string
  model: string
  prompt: string
  options?: Record<string, unknown>
  costCredits?: number
  providerInstance?: AiProvider
}

function serializeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

async function revokeTaskCreditsIfNeeded(
  db: DB,
  task: {
    id: string
    userId: string
    costCredits: number
    creditTxId: string | null
    refundTxId: string | null
  },
): Promise<string | null> {
  if (task.refundTxId) return task.refundTxId
  if (!task.creditTxId || task.costCredits <= 0) return null

  const refund = await refundCredits(db, {
    userId: task.userId,
    amount: task.costCredits,
    reference: `ai-task-revoke:${task.id}`,
    idempotencyKey: `ai-task-revoke:${task.id}`,
  })
  return refund.transaction.id
}

/**
 * 创建并提交 AI 任务：
 * 1. 若 `costCredits > 0`，先调用账本 `consumeCredits` 预扣积分（余额不足直接抛 `InsufficientCreditsError`）；
 * 2. 调用 `core/ai` provider 提交生成请求；
 * 3. 若提交当场失败或抛错，立即调用 `refundCredits` 自动退回预扣积分并标记为 `failed`。
 */
export async function createAiTask(db: DB, input: CreateAiTaskInput): Promise<AiTaskRecord> {
  const taskId = `ait_${crypto.randomUUID()}`
  const costCredits = Math.max(0, Math.trunc(input.costCredits ?? 0))
  const now = new Date()

  let creditTxId: string | null = null
  if (costCredits > 0) {
    const consumed = await consumeCredits(db, {
      userId: input.userId,
      amount: costCredits,
      reference: `ai-task:${taskId}`,
      idempotencyKey: `ai-task-consume:${taskId}`,
    })
    creditTxId = consumed.transaction.id
  }

  const provider = input.providerInstance ?? getAiProvider(input.provider)
  let status: AiTaskStatus = 'pending'
  let providerTaskId: string | null = null
  let output: string | null = null
  let errorMessage: string | null = null
  let refundTxId: string | null = null
  let completedAt: Date | null = null

  try {
    const generated = await provider.generate({
      mediaType: input.mediaType,
      model: input.model,
      prompt: input.prompt,
      options: input.options,
    })
    status = generated.status
    providerTaskId = generated.providerTaskId ?? null
    output = serializeJson(generated.output)
    errorMessage = generated.errorMessage ?? null
    if (status === 'succeeded') {
      completedAt = new Date()
    } else if (status === 'failed' || status === 'canceled') {
      completedAt = new Date()
      refundTxId = await revokeTaskCreditsIfNeeded(db, {
        id: taskId,
        userId: input.userId,
        costCredits,
        creditTxId,
        refundTxId: null,
      })
    }
  } catch (err) {
    status = 'failed'
    errorMessage = err instanceof Error ? err.message : 'AI provider error'
    completedAt = new Date()
    refundTxId = await revokeTaskCreditsIfNeeded(db, {
      id: taskId,
      userId: input.userId,
      costCredits,
      creditTxId,
      refundTxId: null,
    })
  }

  const row: AiTaskRecord = {
    id: taskId,
    userId: input.userId,
    mediaType: input.mediaType,
    provider: input.provider,
    model: input.model,
    prompt: input.prompt,
    options: input.options ? JSON.stringify(input.options) : null,
    status,
    providerTaskId,
    output,
    errorMessage,
    costCredits,
    creditTxId,
    refundTxId,
    completedAt,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(aiTasks).values(row)
  return row
}

async function getAiTaskById(db: DB, taskId: string): Promise<AiTaskRecord> {
  const rows = await db.select().from(aiTasks).where(eq(aiTasks.id, taskId)).limit(1)
  const row = rows[0]
  if (!row) {
    throw new Error(`AI_TASK_NOT_FOUND: ${taskId}`)
  }
  return {
    ...row,
    mediaType: row.mediaType as AiMediaType,
    status: row.status as AiTaskStatus,
  }
}

/**
 * 轮询并刷新异步 AI 任务状态：
 * - 已处于终态（`succeeded` / `failed` / `canceled`）的任务直接原样返回（幂等）；
 * - 若上游变为 `succeeded`，写入 `output` 与 `completedAt`；
 * - 若上游变为 `failed` 或 `canceled`，自动退回预扣积分并记录 `refundTxId`。
 */
export async function refreshAiTask(
  db: DB,
  input: {
    taskId: string
    providerInstance?: AiProvider
  },
): Promise<AiTaskRecord> {
  const current = await getAiTaskById(db, input.taskId)
  if (
    current.status === 'succeeded' ||
    current.status === 'failed' ||
    current.status === 'canceled'
  ) {
    return current
  }

  if (!current.providerTaskId) {
    return current
  }

  const provider = input.providerInstance ?? getAiProvider(current.provider)
  if (!provider.query) {
    return current
  }

  const polled = await provider.query({
    model: current.model,
    providerTaskId: current.providerTaskId,
  })

  const now = new Date()
  let refundTxId = current.refundTxId
  let completedAt = current.completedAt

  if (polled.status === 'succeeded') {
    completedAt = now
  } else if (polled.status === 'failed' || polled.status === 'canceled') {
    completedAt = now
    refundTxId = await revokeTaskCreditsIfNeeded(db, current)
  }

  const updated: AiTaskRecord = {
    ...current,
    status: polled.status,
    output: polled.output !== undefined ? serializeJson(polled.output) : current.output,
    errorMessage: polled.errorMessage ?? current.errorMessage,
    refundTxId,
    completedAt,
    updatedAt: now,
  }

  await db
    .update(aiTasks)
    .set({
      status: updated.status,
      output: updated.output,
      errorMessage: updated.errorMessage,
      refundTxId: updated.refundTxId,
      completedAt: updated.completedAt,
      updatedAt: updated.updatedAt,
    })
    .where(eq(aiTasks.id, current.id))

  return updated
}

/** 取消进行中的 AI 任务并幂等退回预扣积分。 */
export async function cancelAiTask(
  db: DB,
  input: {
    taskId: string
    reason?: string
  },
): Promise<AiTaskRecord> {
  const current = await getAiTaskById(db, input.taskId)
  if (
    current.status === 'succeeded' ||
    current.status === 'failed' ||
    current.status === 'canceled'
  ) {
    return current
  }

  const now = new Date()
  const refundTxId = await revokeTaskCreditsIfNeeded(db, current)
  const updated: AiTaskRecord = {
    ...current,
    status: 'canceled',
    errorMessage: input.reason ?? 'Task canceled',
    refundTxId,
    completedAt: now,
    updatedAt: now,
  }

  await db
    .update(aiTasks)
    .set({
      status: updated.status,
      errorMessage: updated.errorMessage,
      refundTxId: updated.refundTxId,
      completedAt: updated.completedAt,
      updatedAt: updated.updatedAt,
    })
    .where(eq(aiTasks.id, current.id))

  return updated
}

export interface QueryAdminAiTasksInput {
  status?: string
  mediaType?: string
  search?: string
  limit?: number
  offset?: number
}

/** 管理台分页查询 AI 任务列表（关联提交人邮箱）。 */
export async function queryAdminAiTasks(
  db: DB,
  input: QueryAdminAiTasksInput = {},
): Promise<{ tasks: AdminAiTaskItem[]; total: number }> {
  const conditions = []

  if (input.status && input.status !== 'all') {
    conditions.push(eq(aiTasks.status, input.status))
  }
  if (input.mediaType && input.mediaType !== 'all') {
    conditions.push(eq(aiTasks.mediaType, input.mediaType))
  }
  if (input.search?.trim()) {
    const pattern = `%${input.search.trim()}%`
    conditions.push(
      or(like(aiTasks.prompt, pattern), like(aiTasks.model, pattern), like(users.email, pattern)),
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  const offset = Math.max(input.offset ?? 0, 0)

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: aiTasks.id,
        userId: aiTasks.userId,
        userEmail: users.email,
        mediaType: aiTasks.mediaType,
        provider: aiTasks.provider,
        model: aiTasks.model,
        prompt: aiTasks.prompt,
        options: aiTasks.options,
        status: aiTasks.status,
        providerTaskId: aiTasks.providerTaskId,
        output: aiTasks.output,
        errorMessage: aiTasks.errorMessage,
        costCredits: aiTasks.costCredits,
        creditTxId: aiTasks.creditTxId,
        refundTxId: aiTasks.refundTxId,
        completedAt: aiTasks.completedAt,
        createdAt: aiTasks.createdAt,
        updatedAt: aiTasks.updatedAt,
      })
      .from(aiTasks)
      .leftJoin(users, eq(aiTasks.userId, users.id))
      .where(whereClause)
      .orderBy(desc(aiTasks.createdAt), desc(aiTasks.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(aiTasks)
      .leftJoin(users, eq(aiTasks.userId, users.id))
      .where(whereClause),
  ])

  return {
    tasks: rows.map((row) => ({
      ...row,
      userEmail: row.userEmail ?? null,
      mediaType: row.mediaType as AiMediaType,
      status: row.status as AiTaskStatus,
    })),
    total: Number(totalRows[0]?.value ?? 0),
  }
}

const adminTasksQuerySchema = z.object({
  status: z.string().trim().max(40).optional(),
  mediaType: z.string().trim().max(40).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
})

/** 获取后台 AI 任务分页列表（需 `admin.tasks.read`）。 */
export const fetchAdminAiTasks = createServerFn({ method: 'GET' })
  .validator((input: unknown) => adminTasksQuerySchema.parse(input))
  .handler(async ({ data }): Promise<{ tasks: AdminAiTaskItem[]; total: number }> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db } = await requirePermissionDb('admin.tasks.read')
    return queryAdminAiTasks(db, data)
  })

const createDemoTaskSchema = z.object({
  mediaType: z.enum(['text', 'image', 'video', 'audio', 'speech']).default('image'),
  model: z.string().trim().min(1).max(80).default('mock-flux-1'),
  prompt: z.string().trim().min(1).max(500),
  mode: z.enum(['sync-succeed', 'async-succeed', 'async-fail']).default('async-succeed'),
  costCredits: z.number().int().min(0).max(1000).default(10),
})

/** 在管理台发起一条沙箱/测试 AI 任务（自动为当前管理员补足演示积分以验证预扣与回滚）。 */
export const createDemoAdminAiTask = createServerFn({ method: 'POST' })
  .validator((input: unknown) => createDemoTaskSchema.parse(input))
  .handler(async ({ data }): Promise<AiTaskRecord> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db, adminId } = await requirePermissionDb('admin.tasks.read')

    if (data.costCredits > 0) {
      await grantCredits(db, {
        userId: adminId,
        amount: data.costCredits,
        source: 'admin',
        reference: 'ai-demo-topup',
        idempotencyKey: `ai-demo-topup:${adminId}:${Date.now()}:${crypto.randomUUID()}`,
      })
    }

    const providerInstance = createMockAiProvider({ mode: data.mode })
    const created = await createAiTask(db, {
      userId: adminId,
      mediaType: data.mediaType,
      provider: 'mock',
      model: data.model,
      prompt: data.prompt,
      costCredits: data.costCredits,
      providerInstance,
    })

    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: 'ai.task.create',
      targetType: 'ai_task',
      targetId: created.id,
      summary: `提交 AI 任务 ${created.model}（预扣 ${created.costCredits} 积分）`,
    })
    return created
  })

const taskActionSchema = z.object({
  taskId: z.string().trim().min(1),
})

/** 手动轮询刷新一条 AI 任务状态。 */
export const refreshAdminAiTask = createServerFn({ method: 'POST' })
  .validator((input: unknown) => taskActionSchema.parse(input))
  .handler(async ({ data }): Promise<AiTaskRecord> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db } = await requirePermissionDb('admin.tasks.read')
    return refreshAiTask(db, { taskId: data.taskId })
  })

/** 取消一条进行中的 AI 任务并退回预扣积分。 */
export const cancelAdminAiTask = createServerFn({ method: 'POST' })
  .validator((input: unknown) => taskActionSchema.parse(input))
  .handler(async ({ data }): Promise<AiTaskRecord> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db, adminId } = await requirePermissionDb('admin.tasks.read')
    const canceled = await cancelAiTask(db, {
      taskId: data.taskId,
      reason: `Canceled by admin ${adminId}`,
    })
    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: 'ai.task.cancel',
      targetType: 'ai_task',
      targetId: canceled.id,
      summary: `取消 AI 任务并退回 ${canceled.costCredits} 积分`,
    })
    return canceled
  })
