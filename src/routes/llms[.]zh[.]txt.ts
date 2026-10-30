import { createFileRoute } from '@tanstack/react-router'
import { llmsTextResponse } from '@/lib/llms-response.server'

/**
 * `/llms.zh.txt` —— 面向 AI 抓取器的站点索引（中文）。
 *
 * 与 `/llms.txt` 内容一一对应，只是换成中文：中文提问的用户，模型引用到
 * 中文原文时更贴切，命令、环境变量名这类细节也不会被翻译走形。
 */
export const Route = createFileRoute('/llms.zh.txt')({
  server: {
    handlers: {
      GET: () => llmsTextResponse('zh', 'index'),
    },
  },
})
