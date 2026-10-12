import { createServerFn } from '@tanstack/react-start'
import { deliverContactNotification } from '@/contact/notifications'
import { type ContactInput, contactSchema } from '@/contact/schema'

export const submitContact = createServerFn({ method: 'POST' })
  .validator(contactSchema)
  .handler(async ({ data }: { data: ContactInput }) => {
    await deliverContactNotification(data)
    return { ok: true }
  })
