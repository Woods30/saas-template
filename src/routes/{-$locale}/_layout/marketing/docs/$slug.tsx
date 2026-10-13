import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/docs/$slug')({
  component: () => <div>docs slug</div>,
})
