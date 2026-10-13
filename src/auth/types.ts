export interface SessionUser {
  id: string
  email: string
  name: string | null
  image: string | null
  role: 'user' | 'admin' | 'superadmin'
  emailVerified: boolean
  banned: boolean
  deletedAt: Date | null
}
