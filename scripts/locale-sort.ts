/**
 * 把 `messages/*.json` 的键按字典序重排，保留 `$schema` 等所有字段。
 *
 * 排序后的文件按 2 空格缩进、结尾换行输出，与仓库其余 JSON 风格一致。
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MESSAGES_DIR = 'messages'

function sortRecord(record: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {}
  // `$schema`（以 `$` 开头）在 ASCII 序中天然排在字母之前，因此全量排序即可把它
  // 保留在文件顶部，无需特殊处理。
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key]
  }
  return sorted
}

function main(): void {
  const files = readdirSync(MESSAGES_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()

  if (files.length === 0) {
    throw new Error(`未在 ${MESSAGES_DIR}/ 找到任何 .json 消息文件`)
  }

  for (const file of files) {
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
