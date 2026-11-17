import type { R2Bucket } from '@cloudflare/workers-types'
import type { FileInfo, UploadOptions, UploadResult } from '../types'

/** 允许的 folder 前缀白名单 */
const ALLOWED_FOLDER_PREFIXES = ['uploads', 'avatars', 'documents'] as const
type AllowedFolder = (typeof ALLOWED_FOLDER_PREFIXES)[number]

/**
 * R2 storage provider — 走 native R2 binding（`env.BUCKET`），不使用 S3 SDK：
 * Workers 上 binding 零 egress，原生 API 已覆盖全部所需操作，无需引入 `@aws-sdk/*` 与凭据。
 * 预签名 URL 等 S3 协议功能另行提供。
 */
export class R2StorageProvider {
  constructor(private readonly bucket: R2Bucket) {}

  /**
   * 净化用户输入中的路径遍历成分，返回安全的 key。
   *
   * folder 仅允许白名单值；filename / userId 含 `/` `\` `..` 或前导点时净化后为空，
   * 调用方应抛错。构造后再断言 key 以白名单前缀开头（belt-and-suspenders）。
   */
  private buildKey(filename: string, options: UploadOptions): string {
    const folder = options.folder ?? 'uploads'
    if (!ALLOWED_FOLDER_PREFIXES.includes(folder as AllowedFolder)) {
      throw new Error(
        `storage: folder "${folder}" 不在白名单中，仅允许: ${ALLOWED_FOLDER_PREFIXES.join(', ')}`,
      )
    }

    const sanitizedFilename = this._sanitize(filename, 'filename')
    if (!sanitizedFilename) {
      throw new Error('storage: filename 净化后为空，请提供有效的文件名')
    }

    let sanitizedUserId = ''
    if (options.userId) {
      sanitizedUserId = this._sanitize(options.userId, 'userId')
      if (!sanitizedUserId) {
        throw new Error('storage: userId 净化后为空，请提供有效的 userId')
      }
    }

    const parts: string[] = [folder]
    if (sanitizedUserId) parts.push(sanitizedUserId)
    parts.push(`${Date.now()}-${sanitizedFilename}`)
    const key = parts.join('/')

    const startsWithAllowed = ALLOWED_FOLDER_PREFIXES.some((p) => key.startsWith(`${p}/`))
    if (!startsWithAllowed) {
      throw new Error(`storage: 构建出的 key "${key}" 未以白名单前缀开头（内部错误）`)
    }

    return key
  }

  /**
   * 含 `/` `\` `..` 或前导点时返回空字符串（调用方应抛错），其余字符做白名单过滤。
   */
  private _sanitize(input: string, _fieldName: string): string {
    if (/[/\\]|\.\./.test(input)) return ''
    if (/^\./.test(input)) return ''
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
   * 不检查文件所有权：调用方必须先确认 key 属于当前认证用户，并显式传 `authorized: true`。
   */
  async deleteFile(key: string, authorized?: boolean): Promise<void> {
    if (!authorized) {
      throw new Error('storage: deleteFile 需要显式传入 authorized: true，以确认调用方已校验所有权')
    }
    await this.bucket.delete(key)
  }

  /**
   * 不自动执行 ACL 检查：缺省视为 private，需显式传 `authorized: true`，
   * 调用方负责先校验 visibility 或所有权。
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
   * 不自动验证 userId 是否属于当前认证用户：调用方必须先校验（例如仅允许查看自身文件）。
   */
  async listUserFiles(userId: string, cursor?: string) {
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
