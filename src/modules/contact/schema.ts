import { z } from 'zod'

export const contactSchema = z.object({
  name: z.string().min(1).max(100),
  fromEmail: z.email().max(200), // Zod 4.x: z.email() top-level
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
})

export type ContactInput = z.infer<typeof contactSchema>
