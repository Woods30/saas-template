import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createTestDatabase } from '../helpers/database'

/**
 * 订单与核销详情表的落地检查。
 *
 * 表结构的事实源是手写 schema，但运行期真正建出来的是迁移 SQL；两者漂移时
 * 业务代码只会在写数据时炸。这里直接查建好的内存库，确认新表、新列与新索引
 * 真的存在。
 */

const { sqlite } = createTestDatabase()

const columns = (db: DatabaseSync, table: string): string[] =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => String(row.name))

const indexes = (db: DatabaseSync, table: string): string[] =>
  db
    .prepare(`PRAGMA index_list(${table})`)
    .all()
    .map((row) => String(row.name))

describe('orders / manual_payment_details schema', () => {
  it('orders 记录结账尝试的订单号', () => {
    expect(columns(sqlite, 'orders')).toContain('order_no')
  })

  it('manual_payment_details 保存核销的应付金额', () => {
    expect(columns(sqlite, 'manual_payment_details')).toContain('payable_amount')
  })

  it('payments 通过 order_id 关联订单', () => {
    expect(columns(sqlite, 'payments')).toContain('order_id')
  })

  it('users 保存首次归因来源', () => {
    expect(columns(sqlite, 'users')).toContain('utm_source')
  })

  it('核销详情表带金额唯一索引与结算临界区索引', () => {
    expect(indexes(sqlite, 'manual_payment_details')).toContain(
      'manual_payment_details_active_amount_unique',
    )
    expect(indexes(sqlite, 'manual_payment_details')).toContain(
      'manual_payment_details_settling_user_unique',
    )
  })
})
