import { describe, expect, it } from 'vitest'
import { authClient, signIn, signUp, useSession } from '@/auth/client'

// Smoke：auth client 导出预期 API。
describe('auth client API', () => {
  it('exports authClient with requestPasswordReset and resetPassword', () => {
    expect(typeof authClient.requestPasswordReset).toBe('function')
    expect(typeof authClient.resetPassword).toBe('function')
  })

  it('signIn has email method', () => {
    expect(typeof signIn.email).toBe('function')
  })

  it('signUp has email method', () => {
    expect(typeof signUp.email).toBe('function')
  })

  it('useSession is a function', () => {
    expect(typeof useSession).toBe('function')
  })
})

// Smoke：message 键存在于编译后的 Paraglide 消息中。
describe('auth message keys', () => {
  // 运行时经 Paraglide 导入，这里直接检查 zh/en JSON。
  it('zh.json contains all required auth keys', async () => {
    const messages = await import('@/locale/paraglide/messages.js')
    const m = messages.m as Record<string, unknown>
    const keys = [
      'auth_login_title',
      'auth_login_email_label',
      'auth_login_password_label',
      'auth_login_submit',
      'auth_login_to_register',
      'auth_login_to_forgot',
      'auth_register_title',
      'auth_register_name_label',
      'auth_register_email_label',
      'auth_register_password_label',
      'auth_register_submit',
      'auth_register_to_login',
      'auth_forgot_title',
      'auth_forgot_email_label',
      'auth_forgot_submit',
      'auth_forgot_to_login',
      'auth_forgot_success',
      'auth_reset_title',
      'auth_reset_password_label',
      'auth_reset_submit',
      'auth_reset_success',
      'auth_error_title',
      'auth_error_message',
      'auth_error_back',
    ]
    for (const key of keys) {
      expect(m).toHaveProperty(key)
    }
  })
})
