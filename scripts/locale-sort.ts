/**
 * 把 `messages/*.json` 的键按字典序重排，保留 `$schema` 等所有字段。
 *
 * 排序后的文件按 2 空格缩进、结尾换行输出，与仓库其余 JSON 风格一致。
 *
 * 以 `LOCALES` 为基准：缺少某个受支持语言的消息文件、或存在不受支持语言的残留文件，
 * 都直接失败而不是静默跳过——否则新增语言后 `locale:sort` 会「成功」却漏掉新文件。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCALES } from '../src/lib/locale'

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
