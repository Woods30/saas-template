import { createFileRoute, Outlet } from '@tanstack/react-router'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'

export const Route = createFileRoute('/{-$locale}/_layout/marketing')({
  component: () => (
    <MarketingLayout>
      <Outlet />
    </MarketingLayout>
  ),
})
