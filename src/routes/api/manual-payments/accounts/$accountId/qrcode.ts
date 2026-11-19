import { createFileRoute } from '@tanstack/react-router'
import { websiteConfig } from '@/config/website'
import { getAuth } from '@/core/auth/auth'
import { createDbFromEnv } from '@/core/db'
import { deleteFile, downloadFile, getFileInfo, uploadFile } from '@/core/storage'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerContext } from '@/lib/server-context'
import {
  errorResponse,
  findAccountFileRef,
  hasOrderForAccount,
  imageExtension,
  MANUAL_PAYMENT_IMAGE_MAX_BYTES,
  MANUAL_PAYMENT_QRCODE_FOLDER,
  manualPaymentQrImageKey,
  setAccountQrImageKey,
  validateManualPaymentImage,
} from '@/modules/manual-payments/service'

/**
 * 收款码的上传 / 读取端点。
 *
 * 安全约束：
 *
 * - **上传只有管理员能做**：运行时授权只看 `session.user.role === 'admin'`；
 *   `enableAdmin` 是能力开关，`ADMIN_EMAILS` 是发信白名单，两者都不参与授权。
 * - **不接受客户端指定的 R2 key**：key 由账户 ID 与扩展名在服务端派生，
 *   客户端传什么 key 都不作数。
 * - **读取只给管理员与该账户的订单所有者**，其他人一律 404，不泄漏资源是否存在。
 * - **先上传成功再更新账户记录**：旧对象删除失败只告警，不回滚新配置。
 */

/** 上传限流：每账号 / IP 15 分钟 5 次。 */
const UPLOAD_QRCODE_LIMIT = 5
const UPLOAD_QRCODE_WINDOW_SECONDS = 15 * 60

export const Route = createFileRoute('/api/manual-payments/accounts/$accountId/qrcode')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const unavailable = getModuleUnavailableResponse('manualPayments')
        if (unavailable) return unavailable

        const { env } = getServerContext()
        const session = await (await getAuth(env)).api.getSession({ headers: request.headers })
        if (!session) return errorResponse('UNAUTHENTICATED')
        // 只有管理员能改收款账户的收款码。
        if (session.user.role !== 'admin') {
          return errorResponse('FORBIDDEN')
        }

        const allowed = await checkRateLimit({
          ip: request.headers.get('cf-connecting-ip') ?? 'unknown',
          action: `manual_payments:upload-qrcode:${session.user.id}`,
          limit: UPLOAD_QRCODE_LIMIT,
          windowSeconds: UPLOAD_QRCODE_WINDOW_SECONDS,
        })
        if (!allowed) return errorResponse('RATE_LIMITED')

        // 没有对象存储绑定时直接拒绝，账户记录保持原样。
        if (!env?.BUCKET) {
          return errorResponse('STORAGE_UNAVAILABLE')
        }

        const db = await createDbFromEnv(env)
        const configured = websiteConfig.manualPayments.accounts.find(
          (account) => account.id === params.accountId,
        )
        const existing = await findAccountFileRef(db, params.accountId)
        if (!configured && !existing) {
          return errorResponse('NO_MANUAL_PAYMENT_ACCOUNT')
        }

        const formData = await request.formData().catch(() => null)
        if (!formData) return errorResponse('INVALID_QRCODE')
        const file = formData.get('file')
        if (!(file instanceof File)) {
          return errorResponse('INVALID_QRCODE')
        }

        // 先按声明大小挡一道：不把超大文件整个读进内存。
        if (file.size > MANUAL_PAYMENT_IMAGE_MAX_BYTES.qrcode) {
          return errorResponse('INVALID_QRCODE')
        }

        const bytes = new Uint8Array(await file.arrayBuffer())
        const validation = validateManualPaymentImage(bytes, file.type, 'qrcode')
        if (!validation.ok) {
          return errorResponse('INVALID_QRCODE')
        }

        const extension = imageExtension(validation.contentType)
        // key 由服务端派生：账户 ID + 扩展名，客户端无从构造。
        const key = manualPaymentQrImageKey(params.accountId, extension)

        // 先上传：上传失败就不会改账户记录。
        const uploaded = await uploadFile(
          bytes,
          `${params.accountId}.${extension}`,
          validation.contentType,
          {
            folder: MANUAL_PAYMENT_QRCODE_FOLDER,
            key,
            userId: session.user.id,
            visibility: 'private',
          },
        )

        await setAccountQrImageKey(db, {
          accountId: params.accountId,
          key: uploaded.key,
          channel: configured?.channel ?? existing?.channel ?? 'alipay',
          displayName: configured?.displayName ?? existing?.displayName ?? params.accountId,
          currency: configured?.currency ?? existing?.currency ?? 'cny',
          updatedBy: session.user.id,
        })

        // 旧收款码删除失败只告警，不回滚新配置。
        if (existing?.qrImageKey && existing.qrImageKey !== uploaded.key) {
          await deleteFile(existing.qrImageKey, true).catch((error) => {
            console.warn('[manual-payments] 删除旧收款码失败：', error)
          })
        }

        return Response.json({ ok: true })
      },

      GET: async ({ request, params }) => {
        const unavailable = getModuleUnavailableResponse('manualPayments')
        if (unavailable) return unavailable

        const { env } = getServerContext()
        const session = await (await getAuth(env)).api.getSession({ headers: request.headers })
        if (!session) return errorResponse('UNAUTHENTICATED')

        if (!env?.BUCKET) {
          return errorResponse('STORAGE_UNAVAILABLE')
        }

        const db = await createDbFromEnv(env)
        const account = await findAccountFileRef(db, params.accountId)
        if (!account) return errorResponse('NO_MANUAL_PAYMENT_ACCOUNT')

        // 管理员与该账户的订单所有者可读；其他人一律 404。
        const isAdmin = session.user.role === 'admin'
        if (!isAdmin && !(await hasOrderForAccount(db, session.user.id, params.accountId))) {
          return errorResponse('ORDER_NOT_FOUND')
        }
        if (!account.qrImageKey) {
          return errorResponse('ORDER_NOT_FOUND')
        }

        const info = await getFileInfo(account.qrImageKey)
        const stream = await downloadFile(account.qrImageKey, true)
        if (!stream) return errorResponse('ORDER_NOT_FOUND')

        return new Response(stream, {
          headers: {
            'Content-Type': info?.contentType ?? 'application/octet-stream',
            'Cache-Control': 'private, no-store',
          },
        })
      },
    },
  },
})
