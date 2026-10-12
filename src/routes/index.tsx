import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 className="text-3xl font-bold">SaaS Template</h1>
      <Button className="mt-4">基础设施就绪</Button>
    </main>
  )
}
