import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { websiteConfig } from '@/config/website'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { checkRateLimit, checkStatus, subscribe, unsubscribe } from '@/newsletter'

const subscribeBodySchema = z.object({
  email: z.string().min(3).max(320),
})

const unsubscribeBodySchema = z.object({
  email: z.string().min(3).max(320),
})

function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown'
}

function jsonRateLimited() {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  })
}

function jsonOk() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/newsletter/$')({
  server: {
    handlers: {
      /**
       * 查询订阅状态，供个人中心的「通知偏好」回填初值。
       *
       * 幂等读不限流；provider 查询失败时返回 `subscribed: false`——显示「未订阅」
       * 是安全的一侧。
       */
      GET: async ({ request }) => {
        const unavailable = getModuleUnavailableResponse('newsletter')
        if (unavailable) return unavailable

        const email = new URL(request.url).searchParams.get('email') ?? ''
        if (!email) return json({ subscribed: false })

        try {
          const subscribed = await checkStatus(websiteConfig.newsletter.provider, { email })
          return json({ subscribed })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[newsletter] status check failed: ${msg.split('\n')[0]}`)
          return json({ subscribed: false })
        }
      },

      POST: async ({ request }) => {
        // 门禁必须先于 body 解析、限流与 provider 调用。
        const unavailable = getModuleUnavailableResponse('newsletter')
        if (unavailable) return unavailable

        const ip = getClientIp(request)
        if (!(await checkRateLimit(ip, 'subscribe'))) {
          return jsonRateLimited()
        }

        const body = await request.json().catch(() => null)
        const parsed = subscribeBodySchema.safeParse(body)
        if (!parsed.success) return jsonOk()

        try {
          await subscribe(websiteConfig.newsletter.provider, { email: parsed.data.email })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[newsletter] subscribe failed: ${msg.split('\n')[0]}`)
        }

        return jsonOk()
      },

      DELETE: async ({ request }) => {
        // 门禁必须先于 body 解析、限流与 provider 调用。
        const unavailable = getModuleUnavailableResponse('newsletter')
        if (unavailable) return unavailable

        const ip = getClientIp(request)
        if (!(await checkRateLimit(ip, 'unsubscribe'))) {
          return jsonRateLimited()
        }

        const body = await request.json().catch(() => null)
        const parsed = unsubscribeBodySchema.safeParse(body)
        if (!parsed.success) return jsonOk()

        try {
          await unsubscribe(websiteConfig.newsletter.provider, { email: parsed.data.email })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[newsletter] unsubscribe failed: ${msg.split('\n')[0]}`)
        }

        return jsonOk()
      },
    },
  },
})
