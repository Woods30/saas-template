---
title: 表单约定
description: TanStack Form + Zod + shadcn Field 的统一写法，含最小可复制示例
locale: zh
order: 13
group: config
updated: 2026-10-14
---

本仓所有表单统一走 **TanStack Form + Zod `validators` + shadcn `Field`**，不要手搓
`useState` 管错误、也不要自己写输入控件。

## 最小示例

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
      // 调后端；服务端错误用 setServerError 呈现（见下）
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
        {(field) => <AuthFormField field={field} label="邮箱" type="email" />}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => <SubmitButton pending={isSubmitting}>保存</SubmitButton>}
      </form.Subscribe>
    </form>
  )
}
```

## 三条必须遵守的规则

### 1. `<form>` 必须带 `noValidate`

`<Input type="email">` 会触发浏览器**原生约束校验**。值非法时，原生校验直接拦下 `submit`
事件，`onSubmit` 永远不执行——TanStack Form 的 schema 校验与错误文案也就永远不会出现。
校验权归 schema，因此 `noValidate` 不是可选项。

### 2. 提交按钮水合前必须禁用

`SubmitButton` 在水合前是禁用的（见 `useHydrated`）。没有这道防线，React 接管前的点击会
退化为原生 GET 提交，把字段（含密码）写进 URL、浏览器历史与 `Referer`。用
`form.Subscribe` 的 `isSubmitting` 提供 `pending`，不要另开 `useState` 管提交态。

### 3. 校验文案由 schema 工厂注入

`src/auth/validation.ts` 的 schema 工厂**接收文案参数**（`AuthFormMessages`），不直接调
`m.*()`。这样校验逻辑不依赖 Paraglide 运行时、可脱离组件单测；页面用
`authFormMessages()` 求值，错误消息自然跟随语言。

```ts
export function createLoginSchema(msg: AuthFormMessages) {
  return z.object({ email: emailField(msg), password: passwordField(msg) })
}
```

每个字段用 `superRefine` **只产出一条**错误：链式 `.min().regex()` 会对同一个空值同时报
「必填」和「格式非法」，而用户只需要知道第一条。

## 服务端错误

字段值、字段级错误、提交态都归 TanStack Form。**页面级**提示（如「邮箱或密码不正确」）
留在组件里的 `useState`：TanStack Form 1.33 没有设置任意页面级错误的类型安全入口
（`errorMap.onServer` 需要先声明 `onServer` validator 才可写）。

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

// 渲染
{serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
```

字段级错误由 `AuthFormField` 自动接上 `aria-invalid` 与 `aria-describedby`，无需手写。

## 反馈分级：toast 还是留在页面上

提示放错位置比没有提示更糟：写在页面底部的「已订阅」在用户点完按钮后根本不在视口里，
等于没提示。本仓按**用户当时在看哪里**分两级：

| 场景 | 归属 | 理由 |
|---|---|---|
| 操作成功（保存、更新、发送、删除） | toast | 结果与操作点可能隔着半屏；toast 固定在视口角落 |
| 结账结果（成功 / 取消 / 重复订阅） | toast | 回跳后页面会重建，行内提示没有承载点 |
| 表单提交失败 | 表单内 `<p role="alert">` | 用户要回头改输入，线索必须留在原地 |
| 字段校验错误 | 字段下方 | 由 `AuthFormField` 自动接线 |
| 弹窗内的失败 | 弹窗内 | toast 会被遮罩与焦点陷阱挡住 |
| 列表加载失败 | 页面内 | 它是页面状态，不是一次操作的结果 |

toast 由 `src/routes/__root.tsx` 挂载一次的 `<Toaster />` 统一承载，业务代码只调用
单例：

```tsx
import { toast } from '@/components/ui/toast'

toast.add({ type: 'success', title: m.settings_profile_name_success() })
```

- `type` 决定图标：`success` / `info` / `warning` / `error` / `loading`。
- 需要两行说明时用 `description`；默认 5 秒自动消失，读起来不够就显式传 `timeout`。
- 带 `?query` 回跳的一次性提示（如 Stripe 结账结果）展示后必须用 `replace` 导航清掉
  参数，否则刷新一次会再弹一次。

## 组件来源

输入控件、标签、错误展示一律来自 `src/components/ui`（shadcn **Base UI** 版），**不本地
修改**这些文件，以便跟随上游更新。需要新控件时用 CLI 装：

```bash
pnpm dlx shadcn@latest add <component> -y
```

`AuthFormField` 是 TanStack Form 与 `Field` 之间的**薄适配层**，只做接线，不含自己的样式。

## 下一步

- [身份认证](./auth)——登录 / 注册 / 忘记密码等表单的完整实现
- [个人中心](./auth-account)——资料与安全板块的表单
