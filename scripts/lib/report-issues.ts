/**
 * 把 Zod 校验错误整理成可安全打印的「变量名: 原因」行。
 *
 * 只取 `issue.path`（字段名）与 `issue.message`（原因），**不**包含被校验的值、
 * `.env` 文件内容或 Zod 的原始输入，避免在 CI 日志中泄露 secret。
 */
import type { ZodError } from 'zod'
import type { ServiceStatus } from '../../src/config/service-status'

export function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const key = issue.path.map(String).join('.') || '(root)'
    return `${key}: ${issue.message}`
  })
}

/** 服务状态的中文标签；`configured` 仅表示必要字段齐备，不代表外部服务已就绪。 */
const STATE_LABELS: Record<ServiceStatus['state'], string> = {
  disabled: '未启用',
  incomplete: '配置不完整',
  configured: '已配置',
}

export interface ServiceDiagnostics {
  /** 逐行诊断文本，只含模块名、状态、字段名、原因与位置，绝不含任何值或 secret。 */
  lines: string[]
  /** 是否存在「已启用但必要字段缺失」的模块；dev 仅提示，prod 据此失败。 */
  hasIncomplete: boolean
}

/**
 * 把 `getServiceStatuses` 的结果整理成可安全打印的诊断。
 *
 * - 只输出 `name / state / key / reason / location`，`manual` 项标注为「部署核对」，
 *   不冒充成功也不计入 `hasIncomplete`；
 * - 关闭的模块（disabled）不逐字段展开，避免噪音。
 */
export function formatServiceDiagnostics(
  statuses: Record<string, ServiceStatus>,
): ServiceDiagnostics {
  const lines: string[] = []
  let hasIncomplete = false

  for (const [name, status] of Object.entries(statuses)) {
    const label = STATE_LABELS[status.state]
    lines.push(`${name}: ${label}`)
    if (status.state === 'incomplete') hasIncomplete = true
    for (const issue of status.issues) {
      // 「缺失」只适用于字段未提供；配置矛盾（如要求邮箱验证却没配邮件）里字段是存在的，
      // 标成「缺失」会让运维去找一个其实已经填了的字段。
      const scope = issue.manual ? '部署核对' : issue.conflict ? '冲突' : '缺失'
      lines.push(`  - [${scope}] ${issue.key}（${issue.location}）：${issue.reason}`)
    }
  }

  return { lines, hasIncomplete }
}
