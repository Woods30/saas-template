import { describe, expect, it } from 'vitest'
import { queryAuditLogs, recordAuditLog, safeRecordAuditLog } from '../../src/modules/audit/service'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 审计日志：只追加不修改，覆盖后台写操作与关键认证 / 支付事件。
 *
 * 两条硬规则：
 * - `safeRecordAuditLog` 在数据库异常时绝不向外抛错（不能让审计失败中断已落库的业务写入）；
 * - 查询支持按操作名、操作人、目标类型与关键词过滤，并按时间倒序返回持有人邮箱。
 */
describe('recordAuditLog & queryAuditLogs', () => {
  it('写入审计日志并连带操作人邮箱查询返回', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'admin_1')

    const entry = await recordAuditLog(db, {
      actorId: 'admin_1',
      actorType: 'admin',
      operation: 'credits.grant',
      targetType: 'user',
      targetId: 'user_42',
      summary: '手工发放 500 积分（首单补偿）',
      ipAddress: '127.0.0.1',
    })

    expect(entry.id).toBeTruthy()
    expect(entry.actorId).toBe('admin_1')
    expect(entry.operation).toBe('credits.grant')
    expect(entry.targetType).toBe('user')
    expect(entry.targetId).toBe('user_42')

    const page = await queryAuditLogs(db, {})
    expect(page.total).toBe(1)
    expect(page.logs[0]).toMatchObject({
      id: entry.id,
      actorId: 'admin_1',
      actorEmail: 'admin_1@example.com',
      actorType: 'admin',
      operation: 'credits.grant',
      targetType: 'user',
      targetId: 'user_42',
      summary: '手工发放 500 积分（首单补偿）',
      ipAddress: '127.0.0.1',
    })
  })

  it('支持按 operation、targetType 与关键词过滤', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'admin_1')

    await recordAuditLog(db, {
      actorId: 'admin_1',
      actorType: 'admin',
      operation: 'rbac.role.create',
      targetType: 'role',
      targetId: 'role_support',
      summary: '新建角色 support',
    })
    await recordAuditLog(db, {
      actorId: null,
      actorType: 'system',
      operation: 'payment.settled',
      targetType: 'order',
      targetId: 'ord_99',
      summary: 'Stripe 结算 $99.00',
    })

    const byOp = await queryAuditLogs(db, { operation: 'payment.settled' })
    expect(byOp.total).toBe(1)
    expect(byOp.logs[0]?.targetId).toBe('ord_99')

    const byTarget = await queryAuditLogs(db, { targetType: 'role' })
    expect(byTarget.total).toBe(1)
    expect(byTarget.logs[0]?.operation).toBe('rbac.role.create')

    const bySearch = await queryAuditLogs(db, { search: 'support' })
    expect(bySearch.total).toBe(1)
    expect(bySearch.logs[0]?.targetId).toBe('role_support')
  })

  it('safeRecordAuditLog 在外键或连接异常时返回 null 而不抛错', async () => {
    const { sqlite, db } = createTestDatabase()
    sqlite.exec('PRAGMA foreign_keys = ON;')
    // actor_id 指向不存在的 user 会触发外键约束错误，safe 封装必须吞掉并返回 null。
    const result = await safeRecordAuditLog(db, {
      actorId: 'non_existent_user',
      operation: 'settings.save',
    })
    expect(result).toBeNull()
  })
})
