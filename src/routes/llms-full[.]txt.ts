import { createFileRoute } from '@tanstack/react-router'
import { llmsTextResponse } from '@/lib/llms-response.server'

/**
 * `/llms-full.txt` —— 全部文档正文（英文），纯 Markdown。
 *
 * 有了它，模型不必再逐页抓取就能回答「D1 怎么配」「Stripe webhook 怎么验签」
 * 这类细节问题，引用素材的密度也更高。中文版见 `/llms-full.zh.txt`。
 */
export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => llmsTextResponse('en', 'full'),
    },
  },
})
