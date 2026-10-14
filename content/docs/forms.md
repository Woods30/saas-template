---
title: Form conventions
description: The unified TanStack Form + Zod + shadcn Field pattern, with a minimal copyable example
locale: en
order: 13
group: config
updated: 2026-10-14
---

Every form in this repo uses **TanStack Form + Zod `validators` + shadcn `Field`**. Do not
hand-roll `useState` for errors, and do not write your own input controls.

## Minimal example

```tsx
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { AuthFormField } from '@/components/auth/AuthFormField'
import { SubmitButton } from '@/components/auth/SubmitButton'

const schema = z.object({ email: z.email() })

function ExampleForm() {
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
        {(field) => <AuthFormField field={field} label="Email" type="email" />}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => <SubmitButton pending={isSubmitting}>Save</SubmitButton>}
      </form.Subscribe>
    </form>
  )
}
```

## Three rules you must follow

### 1. `<form>` must set `noValidate`

`<Input type="email">` triggers native **constraint validation**. On an invalid value the
browser blocks the `submit` event outright, so `onSubmit` never runs — and neither does
TanStack Form's schema validation nor its error messages. Validation belongs to the schema,
so `noValidate` is not optional.

### 2. Submit buttons must be disabled before hydration

`SubmitButton` is disabled until hydration (see `useHydrated`). Without that defence, a
click landing before React takes over degrades into a native GET submission, writing the
fields (password included) into the URL, browser history, and the `Referer` header. Supply
`pending` from `form.Subscribe`'s `isSubmitting` rather than a separate `useState`.

### 3. Validation messages are injected by the schema factory

The schema factories in `src/auth/validation.ts` **take the messages as an argument**
(`AuthFormMessages`) instead of calling `m.*()` themselves. That keeps validation free of
the Paraglide runtime and unit-testable without components; pages evaluate
`authFormMessages()`, so error messages follow the language automatically.

```ts
export function createLoginSchema(msg: AuthFormMessages) {
  return z.object({ email: emailField(msg), password: passwordField(msg) })
}
```

Each field uses `superRefine` to emit **exactly one** error: chained `.min().regex()` would
report both "required" and "invalid format" for the same empty value, and the user only
needs the first.

## Server errors

Field values, field-level errors, and submit state all live in TanStack Form. A **page-level**
message (such as "incorrect email or password") stays in a component `useState`: TanStack
Form 1.33 offers no type-safe way to set an arbitrary page-level error (`errorMap.onServer`
requires declaring an `onServer` validator before it is writable).

```tsx
const [serverError, setServerError] = useState<string | null>(null)

const form = useForm({
  // ...
  onSubmit: async ({ value }) => {
    setServerError(null)
    const { error } = await signIn.email(value)
    if (error) setServerError(error.message?.split('\n')[0] ?? m.auth_error_generic())
  },
})

// rendering
{serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
```

Field-level errors are wired to `aria-invalid` and `aria-describedby` automatically by
`AuthFormField` — no hand-written wiring.

## Where the components come from

Input controls, labels, and error display all come from `src/components/ui` (the shadcn
**Base UI** variant). Do **not** modify those files locally — that keeps them updatable from
upstream. Add new controls with the CLI:

```bash
pnpm dlx shadcn@latest add <component> -y
```

`AuthFormField` is a **thin adapter** between TanStack Form and `Field`: it only wires things
up and carries no styling of its own.

## Next steps

- [Authentication](./auth) — full implementations of the sign-in / sign-up / forgot-password forms
- [Account center](./auth-account) — the profile and security forms
