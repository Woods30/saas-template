import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/docs/')({
  component: () => <div>docs</div>,
})
