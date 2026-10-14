import { describe, expect, it } from 'vitest'
import {
  type AuthFormMessages,
  createChangeEmailSchema,
  createChangePasswordSchema,
  createForgotSchema,
  createLoginSchema,
  createProfileSchema,
  createRegisterSchema,
  createResetSchema,
  MIN_PASSWORD_LENGTH,
} from '@/auth/validation'

/**
 * 认证表单的 Zod schema 工厂。
 *
 * 工厂**接收文案**而不是自己调 `m.*()`：校验逻辑因此不依赖 Paraglide 运行时，
 * 可以脱离组件单测，文案也随语言变化。
 *
 * 长度下限与 better-auth 的服务端约束（`minPasswordLength: 8`）保持一致，
 * 避免「客户端放行、服务端拒绝」的往返。
 */
const msg: AuthFormMessages = {
  required: 'REQ',
  emailInvalid: 'EMAIL',
  passwordTooShort: 'SHORT',
}

/** 把 schema 的校验结果压成「字段 → 文案」映射，便于断言。 */
function fieldErrors(schema: { safeParse: (v: unknown) => unknown }, value: unknown) {
  const result = schema.safeParse(value) as
    | { success: true }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } }
  if (result.success) return {}
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    errors[issue.path.map(String).join('.') || '(root)'] = issue.message
  }
  return errors
}

describe('MIN_PASSWORD_LENGTH', () => {
  it('与 better-auth 的 minPasswordLength 一致', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })
})

describe('login schema', () => {
  it('全部合法时无错误', () => {
    expect(
      fieldErrors(createLoginSchema(msg), { email: 'user@example.com', password: 'password123' }),
    ).toEqual({})
  })

  it('必填为空报 required', () => {
    expect(fieldErrors(createLoginSchema(msg), { email: '', password: '' })).toEqual({
      email: 'REQ',
      password: 'REQ',
    })
  })

  it('纯空白视为未填写', () => {
    expect(fieldErrors(createLoginSchema(msg), { email: '   ', password: '        ' })).toEqual({
      email: 'REQ',
      password: 'REQ',
    })
  })

  it('email 格式非法报 emailInvalid', () => {
    expect(
      fieldErrors(createLoginSchema(msg), { email: 'not-an-email', password: 'password123' }),
    ).toEqual({ email: 'EMAIL' })
    expect(fieldErrors(createLoginSchema(msg), { email: 'a@b', password: 'password123' })).toEqual({
      email: 'EMAIL',
    })
  })

  it('收集多个字段的错误，而不是遇错即停', () => {
    expect(fieldErrors(createLoginSchema(msg), { email: 'bad', password: 'short' })).toEqual({
      email: 'EMAIL',
      password: 'SHORT',
    })
  })

  it('密码短于下限报 passwordTooShort', () => {
    expect(
      fieldErrors(createLoginSchema(msg), { email: 'user@example.com', password: '1234567' }),
    ).toEqual({ password: 'SHORT' })
  })

  it('密码含前后空格时按原始长度判断（空格是合法字符）', () => {
    expect(
      fieldErrors(createLoginSchema(msg), { email: 'user@example.com', password: ' a      ' }),
    ).toEqual({})
  })

  it('不校验 name（即使传入也不出现在结果里）', () => {
    expect(
      fieldErrors(createLoginSchema(msg), {
        name: '',
        email: 'user@example.com',
        password: 'password123',
      }),
    ).toEqual({})
  })
})

describe('register schema', () => {
  it('name 只判必填，不做格式校验', () => {
    expect(
      fieldErrors(createRegisterSchema(msg), {
        name: 'Alice',
        email: 'user@example.com',
        password: 'password123',
      }),
    ).toEqual({})
    expect(
      fieldErrors(createRegisterSchema(msg), {
        name: '',
        email: 'user@example.com',
        password: 'password123',
      }),
    ).toEqual({ name: 'REQ' })
  })

  it('三个字段同时报错', () => {
    expect(
      fieldErrors(createRegisterSchema(msg), { name: '', email: 'bad', password: 'short' }),
    ).toEqual({
      name: 'REQ',
      email: 'EMAIL',
      password: 'SHORT',
    })
  })
})

describe('forgot schema', () => {
  it('只校验 email', () => {
    expect(fieldErrors(createForgotSchema(msg), { email: '' })).toEqual({ email: 'REQ' })
    expect(fieldErrors(createForgotSchema(msg), { email: 'user@example.com' })).toEqual({})
  })
})

describe('reset schema', () => {
  it('只校验密码长度', () => {
    expect(fieldErrors(createResetSchema(msg), { password: 'short' })).toEqual({
      password: 'SHORT',
    })
    expect(fieldErrors(createResetSchema(msg), { password: 'password123' })).toEqual({})
  })
})

describe('profile schema', () => {
  it('昵称只判必填，不做格式校验', () => {
    expect(fieldErrors(createProfileSchema(msg), { name: 'Alice' })).toEqual({})
    expect(fieldErrors(createProfileSchema(msg), { name: '' })).toEqual({ name: 'REQ' })
  })

  it('纯空白的昵称视为未填写', () => {
    expect(fieldErrors(createProfileSchema(msg), { name: '   ' })).toEqual({ name: 'REQ' })
  })
})

describe('change password schema', () => {
  it('当前密码只判必填，不套用长度下限', () => {
    // 老密码可能短于当前下限；若在这里卡长度，用户会因为「改不了密码」而无法自救。
    expect(
      fieldErrors(createChangePasswordSchema(msg), {
        currentPassword: 'short',
        newPassword: 'password123',
      }),
    ).toEqual({})
    expect(
      fieldErrors(createChangePasswordSchema(msg), {
        currentPassword: '',
        newPassword: 'password123',
      }),
    ).toEqual({ currentPassword: 'REQ' })
  })

  it('新密码沿用长度下限', () => {
    expect(
      fieldErrors(createChangePasswordSchema(msg), {
        currentPassword: 'password123',
        newPassword: 'short',
      }),
    ).toEqual({ newPassword: 'SHORT' })
  })
})

describe('change email schema', () => {
  it('复用邮箱格式校验', () => {
    expect(fieldErrors(createChangeEmailSchema(msg), { newEmail: '' })).toEqual({ newEmail: 'REQ' })
    expect(fieldErrors(createChangeEmailSchema(msg), { newEmail: 'bad' })).toEqual({
      newEmail: 'EMAIL',
    })
    expect(fieldErrors(createChangeEmailSchema(msg), { newEmail: 'user@example.com' })).toEqual({})
  })
})

describe('合法邮箱形状', () => {
  it('接受带加号与子域的地址', () => {
    expect(fieldErrors(createForgotSchema(msg), { email: 'user+tag@mail.example.co.uk' })).toEqual(
      {},
    )
  })
})
