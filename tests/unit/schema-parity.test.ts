import { getTableColumns, getTableName, isTable } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as postgres from '../../src/core/db/schema.postgres'
import * as sqlite from '../../src/core/db/schema.sqlite'

/**
 * 两份手写 schema 必须逐表逐列对齐。
 *
 * 它们是两个独立模块（`sqlite-core` 与 `pg-core` 的表定义不通用），漂移不会有类型
 * 报错，只会在生产上报「column does not exist」。所以把对齐做成测试。
 */

type AnySchema = Record<string, unknown>

const tablesOf = (schema: AnySchema) =>
  Object.entries(schema)
    .filter(([, value]) => isTable(value))
    .map(([exportName, table]) => ({
      exportName,
      tableName: getTableName(table as Parameters<typeof getTableColumns>[0]),
      columns: Object.keys(getTableColumns(table as Parameters<typeof getTableColumns>[0])).sort(),
    }))
    .sort((a, b) => a.exportName.localeCompare(b.exportName))

describe('sqlite 与 postgres schema 一致性', () => {
  const sqliteTables = tablesOf(sqlite as AnySchema)
  const postgresTables = tablesOf(postgres as AnySchema)

  it('两边的表集合相同', () => {
    expect(postgresTables.map((t) => t.exportName)).toEqual(sqliteTables.map((t) => t.exportName))
  })

  it('两边的表名相同', () => {
    expect(postgresTables.map((t) => t.tableName)).toEqual(sqliteTables.map((t) => t.tableName))
  })

  it('两边的列集合逐表相同', () => {
    for (const sqliteTable of sqliteTables) {
      const postgresTable = postgresTables.find((t) => t.exportName === sqliteTable.exportName)
      expect(postgresTable?.columns, `表 ${sqliteTable.exportName} 的列不一致`).toEqual(
        sqliteTable.columns,
      )
    }
  })

  it('关键表都存在', () => {
    const names = sqliteTables.map((t) => t.exportName)
    for (const expected of [
      'users',
      'sessions',
      'accounts',
      'verifications',
      'subscriptions',
      'payments',
      'checkoutReservations',
      'files',
      'apikey',
      'newsletterSubscriptions',
      'webhookEvents',
      'settings',
      'creditBalances',
      'creditGrants',
      'creditTransactions',
      'creditAllocations',
      'usageRecords',
      'entitlements',
      'plans',
      'planEntitlements',
      'userEntitlements',
      'collectionAccounts',
      'collectionOrders',
      'roles',
      'permissions',
      'rolePermissions',
      'userRoles',
      'auditLogs',
    ]) {
      expect(names).toContain(expected)
    }
  })
})
