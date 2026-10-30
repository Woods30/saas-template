import { createFileRoute } from '@tanstack/react-router'
import { llmsTextResponse } from '@/lib/llms-response.server'

/**
 * `/llms.txt` —— 面向 AI 抓取器的站点索引（英文）。
 *
 * 给模型一份「这个站是什么、包含什么、多少钱、去哪看」的速览，
 * 让它在回答「有没有 XX 模板」这类问题时能准确复述并给出链接。
 * 中文版见 `/llms.zh.txt`，全文版见 `/llms-full.txt`。
 */
export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: () => llmsTextResponse('en', 'index'),
    },
  },
})
