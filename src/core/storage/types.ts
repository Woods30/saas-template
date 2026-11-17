export interface UploadOptions {
  folder?: string
  userId?: string
  visibility?: 'private' | 'public'
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
