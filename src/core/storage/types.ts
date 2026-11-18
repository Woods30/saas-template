export interface UploadOptions {
  folder?: string
  userId?: string
  visibility?: 'private' | 'public'
  /**
   * 调用方自己派生的完整 key。
   *
   * 模块拥有自己的命名空间时用得上（例如核销链路的收款码）：
   * key 由业务规则决定（`collection-qrcodes/<账户ID>.png`），但仍必须落在
   * 白名单目录内、且不含路径片段——provider 只认命名空间，不认调用方的善意。
   */
  key?: string
}

export interface UploadResult {
  key: string
  url: string
  metadata: Record<string, string>
}

export interface FileInfo {
  key: string
  size: number
  contentType: string
  uploadedAt: Date
}
