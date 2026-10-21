import type { AnyFieldApi } from '@tanstack/react-form'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface AuthFormFieldProps {
  /** TanStack Form 的字段实例（`form.Field` 的 render prop 参数）。 */
  field: AnyFieldApi
  label: string
  type: 'text' | 'email' | 'password'
  autoComplete?: string
  minLength?: number
}

/**
 * TanStack Form 与 shadcn `Field` 之间的薄适配层。不加 `name` / `required` 等原生属性：
 * 表单由 TanStack Form 驱动，且 `name` 会让水合前的点击触发原生 GET 提交。
 */
export function AuthFormField({ field, label, type, autoComplete, minLength }: AuthFormFieldProps) {
  const invalid = field.state.meta.errors.length > 0
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        type={type}
        autoComplete={autoComplete}
        minLength={minLength}
        value={field.state.value}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${field.name}-error` : undefined}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
      <FieldError id={`${field.name}-error`} errors={field.state.meta.errors} />
    </Field>
  )
}
