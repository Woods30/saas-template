/**
 * 校验 `messages/*.json` 的**文件集合**与 `LOCALES` 一一对应，且各语言的键集合与
 * base locale 双向相等（忽略 `$schema`）。
 *
 * 三类问题都以非零退出码失败：
 * - 缺少某个受支持语言的消息文件（新增语言后忘记补 `messages/xx.json`）；
 * - 存在不受支持语言的消息文件（`LOCALES` 删了某语言但文件残留）；
 * - 某语言缺失或多出键（漏译 / 多译）。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareMessageKeys, LOCALES, parseLocale } from '../src/lib/locale'

const MESSAGES_DIR = 'messages'
const SETTINGS_PATH = 'project.inlang/settings.json'

function readBaseLocale(): string {
  const settings: unknown = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'))
  if (settings === null || typeof settings !== 'object') {
    throw new Error(`${SETTINGS_PATH} 顶层必须是 JSON 对象`)
  }
  const baseLocale = (settings as Record<string, unknown>).baseLocale
  if (typeof baseLocale !== 'string' || !parseLocale(baseLocale)) {
    throw new Error(`${SETTINGS_PATH} 的 baseLocale 缺失或不在受支持语言内`)
  }
  return baseLocale
}

function readMessages(file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(join(MESSAGES_DIR, file), 'utf-8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${MESSAGES_DIR}/${file} 顶层必须是 JSON 对象`)
  }
  return parsed as Record<string, unknown>
}

function main(): void {
  const baseLocale = readBaseLocale()
  const baseFile = `${baseLocale}.json`
  const files = readdirSync(MESSAGES_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()

  if (!files.includes(baseFile)) {
    throw new Error(`未找到 base locale 文件 ${MESSAGES_DIR}/${baseFile}`)
  }

  // 文件集合必须与受支持语言一一对应：多出 / 缺失都在这里拦下。
  let failed = false
  const expected = new Set(LOCALES.map((locale) => `${locale}.json`))
  const actual = new Set(files)
  const missingFiles = [...expected].filter((file) => !actual.has(file)).sort()
  const unexpectedFiles = [...actual].filter((file) => !expected.has(file)).sort()

  if (missingFiles.length > 0) {
    console.error(`❌ ${MESSAGES_DIR}/ 缺少受支持语言的消息文件：${missingFiles.join(', ')}`)
    failed = true
  }
  if (unexpectedFiles.length > 0) {
    console.error(
      `❌ ${MESSAGES_DIR}/ 存在不受支持语言的消息文件：${unexpectedFiles.join(', ')}（请从 LOCALES 移除或补齐支持）`,
    )
    failed = true
  }

  const baseMessages = readMessages(baseFile)

  for (const file of files) {
    if (file === baseFile) continue
    const { missing, extra } = compareMessageKeys(baseMessages, readMessages(file))
    if (missing.length > 0) {
      console.error(`❌ ${MESSAGES_DIR}/${file} 缺失键：${missing.join(', ')}`)
      failed = true
    }
    if (extra.length > 0) {
      console.error(`❌ ${MESSAGES_DIR}/${file} 多余键：${extra.join(', ')}`)
      failed = true
    }
  }

  if (failed) process.exit(1)
  console.log(`✅ 所有 locale 键配对一致（base: ${baseLocale}）`)
}

main()
