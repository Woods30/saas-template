import { useRouter } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { initAnalytics, page } from '@/lib/analytics'

/**
 * 分析初始化与路由级 pageview 上报。
 *
 * 为什么包在组件里而不是在模块顶层调用：`initAnalytics()` 需要 `window` /
 * `document`，顶层执行会在 SSR 阶段跑到并永久占用 `initialized` 标记。
 *
 * 首屏 pageview **必须显式发一次**：`useEffect` 在首屏渲染之后才执行，此时
 * Plausible 的脚本可能已经自动记录了首屏（重复一条），而 GA / Umami / Clarity
 * 的行为不一致——有的自动记，有的不记。四家里总有一家在明确调用下才不会漏。
 * 重复上报的代价（Plausible 多一条）远小于漏掉首屏。
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    initAnalytics()
    page(window.location.pathname)
    return router.subscribe('onLoad', ({ toLocation }) => page(toLocation.pathname))
  }, [router])
  return <>{children}</>
}
