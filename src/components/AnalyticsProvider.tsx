import { useRouter } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { initAnalytics, page } from '@/lib/analytics'

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    initAnalytics()
    return router.subscribe('onLoad', ({ toLocation }) => page(toLocation.pathname))
  }, [router])
  return <>{children}</>
}
