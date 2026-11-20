import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 核销型支付的命名守卫。
 *
 * `collection` 是本模块的旧名字，重构后统一为 `manualPayments` /
 * `manual_payments` / `manual-payment`（文件与路径）。这里扫描业务、配置、
 * 类型与中文消息，防止旧标识符在后续任务里被重新引入。
 *
 * 允许的例外只有 `content-collections` 与 `normalize-content-collections`
 * ——它们属于内容集合（博客 / 文档），与本模块无关；历史 ADR 文案不在此扫描范围。
 */
const LEGACY =
  /\bCollection(Order|Error|Review|Price|Account|Channel|Status)\b|\bcollection(Accounts|Orders|Prices|ConfigErrors|AccountJson|PayerNote|SubscriptionId|SettlementEventId|QrSrc|OrderErrorMessage)\b|COLLECTION_|'collection'|"collection"|collection\./

const SCAN_DIRS = ['src/modules/manual-payments', 'src/config', 'src/types']
const SCAN_FILES = ['messages/zh.json']
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.json'])

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return SCANNED_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.'))) ? [path] : []
  })
}

/** 去掉与核销型支付无关的合法 `content-collections` 词形。 */
function stripAllowedExceptions(source: string): string {
  return source
    .replaceAll('normalize-content-collections', '')
    .replaceAll('content-collections', '')
}

describe('manual-payments 命名', () => {
  it('业务、配置、类型与中文消息里不再出现 collection 旧标识符', () => {
    const files = [...SCAN_DIRS.flatMap(walk), ...SCAN_FILES]
    const violations: string[] = []

    for (const file of files) {
      const source = stripAllowedExceptions(readFileSync(file, 'utf8'))
      const match = source.match(LEGACY)
      if (match) violations.push(`${file}: ${match[0]}`)
    }

    expect(violations).toEqual([])
  })
})
