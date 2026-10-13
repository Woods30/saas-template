import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/features')({
  component: () => <div>features</div>,
})
