/**
 * 把 Zod 校验错误整理成可安全打印的「变量名: 原因」行。
 *
 * 只取 `issue.path`（字段名）与 `issue.message`（原因），**不**包含被校验的值、
 * `.env` 文件内容或 Zod 的原始输入，避免在 CI 日志中泄露 secret。
 */
import type { ZodError } from 'zod'

export function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const key = issue.path.map(String).join('.') || '(root)'
    return `${key}: ${issue.message}`
  })
}
