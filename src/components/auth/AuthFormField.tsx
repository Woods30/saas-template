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
 * 认证表单字段：TanStack Form 与 shadcn `Field` 之间的**薄适配层**。
 *
 * 输入控件、标签、错误展示全部来自 `@/components/ui`（shadcn Base UI），这里只做接线：
 * `field.state.value` / `handleChange` / `handleBlur` 接到 `<Input>`，
 * `field.state.meta.errors` 接到 `<FieldError>`。
 *
 * 不引入浏览器原生表单能力（`name` / `required`）：本仓的认证表单由 TanStack Form 驱动，
 * 原生属性不仅无用，`name` 还会让水合前的点击触发原生 GET 提交（见 `SubmitButton` 的说明）。
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
