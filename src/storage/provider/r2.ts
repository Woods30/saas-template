import type { R2Bucket } from '@cloudflare/workers-types'
import type { FileInfo, UploadOptions, UploadResult } from '../types'

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

  private buildKey(filename: string, options: UploadOptions): string {
    const parts = [options.folder ?? 'uploads']
    if (options.userId) parts.push(options.userId)
    parts.push(`${Date.now()}-${filename}`)
    return parts.join('/')
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

  async deleteFile(key: string): Promise<void> {
    await this.bucket.delete(key)
  }

  async downloadFile(key: string): Promise<ReadableStream | null> {
    const obj = await this.bucket.get(key)
    return (obj?.body as unknown as ReadableStream | null) ?? null
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

  async listUserFiles(userId: string, cursor?: string) {
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
