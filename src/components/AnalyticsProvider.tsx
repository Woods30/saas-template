import { useRouter } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { initAnalytics, page } from '@/lib/analytics'

/**
 * 分析初始化与路由级 pageview 上报。不能放模块顶层：`initAnalytics()` 需要
 * `window` / `document`，SSR 阶段执行会永久占用 `initialized` 标记。
 *
 * 首屏 pageview 必须显式发一次——各家的自动上报行为不一致，宁可重复也不能漏。
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
