import { describe, expect, it } from 'vitest'
import { Route } from '@/routes/robots[.]txt'

/**
 * robots.txt：面向搜索引擎与 AI 抓取器的抓取策略。
 *
 * GEO 要求显式点名 AI 爬虫——`User-agent: *` 虽然默认放行，但显式 Allow
 * 是明确的收录意图信号，训练型与检索型爬虫都需要在位。
 */

/** 取路由的 GET handler。 */
function getHandler(): () => Promise<Response> {
  const handlers = (
    Route as unknown as {
      options?: { server?: { handlers?: Record<string, unknown> } }
    }
  ).options?.server?.handlers
  const handler = handlers?.GET
  if (typeof handler !== 'function') throw new Error('robots.txt 缺少 GET handler')
  return handler as () => Promise<Response>
}

async function body(): Promise<string> {
  const response = await getHandler()()
  expect(response.status).toBe(200)
  return response.text()
}

describe('robots.txt', () => {
  it('放行全站，但屏蔽接口与登录后页面', async () => {
    const text = await body()
    expect(text).toContain('User-agent: *')
    expect(text).toContain('Allow: /')
    expect(text).toContain('Disallow: /api/')
    expect(text).toContain('Disallow: /dashboard/')
    expect(text).toContain('Disallow: /admin/')
  })

  it('声明 sitemap 地址', async () => {
    expect(await body()).toContain('Sitemap: https://example.com/sitemap.xml')
  })

  it.each([
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
  ])('显式放行 %s', async (agent) => {
    const text = await body()
    expect(text).toContain(`User-agent: ${agent}`)
  })

  it('每个具名爬虫都带 Allow: /', async () => {
    const text = await body()
    const blocks = text.split('User-agent: ').slice(1)
    const named = blocks.filter((block) => !block.startsWith('*'))
    expect(named.length).toBeGreaterThanOrEqual(10)
    for (const block of named) {
      expect(block).toContain('Allow: /')
    }
  })
})
