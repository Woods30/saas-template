import { request } from '@playwright/test'

export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
  const ctx = await request.newContext({ baseURL: base })
  for (let i = 0; i < 90; i++) {
    try {
      const res = await ctx.get('/')
      if (res.status() < 500) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Server ${base} not ready`)
}
