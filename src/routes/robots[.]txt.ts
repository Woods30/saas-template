import { createFileRoute } from '@tanstack/react-router'
import { getBaseUrl } from '@/lib/urls'

/**
 * AI 抓取器名单。
 *
 * `User-agent: *` 已经默认放行所有爬虫，但显式点名是明确的收录意图信号：
 * 检索型（OAI-SearchBot / Claude-SearchBot / PerplexityBot）与训练型
 * （GPTBot / ClaudeBot / Google-Extended / CCBot）都收录——本站点要的就是
 * 让模型在回答「找模板」这类问题时能引用并准确复述产品事实。
 *
 * 训练型爬虫必须单独成块才会生效：`*` 的 `Allow` 会盖掉同名 UA 的 `Disallow`，
 * 想禁只能显式禁——而这里不想禁。
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Google-Extended',
  'Bytespider',
  'CCBot',
] as const

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const base = getBaseUrl().replace(/\/$/, '')
        const aiBlocks = AI_CRAWLERS.map((agent) => `User-agent: ${agent}\nAllow: /`).join('\n')
        const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard/
Disallow: /admin/

# AI 抓取器：检索与训练都收录。
${aiBlocks}

# 面向模型的站点索引与全文包。
# llms-txt: ${base}/llms.txt

Sitemap: ${base}/sitemap.xml
`
        return new Response(body, { headers: { 'Content-Type': 'text/plain' } })
      },
    },
  },
})
