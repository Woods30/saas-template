import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/{-$locale}/contact')({
  component: () => <div>contact</div>,
})
