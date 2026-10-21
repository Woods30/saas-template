/**
 * 把 `messages/*.json` 的键按字典序重排，保留 `$schema` 等所有字段。
 * 以 `LOCALES` 为基准：缺文件或有多余文件都直接失败，避免新增语言后静默漏排。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCALES } from '../src/lib/locale'

const MESSAGES_DIR = 'messages'

function sortRecord(record: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {}
  // `$schema` 以 `$` 开头，ASCII 序天然排在字母之前，全量排序即可置顶。
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key]
  }
  return sorted
}

function main(): void {
  const expected = LOCALES.map((locale) => `${locale}.json`).sort()
  const missing = expected.filter((file) => !existsSync(join(MESSAGES_DIR, file)))
  if (missing.length > 0) {
    throw new Error(
      `未在 ${MESSAGES_DIR}/ 找到受支持语言的消息文件：${missing.join(', ')}（请先创建再排序）`,
    )
  }

  for (const file of expected) {
    const path = join(MESSAGES_DIR, file)
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${path} 顶层必须是 JSON 对象`)
    }
    const sorted = sortRecord(parsed as Record<string, unknown>)
    writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`)
    console.log(`sorted ${path}`)
  }
}

main()
