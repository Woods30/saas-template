/**
 * `.env` 读取与合并的共享实现，供 `scripts/check-env*.ts` 复用，保证三个脚本规则一致。
 * 空串归一由 `src/core/env/normalize.ts` 处理，此处不重复实现。
 */
import { randomBytes } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { parseEnv } from 'node:util'

const DEFAULT_DOTENV_PATH = '.env'

/** `.env` 里存着凭据，只应本人可读写。 */
const ENV_FILE_MODE = 0o600

/**
 * 读出 `.env` 的**原文**；不存在时从 `.env.example` 复制一份。
 *
 * 保留原文而非解析成键值对，是为了不丢注释：`.env` 里写着「生产必须改成实际
 * 域名」这类说明，整体覆盖会把它们连同手填的凭据一起抹掉。
 *
 * `.env` 若是符号链接直接拒绝：脚本会往这个文件里写凭据，而链接指向哪里
 * 由仓库内容说了算，跟着写等于替别人改文件。
 */
export function prepareEnvFile(envPath = '.env', examplePath = '.env.example'): string {
  const stat = lstatSync(envPath, { throwIfNoEntry: false })
  if (stat) {
    if (stat.isSymbolicLink()) {
      throw new Error(`${envPath} 是符号链接，拒绝使用：请改成普通文件后再试`)
    }
    return readFileSync(envPath, 'utf-8')
  }
  if (!lstatSync(examplePath, { throwIfNoEntry: false })) {
    throw new Error(`缺少 ${envPath} 与 ${examplePath}；请先创建 ${examplePath}`)
  }
  // COPYFILE_EXCL：目标若在这期间出现（包括被换成符号链接）就报错，不覆盖。
  copyFileSync(examplePath, envPath, constants.COPYFILE_EXCL)
  chmodSync(envPath, ENV_FILE_MODE)
  return readFileSync(envPath, 'utf-8')
}

/**
 * 写 `.env`：先写同目录的临时文件，再原子改名覆盖。
 *
 * 两道防线：
 * - 目标是符号链接时直接拒绝——链接指向哪里由仓库内容说了算，跟着写等于替别人改文件；
 * - 写入走「临时文件 + rename」：临时文件以 0600 创建，凭据落盘时权限已经收紧，
 *   且 rename 替换的是路径本身，不会顺着链接写，也避免写到一半留下半个文件。
 */
export function writeEnvFile(path: string, content: string): void {
  const stat = lstatSync(path, { throwIfNoEntry: false })
  if (stat?.isSymbolicLink()) {
    throw new Error(`${path} 是符号链接，拒绝写入：请改成普通文件后再试`)
  }

  const temp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`)
  let fd: number | undefined
  try {
    fd = openSync(
      temp,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      ENV_FILE_MODE,
    )
    writeFileSync(fd, content)
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renameSync(temp, path)
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    rmSync(temp, { force: true })
    throw error
  }
}

/** 读取并解析 `.env`；文件不存在时抛 `ENOENT`，由调用方转成可操作的提示。 */
export function readDotEnvFile(path: string = DEFAULT_DOTENV_PATH): Record<string, string> {
  return parseEnv(readFileSync(path, 'utf-8')) as Record<string, string>
}

/**
 * 合并 `.env` 与进程环境变量，进程环境优先。
 * 只忽略 `ENOENT`（CI 只提供进程 env）；其它错误继续抛出，避免真实故障被静默吞掉。
 */
export function resolveRawEnv(
  path: string = DEFAULT_DOTENV_PATH,
): Record<string, string | undefined> {
  let fromFile: Record<string, string> = {}
  try {
    fromFile = readDotEnvFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return { ...fromFile, ...process.env }
}
