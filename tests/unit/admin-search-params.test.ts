import { describe, expect, it } from 'vitest'
import { Route as AdminAuditRoute } from '@/routes/{-$locale}/_layout/admin/audit'
import { Route as AdminCreditsRoute } from '@/routes/{-$locale}/_layout/admin/credits'
import { Route as AdminOverviewRoute } from '@/routes/{-$locale}/_layout/admin/index'
import { Route as AdminManualPaymentOrdersRoute } from '@/routes/{-$locale}/_layout/admin/manual-payments'
import { Route as AdminPaymentsRoute } from '@/routes/{-$locale}/_layout/admin/payments'
import { Route as AdminSubscriptionsRoute } from '@/routes/{-$locale}/_layout/admin/subscriptions'
import { Route as AdminTasksRoute } from '@/routes/{-$locale}/_layout/admin/tasks'
import { Route as AdminUsersRoute } from '@/routes/{-$locale}/_layout/admin/users'
import { Route as ApiKeysRoute } from '@/routes/{-$locale}/_layout/settings/api-keys'

/**
 * 列表页的 URL 只记录**偏离默认值**的部分。
 *
 * 默认值写进 URL（`?page=1&status=all`）会让菜单链接、面包屑回退、分享链接都带上
 * 一串无意义参数；默认值落在代码里，URL 才是干净的。
 */

interface SearchRoute {
  options: {
    validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>
  }
}

const asRoute = (route: unknown) => route as SearchRoute

function validate(route: unknown, search: Record<string, unknown>) {
  const fn = asRoute(route).options.validateSearch
  if (!fn) throw new Error('路由缺少 validateSearch')
  return fn(search)
}

describe('列表页 search 参数规范化', () => {
  it.each([
    ['admin 概览', AdminOverviewRoute],
    ['admin 付款', AdminPaymentsRoute],
    ['admin 订阅', AdminSubscriptionsRoute],
    ['admin 审计日志', AdminAuditRoute],
    ['admin 用户', AdminUsersRoute],
    ['admin 积分', AdminCreditsRoute],
    ['admin AI 任务', AdminTasksRoute],
    ['admin 核销订单', AdminManualPaymentOrdersRoute],
    ['个人中心 API 密钥', ApiKeysRoute],
  ])('%s：空 search 解析后仍为空', (_name, route) => {
    expect(validate(route, {})).toEqual({})
  })

  it.each([
    ['admin 付款', AdminPaymentsRoute],
    ['admin 订阅', AdminSubscriptionsRoute],
    ['admin 审计日志', AdminAuditRoute],
    ['admin 用户', AdminUsersRoute],
    ['admin 积分', AdminCreditsRoute],
    ['admin AI 任务', AdminTasksRoute],
    ['admin 核销订单', AdminManualPaymentOrdersRoute],
  ])('%s：第 1 页不写进 URL', (_name, route) => {
    expect(validate(route, { page: '1' }).page).toBeUndefined()
  })

  it.each([
    ['admin 付款', AdminPaymentsRoute],
    ['admin 订阅', AdminSubscriptionsRoute],
    ['admin 审计日志', AdminAuditRoute],
    ['admin 用户', AdminUsersRoute],
    ['admin 积分', AdminCreditsRoute],
    ['admin AI 任务', AdminTasksRoute],
    ['admin 核销订单', AdminManualPaymentOrdersRoute],
  ])('%s：第 3 页保留在 URL 里', (_name, route) => {
    expect(validate(route, { page: '3' }).page).toBe(3)
  })

  it.each([
    ['admin 付款', AdminPaymentsRoute],
    ['admin 订阅', AdminSubscriptionsRoute],
    ['admin 审计日志', AdminAuditRoute],
    ['admin 用户', AdminUsersRoute],
    ['admin 积分', AdminCreditsRoute],
    ['admin AI 任务', AdminTasksRoute],
    ['admin 核销订单', AdminManualPaymentOrdersRoute],
  ])('%s：非法页码回落默认值', (_name, route) => {
    expect(validate(route, { page: '0' }).page).toBeUndefined()
    expect(validate(route, { page: 'abc' }).page).toBeUndefined()
  })

  it('admin 概览：漏斗默认值不写进 URL，非默认值保留', () => {
    // 概览没有分页：它的 search 只有时间窗口与分组维度。
    expect(validate(AdminOverviewRoute, { range: '30d' }).range).toBeUndefined()
    expect(validate(AdminOverviewRoute, { groupBy: 'utm_source' }).groupBy).toBeUndefined()
    expect(validate(AdminOverviewRoute, { range: '7d' }).range).toBe('7d')
    expect(validate(AdminOverviewRoute, { groupBy: 'country' }).groupBy).toBe('country')
    expect(validate(AdminOverviewRoute, { range: 'bogus' }).range).toBeUndefined()
    expect(validate(AdminOverviewRoute, { groupBy: 'plan' }).groupBy).toBeUndefined()
  })

  it('付款状态：「全部」是默认值，不进 URL', () => {
    expect(validate(AdminPaymentsRoute, { status: 'all' }).status).toBeUndefined()
    expect(validate(AdminPaymentsRoute, { status: 'paid' }).status).toBe('paid')
    expect(validate(AdminPaymentsRoute, { status: 'bogus' }).status).toBeUndefined()
  })

  it('付款类型：「全部」是默认值，不进 URL，未知类型被丢弃', () => {
    expect(validate(AdminPaymentsRoute, { tab: 'all' }).tab).toBeUndefined()
    expect(validate(AdminPaymentsRoute, { tab: 'subscription' }).tab).toBe('subscription')
    expect(validate(AdminPaymentsRoute, { tab: 'manual_payments' }).tab).toBe('manual_payments')
    expect(validate(AdminPaymentsRoute, { tab: 'bogus' }).tab).toBeUndefined()
  })

  it('订阅状态：「全部」是默认值，不进 URL', () => {
    expect(validate(AdminSubscriptionsRoute, { status: 'all' }).status).toBeUndefined()
    expect(validate(AdminSubscriptionsRoute, { status: 'active' }).status).toBe('active')
    expect(validate(AdminSubscriptionsRoute, { status: 'bogus' }).status).toBeUndefined()
  })

  it('用户角色的「全部」不进 URL，未知角色被丢弃', () => {
    expect(validate(AdminUsersRoute, { role: 'all' }).role).toBeUndefined()
    expect(validate(AdminUsersRoute, { role: 'admin' }).role).toBe('admin')
    expect(validate(AdminUsersRoute, { role: 'owner' }).role).toBeUndefined()
  })

  it('用户状态的「全部」不进 URL', () => {
    expect(validate(AdminUsersRoute, { status: 'all' }).status).toBeUndefined()
    expect(validate(AdminUsersRoute, { status: 'banned' }).status).toBe('banned')
  })

  it('AI 任务状态的「全部」不进 URL', () => {
    expect(validate(AdminTasksRoute, { status: 'all' }).status).toBeUndefined()
    expect(validate(AdminTasksRoute, { status: 'failed' }).status).toBe('failed')
  })

  it('核销订单：默认的「等待人工核验」不进 URL，但「全部」要保留', () => {
    // 「全部」与默认筛选结果不同，丢掉它页面就退回默认筛选，用户会以为筛选没生效。
    expect(validate(AdminManualPaymentOrdersRoute, { status: 'pending_verification' }).status).toBe(
      undefined,
    )
    expect(validate(AdminManualPaymentOrdersRoute, { status: 'all' }).status).toBe('all')
  })

  it('空搜索词与空筛选不进 URL', () => {
    for (const route of [AdminAuditRoute, AdminCreditsRoute, AdminTasksRoute, ApiKeysRoute]) {
      expect(validate(route, { q: '' }).q).toBeUndefined()
    }
    expect(validate(AdminAuditRoute, { target: '' }).target).toBeUndefined()
  })
})
