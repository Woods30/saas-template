/**
 * 读取并解析 `.env` 的共享实现，供 `scripts/check-env*.ts` 复用。
 *
 * 三个校验脚本必须对 `.env` 采用**同一套**解析与合并规则，否则「开发通过、生产失败」
 * 这类差异难以排查。这里集中处理：
 * - 用 Node 标准 `parseEnv` 解析，正确处理引号、注释、空白与 `export` 前缀，**不**做
 *   `split('=')` 之类的朴素切分；
 * - 空串视为「未设置」：`.env.example` 的 optional 字段留空后可直接复制为 `.env`，
 *   由 Zod schema 的默认值 / `optional()` 接管；
 * - 进程环境变量优先于 `.env`（与 dotenv 约定一致），便于 CI 或本地临时覆盖。
 */
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

const DEFAULT_DOTENV_PATH = '.env'

/**
 * 读取并解析 `.env`，返回原始键值。
 *
 * 文件不存在时抛出 `ENOENT`，由调用方转成可操作的提示（而非在此吞掉）。
 */
export function readDotEnvFile(path: string = DEFAULT_DOTENV_PATH): Record<string, string> {
  return parseEnv(readFileSync(path, 'utf-8')) as Record<string, string>
}

/**
 * 合并 `.env` 与进程环境变量。
 *
 * 进程环境变量优先级更高：`VITE_BASE_URL=... pnpm check:env` 可临时覆盖 `.env`。
 * 返回的对象可直接交给 `src/env` 的 Zod schema 校验；空串归一由 `src/env/normalize.ts`
 * 统一处理，此处不重复实现另一套空值规则。
 */
export function resolveRawEnv(
  path: string = DEFAULT_DOTENV_PATH,
): Record<string, string | undefined> {
  return { ...readDotEnvFile(path), ...process.env }
}
