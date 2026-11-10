import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '@/auth/auth'
import {
  COLLECTION_IMAGE_MAX_BYTES,
  COLLECTION_RECEIPT_FOLDER,
  findOrderFileRef,
  imageExtension,
  setOrderReceiptKey,
  validateCollectionImage,
} from '@/collection/files'
import { errorResponse } from '@/collection/server-logic'
import { createDb } from '@/db'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerContext } from '@/lib/server-context'
import { deleteFile, downloadFile, getFileInfo, uploadFile } from '@/storage'

/**
 * 付款凭证的上传 / 读取端点。
 *
 * 安全约束：
 *
 * - **不接受客户端指定的 R2 key**：key 由订单号查库得到，客户端无从构造；
 * - **越权一律 404**：非订单所有者读不到别人的凭证，也看不出这单是否存在；
 * - **凭证私有存储**：写入时 `visibility: 'private'`，下载必须显式授权；
 * - **先落对象再落库**：库里写不进（订单状态已变）时清掉刚上传的对象，不留悬挂引用。
 */

/** 上传限流：每账号 / IP 15 分钟 5 次。 */
const UPLOAD_RECEIPT_LIMIT = 5
const UPLOAD_RECEIPT_WINDOW_SECONDS = 15 * 60

export const Route = createFileRoute('/api/collection/orders/$orderId/receipt')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        // 模块门禁必须最先跑：模块关闭时不解析 body、不鉴权、不碰对象存储。
        const unavailable = getModuleUnavailableResponse('collection')
        if (unavailable) return unavailable

        const { env } = getServerContext()
        const session = await getAuth(env).api.getSession({ headers: request.headers })
        if (!session) return errorResponse('UNAUTHENTICATED')

        const allowed = await checkRateLimit({
          ip: request.headers.get('cf-connecting-ip') ?? 'unknown',
          // 限流只有 IP + action 两个维度，账号维度靠 action 后缀带上。
          action: `collection:upload-receipt:${session.user.id}`,
          limit: UPLOAD_RECEIPT_LIMIT,
          windowSeconds: UPLOAD_RECEIPT_WINDOW_SECONDS,
        })
        if (!allowed) return errorResponse('RATE_LIMITED')

        // 没有对象存储绑定时直接拒绝：模块状态不因缺少对象存储降级。
        if (!env?.BUCKET) {
          return errorResponse('STORAGE_UNAVAILABLE')
        }

        const db = createDb(env.DB)
        const order = await findOrderFileRef(db, params.orderId)
        // 越权与「订单不存在」表现一致：不泄漏别人的订单是否存在。
        if (!order || order.userId !== session.user.id) {
          return errorResponse('ORDER_NOT_FOUND')
        }
        if (order.status !== 'pending_payment' && order.status !== 'pending_verification') {
          return errorResponse('INVALID_ORDER_STATE')
        }

        const formData = await request.formData().catch(() => null)
        if (!formData) return errorResponse('INVALID_RECEIPT')
        const file = formData.get('file')
        if (!(file instanceof File)) {
          return errorResponse('INVALID_RECEIPT')
        }

        // 先按声明大小挡一道：不把超大文件整个读进内存。
        if (file.size > COLLECTION_IMAGE_MAX_BYTES.receipt) {
          return errorResponse('INVALID_RECEIPT')
        }

        const bytes = new Uint8Array(await file.arrayBuffer())
        const validation = validateCollectionImage(bytes, file.type, 'receipt')
        if (!validation.ok) {
          return errorResponse('INVALID_RECEIPT')
        }

        const uploaded = await uploadFile(
          bytes,
          // 文件名由服务端生成：不用客户端文件名，避免路径与扩展名注入。
          `${params.orderId}.${imageExtension(validation.contentType)}`,
          validation.contentType,
          {
            folder: COLLECTION_RECEIPT_FOLDER,
            userId: session.user.id,
            visibility: 'private',
          },
        )

        const written = await setOrderReceiptKey(db, {
          orderId: params.orderId,
          userId: session.user.id,
          key: uploaded.key,
        })
        if (!written) {
          // 上传期间订单状态变了：清掉刚上传的对象，库里不留悬挂引用。
          await deleteFile(uploaded.key, true).catch(() => {})
          return errorResponse('INVALID_ORDER_STATE')
        }

        // 旧凭证删除失败只告警，不回滚新凭证。
        if (order.receiptKey && order.receiptKey !== uploaded.key) {
          await deleteFile(order.receiptKey, true).catch((error) => {
            console.warn('[collection] 删除旧付款凭证失败：', error)
          })
        }

        return Response.json({ ok: true })
      },

      GET: async ({ request, params }) => {
        const unavailable = getModuleUnavailableResponse('collection')
        if (unavailable) return unavailable

        const { env } = getServerContext()
        const session = await getAuth(env).api.getSession({ headers: request.headers })
        if (!session) return errorResponse('UNAUTHENTICATED')

        if (!env?.BUCKET) {
          return errorResponse('STORAGE_UNAVAILABLE')
        }

        const db = createDb(env.DB)
        const order = await findOrderFileRef(db, params.orderId)
        if (!order) return errorResponse('ORDER_NOT_FOUND')
        // 管理员核验时要看凭证；其他人一律按「订单不存在」处理。
        const isAdmin = session.user.role === 'admin'
        if (!isAdmin && order.userId !== session.user.id) {
          return errorResponse('ORDER_NOT_FOUND')
        }
        if (!order.receiptKey) {
          return errorResponse('ORDER_NOT_FOUND')
        }

        const info = await getFileInfo(order.receiptKey)
        const stream = await downloadFile(order.receiptKey, true)
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
