import { apiKeyClient } from '@better-auth/api-key/client'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
  plugins: [apiKeyClient()],
})

export const { signIn, signOut, signUp, useSession } = authClient
