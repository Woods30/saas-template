/**
 * 配置密钥的对称加密。
 *
 * 支付 / 邮件 / OAuth 等凭据要落进 `settings` 表，明文入库等于把凭据交给任何能读
 * 数据库的人（备份、只读账号、误导出）。这里用 `CONFIG_ENCRYPTION_KEY` 派生
 * AES-GCM 密钥，密文带上 `enc:v1:` 前缀——前缀同时是版本标记与「这行是不是密文」
 * 的判定依据，将来换算法可以并存。
 *
 * 用 Web Crypto 而不是 node:crypto：Workers 只有前者，且同一份实现能在 Node 22
 * 与单元测试里跑。
 */

/** 密文前缀。改成 `enc:v2:` 前必须同时提供 v1 的读取路径。 */
export const SECRET_PREFIX = 'enc:v1:'

/** 未配置 `CONFIG_ENCRYPTION_KEY` 时抛这个错误：调用方据此拒绝保存含密钥的组。 */
export class MissingEncryptionKeyError extends Error {
  constructor() {
    super('CONFIG_ENCRYPTION_KEY 未配置，无法保存或读取密钥类配置')
    this.name = 'MissingEncryptionKeyError'
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(SECRET_PREFIX)
}

/** 派生用的密钥缓存：同一进程内同一把 key 只 import 一次。 */
const keyCache = new Map<string, Promise<CryptoKey>>()

function deriveKey(secretKey: string): Promise<CryptoKey> {
  const cached = keyCache.get(secretKey)
  if (cached) return cached
  const pending = (async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secretKey))
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ])
  })()
  keyCache.set(secretKey, pending)
  return pending
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * 加密一个值。
 *
 * 输出 `enc:v1:` + base64(iv(12 字节) || 密文)。每次加密的 IV 都是新的，同一个
 * 明文两次加密的结果不同——不要用密文做等值比较。
 */
export async function encryptSecret(
  plaintext: string,
  secretKey: string | undefined,
): Promise<string> {
  if (!secretKey) throw new MissingEncryptionKeyError()
  const key = await deriveKey(secretKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  const payload = new Uint8Array(iv.length + ciphertext.byteLength)
  payload.set(iv)
  payload.set(new Uint8Array(ciphertext), iv.length)
  return `${SECRET_PREFIX}${toBase64(payload)}`
}

/**
 * 解密。非密文原样返回——`enc:v1:` 之前写进库的明文值与未被识别的新版本都按原值
 * 对待，便于手工修数据。
 */
export async function decryptSecret(value: string, secretKey: string | undefined): Promise<string> {
  if (!isEncrypted(value)) return value
  if (!secretKey) throw new MissingEncryptionKeyError()
  const key = await deriveKey(secretKey)
  const payload = fromBase64(value.slice(SECRET_PREFIX.length))
  const iv = payload.slice(0, 12)
  const ciphertext = payload.slice(12)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

/**
 * 后台回显：只露末四位。
 *
 * 短于 8 个字符的值整串遮住——露 4 位等于露掉一半。
 */
export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return `••••••••${value.slice(-4)}`
}
