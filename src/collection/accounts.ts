/**
 * 收款账户解析：源码配置兜底，D1 里的运营记录按 ID 覆盖。
 *
 * 数据库只存「覆盖」，不复制源码默认值：没有对应行的账户用配置里的值；
 * 有对应行的账户用数据库里的显示名与 R2 key，但被禁用的账户不参与分配，
 * 解析会继续找下一个可用账户。
 */

import type {
  CollectionAccountConfig,
  CollectionChannel,
  ResolvedCollectionAccount,
} from '@/collection/types'
import { type DB, schema } from '@/db'

/** 解析收款账户所需的配置片段。 */
export interface CollectionAccountSettings {
  accounts: CollectionAccountConfig[]
}

/**
 * 解析当前可用的收款账户。
 *
 * 遍历配置里的账户，顺序即优先级：
 * - 数据库里存在同 ID 且被禁用 → 跳过该账户，继续找下一个；
 * - 数据库里存在同 ID → 用数据库的显示名与 R2 key 覆盖配置；
 * - 数据库里没有 → 用配置兜底。
 *
 * 数据库里存在但配置里没有的 ID 不参与解析：数据库只是覆盖，不是账户清单。
 */
export async function resolveCollectionAccount(
  db: DB,
  config: CollectionAccountSettings,
): Promise<ResolvedCollectionAccount | null> {
  const overrides = await db.select().from(schema.collectionAccounts)
  const overridesById = new Map(overrides.map((row) => [row.id, row]))

  for (const account of config.accounts) {
    const override = overridesById.get(account.id)
    if (override && !override.enabled) continue
    if (!override) {
      return {
        id: account.id,
        channel: account.channel,
        displayName: account.displayName,
        currency: account.currency,
        qrImageUrl: account.qrImageUrl,
        qrImageKey: null,
      }
    }
    return {
      id: account.id,
      channel: override.channel as CollectionChannel,
      displayName: override.displayName,
      currency: override.currency as 'cny',
      qrImageUrl: account.qrImageUrl,
      qrImageKey: override.qrImageKey,
    }
  }
  return null
}
