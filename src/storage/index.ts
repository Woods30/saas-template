/**
 * Storage 模块。
 *
 * 使用 ALS 注入的 `R2StorageProvider`（per-request），而非 module-level 单例，
 * 与 `src/lib/server-context.ts` 的 env 注入模式保持一致。
 *
 * 调用方通过 `getServerContext().storageProvider` 访问 provider；
 * 无 ALS context 时（如测试环境）各函数自动降级为抛出错误。
 */
import { getServerContext } from '@/lib/server-context'
import type { R2StorageProvider } from './provider/r2'
import type { FileInfo, UploadOptions, UploadResult } from './types'

export type { FileInfo, UploadOptions, UploadResult }

/**
 * 获取当前请求的 storage provider。
 * ALS context 外调用会抛出错误。
 */
export function getStorageProvider(): R2StorageProvider {
  const { storageProvider } = getServerContext()
  if (!storageProvider) {
    throw new Error('Storage provider 不可用（无 ALS context）')
  }
  return storageProvider
}

export async function uploadFile(
  file: ArrayBuffer | Uint8Array,
  filename: string,
  contentType: string,
  options?: UploadOptions,
): Promise<UploadResult> {
  return getStorageProvider().uploadFile(file, filename, contentType, options ?? {})
}

export async function deleteFile(key: string, authorized?: boolean): Promise<void> {
  return getStorageProvider().deleteFile(key, authorized)
}

export async function downloadFile(
  key: string,
  authorized?: boolean,
): Promise<ReadableStream | null> {
  return getStorageProvider().downloadFile(key, authorized)
}

export async function getFileInfo(key: string): Promise<FileInfo | null> {
  return getStorageProvider().getFileInfo(key)
}

export async function listUserFiles(userId: string, cursor?: string) {
  return getStorageProvider().listUserFiles(userId, cursor)
}
