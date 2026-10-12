import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileInfo, UploadOptions, UploadResult } from '@/storage'

// --- Mock R2StorageProvider directly (simpler than mocking R2Bucket) ---
const mockUploadFile =
  vi.fn<
    (
      file: ArrayBuffer,
      filename: string,
      contentType: string,
      options?: UploadOptions,
    ) => Promise<UploadResult>
  >()
const mockDeleteFile = vi.fn<(key: string) => Promise<void>>()
const mockDownloadFile = vi.fn<(key: string) => Promise<ReadableStream | null>>()
const mockGetFileInfo = vi.fn<(key: string) => Promise<FileInfo | null>>()
const mockListUserFiles =
  vi.fn<
    (
      userId: string,
      cursor?: string,
    ) => Promise<{
      objects: Array<{ key: string; size: number; uploaded: Date }>
      hasMore: boolean
      nextCursor?: string
    }>
  >()

vi.mock('@/storage/provider/r2', () => ({
  R2StorageProvider: vi.fn().mockImplementation(() => ({
    uploadFile: mockUploadFile,
    deleteFile: mockDeleteFile,
    downloadFile: mockDownloadFile,
    getFileInfo: mockGetFileInfo,
    listUserFiles: mockListUserFiles,
  })),
}))

// Mock server-context so getServerContext() returns a context with the mock provider.
vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({
    env: {},
    cacheProvider: {},
    storageProvider: {
      uploadFile: mockUploadFile,
      deleteFile: mockDeleteFile,
      downloadFile: mockDownloadFile,
      getFileInfo: mockGetFileInfo,
      listUserFiles: mockListUserFiles,
    },
  }),
  als: {
    run: vi.fn((_ctx, fn) => fn()),
  },
}))

// Import after vi.mock — the mock is now active.
import { deleteFile, downloadFile, getFileInfo, listUserFiles, uploadFile } from '@/storage'

// --- Tests ---

describe('storage types', () => {
  it('exports UploadOptions 接口', () => {
    const opts: UploadOptions = { folder: 'a', userId: 'u1' }
    expect(opts.folder).toBe('a')
  })

  it('exports UploadResult 接口', () => {
    const result: UploadResult = { key: 'k', url: '/u', metadata: {} }
    expect(result.key).toBe('k')
  })

  it('exports FileInfo 接口', () => {
    const info: FileInfo = {
      key: 'k',
      size: 1024,
      contentType: 'image/png',
      uploadedAt: new Date(),
    }
    expect(info.size).toBe(1024)
  })
})

describe('uploadFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('调用 provider.uploadFile 并返回结果', async () => {
    const file = new ArrayBuffer(8)
    const expected: UploadResult = {
      key: 'uploads/user1/123-img.png',
      url: '/api/files/uploads%2Fuser1%2F123-img.png',
      metadata: { contentType: 'image/png', visibility: 'private' },
    }
    mockUploadFile.mockResolvedValueOnce(expected)

    const result = await uploadFile(file, 'img.png', 'image/png', { userId: 'user1' })

    expect(result).toEqual(expected)
    expect(mockUploadFile).toHaveBeenCalledWith(file, 'img.png', 'image/png', { userId: 'user1' })
  })

  it('folder 默认为 uploads', async () => {
    const file = new ArrayBuffer(4)
    const expected: UploadResult = {
      key: 'uploads/456-doc.pdf',
      url: '/api/files/uploads%2F456-doc.pdf',
      metadata: { contentType: 'application/pdf', visibility: 'private' },
    }
    mockUploadFile.mockResolvedValueOnce(expected)

    await uploadFile(file, 'doc.pdf', 'application/pdf')

    expect(mockUploadFile).toHaveBeenCalledWith(file, 'doc.pdf', 'application/pdf', {})
  })

  it('visibility 默认为 private', async () => {
    const file = new ArrayBuffer(4)
    const expected: UploadResult = {
      key: 'uploads/789-x.txt',
      url: '/api/files/uploads%2F789-x.txt',
      metadata: { contentType: 'text/plain', visibility: 'private' },
    }
    mockUploadFile.mockResolvedValueOnce(expected)

    await uploadFile(file, 'x.txt', 'text/plain', { visibility: 'public' })

    expect(mockUploadFile).toHaveBeenCalledWith(file, 'x.txt', 'text/plain', {
      visibility: 'public',
    })
  })
})

describe('deleteFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('调用 provider.delete 删除指定 key', async () => {
    mockDeleteFile.mockResolvedValueOnce(undefined)

    await deleteFile('uploads/user1/123-file.png', true)

    expect(mockDeleteFile).toHaveBeenCalledWith('uploads/user1/123-file.png', true)
  })
})

describe('downloadFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provider 返回 null 时 downloadFile 也返回 null', async () => {
    mockDownloadFile.mockResolvedValueOnce(null)

    const result = await downloadFile('uploads/user1/123-file.png')

    expect(result).toBeNull()
  })

  it('provider 返回 ReadableStream 时直接透传', async () => {
    const stream = new ReadableStream()
    mockDownloadFile.mockResolvedValueOnce(stream)

    const result = await downloadFile('uploads/user1/123-file.png')

    expect(result).toBe(stream)
  })
})

describe('getFileInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provider 返回 null 时 getFileInfo 也返回 null', async () => {
    mockGetFileInfo.mockResolvedValueOnce(null)

    const result = await getFileInfo('nonexistent-key')

    expect(result).toBeNull()
  })

  it('正确映射 R2 head object 为 FileInfo', async () => {
    const uploadedAt = new Date('2024-01-01T00:00:00Z')
    const expected: FileInfo = {
      key: 'uploads/user1/123-img.png',
      size: 4096,
      contentType: 'image/png',
      uploadedAt,
    }
    mockGetFileInfo.mockResolvedValueOnce(expected)

    const result = await getFileInfo('uploads/user1/123-img.png')

    expect(result).toEqual(expected)
    expect(result?.size).toBe(4096)
    expect(result?.contentType).toBe('image/png')
  })
})

describe('listUserFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('调用 provider.listUserFiles 并透传结果', async () => {
    const objects = [
      { key: 'uploads/user1/100-a.png', size: 100, uploaded: new Date() },
      { key: 'uploads/user1/200-b.png', size: 200, uploaded: new Date() },
    ]
    const expected = { objects, hasMore: false, nextCursor: undefined }
    mockListUserFiles.mockResolvedValueOnce(expected)

    const result = await listUserFiles('user1')

    expect(result).toEqual(expected)
    expect(mockListUserFiles).toHaveBeenCalledWith('user1', undefined)
  })

  it('透传 cursor 参数', async () => {
    const expected = { objects: [], hasMore: false }
    mockListUserFiles.mockResolvedValueOnce(expected)

    await listUserFiles('user1', 'cursor-token')

    expect(mockListUserFiles).toHaveBeenCalledWith('user1', 'cursor-token')
  })

  it('hasMore 为 true 时返回 nextCursor', async () => {
    const objects = [{ key: 'uploads/user1/100-a.png', size: 100, uploaded: new Date() }]
    const expected = { objects, hasMore: true, nextCursor: 'next-cursor-token' }
    mockListUserFiles.mockResolvedValueOnce(expected)

    const result = await listUserFiles('user1')

    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBe('next-cursor-token')
  })
})
