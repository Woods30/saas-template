import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>SaaS Template</h1>
      <p>基础设施就绪。后续 sub-plan 将填充业务模块。</p>
    </main>
  )
}
