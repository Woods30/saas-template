import type { AnyFieldApi } from '@tanstack/react-form';

import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

function fieldError(field: AnyFieldApi): string | null {
  if (!field.state.meta.isTouched) return null;
  const errs = field.state.meta.errors;
  if (!errs?.length) return null;
  const first = errs[0] as unknown;
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object' && 'message' in first) {
    return String((first as { message: unknown }).message);
  }
  return String(first);
}

// Standard text input wired to a TanStack Form field — label, value,
// blur/change handlers and first-error display in one component.
export function TextField({
  field,
  label,
  type = 'text',
  placeholder,
  autoComplete,
  required,
  disabled,
  multiline = false,
}: {
  field: AnyFieldApi;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  multiline?: boolean;
}) {
  const error = fieldError(field);
  const inputProps = {
    id: field.name,
    name: field.name,
    value: (field.state.value as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      field.handleChange(e.target.value),
    onBlur: () => field.handleBlur(),
    placeholder,
    autoComplete,
    required,
    disabled,
    'aria-invalid': !!error,
  };

  return (
    <Field>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      {multiline ? (
        <Textarea {...inputProps} rows={3} />
      ) : (
        <Input {...inputProps} type={type} />
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </Field>
  );
}
