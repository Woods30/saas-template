---
title: 表单约定
description: TanStack Form + Zod + shadcn Field 的统一写法与三条硬规则
locale: zh
order: 23
group: develop
updated: 2026-11-03
---

所有表单统一走 **TanStack Form + Zod `validators` + shadcn `Field`**：错误状态归表单库，
输入控件取自 `src/components/ui`（shadcn Base UI 版），不手搓 `useState` 管错误、
不自己写输入控件。

## 最小示例

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
      // 调后端；失败时把提示留在表单内，见下方「服务端错误放哪里」
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
            <FieldLabel htmlFor={field.name}>邮箱</FieldLabel>
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
        {(isSubmitting) => <SubmitButton pending={isSubmitting}>保存</SubmitButton>}
      </form.Subscribe>
    </form>
  )
}
```

## 三条必须遵守的规则

1. **`<form>` 必须带 `noValidate`。** `<Input type="email">` 会触发浏览器原生约束校验，
   值非法时原生校验直接拦下 `submit` 事件，`onSubmit` 永远不执行，schema 校验与错误
   文案也就永远不会出现。校验权归 schema。
2. **提交按钮在水合前必须禁用。** `SubmitButton` 内部用 `useHydrated` 实现这道防线：
   React 接管前的点击会退化成原生 GET 提交，把字段写进 URL、浏览器历史与 `Referer`。
   `pending` 用 `form.Subscribe` 的 `isSubmitting`，不要另开 `useState` 管提交态。
3. **校验文案由 schema 工厂注入。** `src/core/auth/validation.ts` 的工厂**接收文案参数**
   （`AuthFormMessages`）而不是自己调 `m.*()`：校验逻辑因此不依赖 Paraglide 运行时、
   可脱离组件单测；页面用 `authFormMessages()` 求值，错误消息自然跟随语言。

```ts
export function createLoginSchema(msg: AuthFormMessages) {
  return z.object({ email: emailField(msg), password: passwordField(msg) })
}
```

每个字段用 `superRefine` **只产出一条**错误：链式 `.min().regex()` 会对同一个空值同时
报「必填」和「格式非法」，用户只需要第一条。

## 服务端错误放哪里

| 场景 | 放哪 |
|---|---|
| 操作成功（保存、更新、发送、删除） | toast：`toast.add({ type: 'success', title: '…' })`，来自 `@/components/ui/toast` |
| 表单提交失败（要回头改输入） | 留在表单内：`<p role="alert" className="text-sm text-destructive">` |

页面级提示（如「邮箱或密码不正确」）放组件的 `useState`：TanStack Form 1.33 没有设置
任意页面级错误的类型安全入口（`errorMap.onServer` 需要先声明 `onServer` validator
才可写）。字段级错误由 `FieldError` 承载，不用手写。

toast 的 `<Toaster />` 在 `src/routes/__root.tsx` 挂载一次，业务代码只调用单例；
`type` 取 `success` / `info` / `warning` / `error` / `loading`，默认 5 秒后消失。

## 组件来源

输入控件、标签、错误展示一律取自 `src/components/ui`，**不本地修改**这些文件，以便跟随
上游更新。需要新控件时用 CLI 安装：

```bash
pnpm dlx shadcn@latest add <component> -y
```

完整示例见 [登录与注册](./auth) 与 [个人中心](./auth-account)。
