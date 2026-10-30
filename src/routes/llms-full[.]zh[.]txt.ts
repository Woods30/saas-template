import { createFileRoute } from '@tanstack/react-router'
import { llmsTextResponse } from '@/lib/llms-response.server'

/**
 * `/llms-full.zh.txt` —— 全部文档正文（中文），纯 Markdown。
 *
 * 与 `/llms-full.txt` 内容一一对应，只是换成中文。
 */
export const Route = createFileRoute('/llms-full.zh.txt')({
  server: {
    handlers: {
      GET: () => llmsTextResponse('zh', 'full'),
    },
  },
})
