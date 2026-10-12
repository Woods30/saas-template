import { describe, expect, it, vi } from 'vitest'
import { R2StorageProvider } from '@/storage/provider/r2'

// 构造一个最小化的 mock R2Bucket（只记录 put/delete/get/head/list 调用）
// 使用 `as any` 绕过 R2Bucket 重载方法的 vi.fn 类型不兼容问题
function createMockBucket() {
  const mock = {
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({
      body: new ReadableStream(),
    }),
    head: vi.fn().mockResolvedValue({
      size: 100,
      httpMetadata: { contentType: 'image/png' },
      uploaded: new Date(),
      customMetadata: { visibility: 'private' },
    }),
    list: vi.fn().mockResolvedValue({
      objects: [],
      truncated: false,
    }),
    // biome-ignore lint/suspicious/noExplicitAny: mock R2Bucket, vi.fn type incompatible with overloaded R2 methods
  } as any
  return mock
}

describe('R2StorageProvider — 安全加固', () => {
  describe('Finding 1: buildKey 路径遍历防护', () => {
    it('filename 含 ../etc/passwd → 抛出"净化后为空"错误（.. 被拒绝）', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)
      const file = new ArrayBuffer(8)

      await expect(
        provider.uploadFile(file, '../../etc/passwd', 'text/plain', { userId: 'user1' }),
      ).rejects.toThrow('净化后为空')
    })

    it('filename 为 .. → 抛出"净化后为空"错误', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)
      const file = new ArrayBuffer(8)

      await expect(
        provider.uploadFile(file, '..', 'text/plain', { userId: 'user1' }),
      ).rejects.toThrow('净化后为空')
    })

    it('userId 含 / → 抛出错误', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)
      const file = new ArrayBuffer(8)

      await expect(
        provider.uploadFile(file, 'legit.png', 'image/png', { userId: 'admin/user' }),
      ).rejects.toThrow('userId 净化后为空')
    })

    it('userId 含 .. → 抛出错误', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)
      const file = new ArrayBuffer(8)

      await expect(
        provider.uploadFile(file, 'legit.png', 'image/png', { userId: '..' }),
      ).rejects.toThrow('userId 净化后为空')
    })

    it('folder 不在白名单 → 抛出错误', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)
      const file = new ArrayBuffer(8)

      await expect(
        provider.uploadFile(file, 'legit.png', 'image/png', { folder: '../../../etc' }),
      ).rejects.toThrow('不在白名单中')
    })

    it('folder 为 uploads（白名单内）→ 正常工作', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)
      const file = new ArrayBuffer(8)

      await provider.uploadFile(file, 'legit.png', 'image/png', { folder: 'uploads' })

      const calledKey = bucket.put.mock.calls[0][0] as string
      expect(calledKey).toMatch(/^uploads\/\d+-legit\.png$/)
    })

    it('folder 为 avatars（白名单内）→ 正常工作', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)
      const file = new ArrayBuffer(8)

      await provider.uploadFile(file, 'avatar.png', 'image/png', { folder: 'avatars' })

      const calledKey = bucket.put.mock.calls[0][0] as string
      expect(calledKey).toMatch(/^avatars\/\d+-avatar\.png$/)
    })

    it('filename 含非法字符（非字母数字 . _ -）→ 替换为 _', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)
      const file = new ArrayBuffer(8)

      await provider.uploadFile(file, 'file with spaces.png', 'image/png', {
        userId: 'user1',
      })

      const calledKey = bucket.put.mock.calls[0][0] as string
      expect(calledKey).not.toContain(' ')
      expect(calledKey).toMatch(/^uploads\/user1\/\d+-file_with_spaces\.png$/)
    })
  })

  describe('Finding 2: listUserFiles userId 路径遍历校验', () => {
    it('userId 含 / → 抛出错误', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)

      await expect(provider.listUserFiles('admin/user')).rejects.toThrow('包含非法路径字符')
    })

    it('userId 含 \\ → 抛出错误', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)

      await expect(provider.listUserFiles('admin\\user')).rejects.toThrow('包含非法路径字符')
    })

    it('userId 含 .. → 抛出错误', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)

      await expect(provider.listUserFiles('..')).rejects.toThrow('包含非法路径字符')
    })

    it('userId 合法 → 正常工作', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)

      await provider.listUserFiles('user1')

      expect(bucket.list).toHaveBeenCalledWith({
        prefix: 'uploads/user1/',
        cursor: undefined,
        limit: 50,
      })
    })
  })

  describe('Finding 3: downloadFile private 文件授权校验', () => {
    it('visibility=private 且未传 authorized → 抛出错误', async () => {
      const bucket = createMockBucket()
      // head 返回 private visibility
      bucket.head.mockResolvedValueOnce({
        size: 100,
        httpMetadata: { contentType: 'image/png' },
        uploaded: new Date(),
        customMetadata: { visibility: 'private' },
      })
      const provider = new R2StorageProvider(bucket)

      await expect(provider.downloadFile('uploads/user1/123-file.png')).rejects.toThrow(
        '拒绝非 public 文件（缺省视为 private）',
      )
    })

    it('visibility=private 且 authorized=true → 正常返回流', async () => {
      const bucket = createMockBucket()
      ;(bucket.head as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 100,
        httpMetadata: { contentType: 'image/png' },
        uploaded: new Date(),
        customMetadata: { visibility: 'private' },
      })
      const provider = new R2StorageProvider(bucket)

      const result = await provider.downloadFile('uploads/user1/123-file.png', true)

      expect(result).toBeInstanceOf(ReadableStream)
    })

    it('visibility 缺省（undefined）且未传 authorized → 拒绝（默认 private）', async () => {
      const bucket = createMockBucket()
      ;(bucket.head as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 100,
        httpMetadata: { contentType: 'image/png' },
        uploaded: new Date(),
        customMetadata: {},
      })
      const provider = new R2StorageProvider(bucket)

      await expect(provider.downloadFile('uploads/user1/123-file.png')).rejects.toThrow(
        'authorized: true',
      )
    })

    it('visibility=public 且未传 authorized → 正常返回流', async () => {
      const bucket = createMockBucket()
      ;(bucket.head as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 100,
        httpMetadata: { contentType: 'image/png' },
        uploaded: new Date(),
        customMetadata: { visibility: 'public' },
      })
      const provider = new R2StorageProvider(bucket)

      const result = await provider.downloadFile('uploads/user1/123-file.png')

      expect(result).toBeInstanceOf(ReadableStream)
    })

    it('对象不存在 → 返回 null', async () => {
      const bucket = createMockBucket()
      ;(bucket.head as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
      const provider = new R2StorageProvider(bucket)

      const result = await provider.downloadFile('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('Finding 4: deleteFile 授权校验', () => {
    it('未传 authorized → 抛出错误', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)

      await expect(provider.deleteFile('uploads/user1/123-file.png')).rejects.toThrow(
        'authorized: true',
      )
    })

    it('authorized=true → 正常删除', async () => {
      const bucket = createMockBucket()
      const provider = new R2StorageProvider(bucket)

      await provider.deleteFile('uploads/user1/123-file.png', true)

      expect(bucket.delete).toHaveBeenCalledWith('uploads/user1/123-file.png')
    })
  })
})
