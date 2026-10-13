import type { R2Bucket } from '@cloudflare/workers-types'
import type { FileInfo, UploadOptions, UploadResult } from '../types'

/** 允许的 folder 前缀白名单 */
const ALLOWED_FOLDER_PREFIXES = ['uploads', 'avatars', 'documents'] as const
type AllowedFolder = (typeof ALLOWED_FOLDER_PREFIXES)[number]

/**
 * R2 storage provider — 走 native R2 binding，不使用 S3 SDK。
 *
 * 设计依据：Cloudflare Workers 上 R2 通过 binding（`env.BUCKET`）访问，零 egress、
 * 原生 API 已经覆盖 put/get/head/list/delete 全集；S3 SDK 额外引入 `@aws-sdk/*`
 * 包体并需要 CORS-compatible 凭据，与 spec §3 "binding 而非凭据" 一致。
 * 预签名 URL 等需要 S3 协议的功能由后续 R2 presign 单独提供。
 */
export class R2StorageProvider {
  constructor(private readonly bucket: R2Bucket) {}

  /**
   * 净化用户输入中的路径遍历成分，返回安全的 key。
   *
   * - filename: 去除所有 `/` `\` `..` 和前导 `.`，其余非字母数字非 `.` `_` `-` 的字符替换为 `_`。
   * - userId: 同上，且不允许为空。
   * - folder: 仅允许白名单值（uploads / avatars / documents）。
   * - 构造后再次断言 key 以白名单前缀开头（belt-and-suspenders）。
   */
  private buildKey(filename: string, options: UploadOptions): string {
    // 1. folder 白名单校验
    const folder = options.folder ?? 'uploads'
    if (!ALLOWED_FOLDER_PREFIXES.includes(folder as AllowedFolder)) {
      throw new Error(
        `storage: folder "${folder}" 不在白名单中，仅允许: ${ALLOWED_FOLDER_PREFIXES.join(', ')}`,
      )
    }

    // 2. 净化 filename
    const sanitizedFilename = this._sanitize(filename, 'filename')
    if (!sanitizedFilename) {
      throw new Error('storage: filename 净化后为空，请提供有效的文件名')
    }

    // 3. 净化 userId（若提供）
    let sanitizedUserId = ''
    if (options.userId) {
      sanitizedUserId = this._sanitize(options.userId, 'userId')
      if (!sanitizedUserId) {
        throw new Error('storage: userId 净化后为空，请提供有效的 userId')
      }
    }

    // 4. 组装 key
    const parts: string[] = [folder]
    if (sanitizedUserId) parts.push(sanitizedUserId)
    parts.push(`${Date.now()}-${sanitizedFilename}`)
    const key = parts.join('/')

    // 5. Belt-and-suspenders：确认 key 以白名单前缀开头
    const startsWithAllowed = ALLOWED_FOLDER_PREFIXES.some((p) => key.startsWith(`${p}/`))
    if (!startsWithAllowed) {
      throw new Error(`storage: 构建出的 key "${key}" 未以白名单前缀开头（内部错误）`)
    }

    return key
  }

  /**
   * 净化字符串 — 检测并拒绝路径遍历特征，其余字符做白名单过滤。
   * 若输入包含 `/` `\` `..` 或前导点，返回空字符串（调用方应抛错）。
   * @param input 原始用户输入
   * @param fieldName 用于错误信息的字段名
   */
  private _sanitize(input: string, _fieldName: string): string {
    // 拒绝包含路径分隔符或 .. 的输入
    if (/[/\\]|\.\./.test(input)) return ''
    // 拒绝前导点（防止 .env 等隐藏文件）
    if (/^\./.test(input)) return ''
    // 仅保留字母数字 . _ -
    return input.replace(/[^a-zA-Z0-9._-]/g, '_')
  }

  async uploadFile(
    file: ArrayBuffer | Uint8Array,
    filename: string,
    contentType: string,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    const key = this.buildKey(filename, options)
    await this.bucket.put(key, file, {
      httpMetadata: { contentType },
      customMetadata: {
        userId: options.userId ?? '',
        visibility: options.visibility ?? 'private',
      },
    })
    return {
      key,
      url: `/api/files/${encodeURIComponent(key)}`,
      metadata: { contentType, visibility: options.visibility ?? 'private' },
    }
  }

  /**
   * 删除文件。
   *
   * 注意：此方法不检查文件所有权。调用方必须在调用前确认 key 属于当前认证用户。
   * @param key 要删除的文件 key
   * @param authorized 调用方是否已确认授权（传 `true` 表示确认，否则抛出）
   */
  async deleteFile(key: string, authorized?: boolean): Promise<void> {
    if (!authorized) {
      throw new Error('storage: deleteFile 需要显式传入 authorized: true，以确认调用方已校验所有权')
    }
    await this.bucket.delete(key)
  }

  /**
   * 下载文件内容。
   *
   * 注意：此方法不自动执行 ACL 检查。若对象的 customMetadata.visibility === 'private'，
   * 必须传入 `authorized: true` 才能下载；否则抛出错误。调用方负责在调用前检查
   * visibility 或确认所有权。
   * @param key 要下载的文件 key
   * @param authorized 调用方是否已确认授权（private 文件需要此标志）
   */
  async downloadFile(key: string, authorized?: boolean): Promise<ReadableStream | null> {
    const obj = await this.bucket.head(key)
    if (!obj) return null

    const visibility = obj.customMetadata?.visibility
    if (visibility !== 'public' && !authorized) {
      throw new Error(
        'storage: downloadFile 拒绝非 public 文件（缺省视为 private），需要显式传入 authorized: true',
      )
    }

    const result = await this.bucket.get(key)
    return (result?.body as unknown as ReadableStream | null) ?? null
  }

  async getFileInfo(key: string): Promise<FileInfo | null> {
    const obj = await this.bucket.head(key)
    if (!obj) return null
    return {
      key,
      size: obj.size,
      contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
      uploadedAt: obj.uploaded,
    }
  }

  /**
   * 列出用户文件。
   *
   * 注意：此方法不自动验证 userId 是否属于当前认证用户。调用方必须在调用前
   * 校验 userId 参数的合法性（例如仅允许查看自身文件）。
   * @param userId 文件所属用户 ID
   * @param cursor 分页游标
   */
  async listUserFiles(userId: string, cursor?: string) {
    // 运行时检查：拒绝路径遍历特征
    if (/[/\\]|\.\./.test(userId)) {
      throw new Error('storage: listUserFiles 的 userId 包含非法路径字符，请传入有效的 userId')
    }
    const prefix = `uploads/${userId}/`
    const listed = await this.bucket.list({ prefix, cursor, limit: 50 })
    return {
      objects: listed.objects.map((o) => ({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded,
      })),
      hasMore: !listed.truncated,
      nextCursor: listed.truncated ? listed.cursor : undefined,
    }
  }
}
