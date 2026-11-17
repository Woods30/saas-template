---
title: Form Conventions
description: The TanStack Form + Zod + shadcn Field pattern and its three hard rules
locale: en
order: 23
group: develop
updated: 2026-11-03
---

Every form uses **TanStack Form + Zod `validators` + shadcn `Field`**: error state lives in
the form library, input controls come from `src/components/ui` (the shadcn Base UI build).
Do not hand-roll `useState` for errors, and do not write your own input controls.

## Minimal example

```tsx
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/auth/SubmitButton'

const schema = z.object({ email: z.email() })

export function ExampleForm() {
  const form = useForm({
    defaultValues: { email: '' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      // Call the backend; render server errors as shown below.
      await save(value)
    },
  })

  return (
    <form
      noValidate
      onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="email">
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0}>
            <FieldLabel htmlFor={field.name}>Email</FieldLabel>
            <Input
              id={field.name}
              type="email"
              value={field.state.value}
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => <SubmitButton pending={isSubmitting}>Save</SubmitButton>}
      </form.Subscribe>
    </form>
  )
}
```

## Three rules you must follow

1. **`<form>` must set `noValidate`.** `<Input type="email">` triggers native constraint
   validation; on an invalid value the browser blocks the `submit` event outright, so
   `onSubmit` never runs and neither the schema validation nor its error messages ever
   appear. Validation belongs to the schema.
2. **Submit buttons must be disabled before hydration.** `SubmitButton` implements that
   defence with `useHydrated`: a click landing before React takes over degrades into a
   native GET submission, writing the fields into the URL, browser history, and the
   `Referer` header. Feed `pending` from `form.Subscribe`'s `isSubmitting` rather than
   opening a separate `useState` for submit state.
3. **Validation messages are injected by the schema factory.** The factories in
   `src/core/auth/validation.ts` **take the messages as an argument** (`AuthFormMessages`)
   instead of calling `m.*()` themselves, so validation stays free of the Paraglide
   runtime and unit-testable without components; pages evaluate `authFormMessages()`, so
   error messages follow the language automatically.

```ts
export function createLoginSchema(msg: AuthFormMessages) {
  return z.object({ email: emailField(msg), password: passwordField(msg) })
}
```

Each field uses `superRefine` to emit **exactly one** error: chained `.min().regex()` would
report both "required" and "invalid format" for the same empty value, and the user only
needs the first.

## Where server errors go

| Case | Where it goes |
|---|---|
| Successful action (save, update, send, delete) | toast: `toast.add({ type: 'success', title: '…' })` from `@/components/ui/toast` |
| Failed form submission (the user has to go back and edit) | in-form: `<p role="alert" className="text-sm text-destructive">` |

A page-level message (such as "incorrect email or password") stays in a component
`useState`: TanStack Form 1.33 has no type-safe way to set an arbitrary page-level error
(`errorMap.onServer` requires declaring an `onServer` validator before it is writable).
Field-level errors are carried by `FieldError`, no hand-written wiring.

The toast's `<Toaster />` is mounted once in `src/routes/__root.tsx`; business code only
calls the singleton. `type` picks the icon (`success` / `info` / `warning` / `error` /
`loading`) and toasts dismiss after 5 seconds by default.

## Where the components come from

Input controls, labels, and error display all come from `src/components/ui`. Do **not**
modify those files locally — that keeps them updatable from upstream. Add new controls
with the CLI:

```bash
pnpm dlx shadcn@latest add <component> -y
```

Full examples live in [Sign-in and Sign-up](./auth) and [Account Settings](./auth-account).
