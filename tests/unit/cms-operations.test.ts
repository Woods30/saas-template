import { describe, expect, it } from 'vitest'
import { buildTaxonomySeedSql } from '../../scripts/db-seed'
import { listChangelogs, upsertChangelog } from '../../src/modules/changelog/service'
import { getBalance } from '../../src/modules/credits/service'
import {
  createInviteCode,
  listInviteCodes,
  redeemInviteCode,
} from '../../src/modules/invite-codes/service'
import { deletePost, listPosts, upsertPost } from '../../src/modules/posts/service'
import {
  DEFAULT_TAXONOMIES,
  listTaxonomies,
  upsertTaxonomy,
} from '../../src/modules/taxonomy/service'
import {
  createTicket,
  listAdminTickets,
  replyOrCloseTicket,
} from '../../src/modules/tickets/service'
import { createTestDatabase, seedUser } from '../helpers/database'

describe('taxonomy / posts / changelog 数据库 CMS', () => {
  it('幂等初始化默认分类与标签，并支持新增分类与文章、更新日志发布', async () => {
    const { db } = createTestDatabase()

    const initialTaxonomies = await listTaxonomies(db)
    expect(initialTaxonomies.length).toBe(DEFAULT_TAXONOMIES.length)

    const savedCategory = await upsertTaxonomy(db, {
      type: 'category',
      slug: 'release-notes',
      name: '版本纪要',
      description: '重大版本说明',
      sortOrder: 5,
    })
    expect(savedCategory.slug).toBe('release-notes')

    const post = await upsertPost(db, {
      slug: 'v0-12-architecture',
      locale: 'zh',
      title: 'v0.12 分层重构说明',
      description: '从平铺结构到 core/modules/routes 三层',
      content: '正文内容',
      categorySlug: 'engineering',
      tags: ['ai', 'billing'],
      status: 'published',
    })
    expect(post.id).toBeTruthy()
    expect(post.publishedAt).toBeInstanceOf(Date)

    const zhPosts = await listPosts(db, { locale: 'zh', status: 'published' })
    expect(zhPosts).toHaveLength(1)
    expect(zhPosts[0]?.tags).toEqual(['ai', 'billing'])

    await deletePost(db, post.id)
    expect(await listPosts(db, { locale: 'zh' })).toHaveLength(0)

    const log = await upsertChangelog(db, {
      version: 'v0.12.0',
      locale: 'zh',
      title: '按 ShipAny 分层重构模板仓',
      content: '- 新增积分账本、RBAC 与 AI 任务原语',
      status: 'published',
    })
    expect(log.version).toBe('v0.12.0')
    const logs = await listChangelogs(db, { locale: 'zh' })
    expect(logs).toHaveLength(1)
  })

  it('buildTaxonomySeedSql 同时支持 sqlite 与 postgresql 方言', () => {
    const sqliteSql = buildTaxonomySeedSql(false, 'sqlite')
    const pgSql = buildTaxonomySeedSql(true, 'postgresql')
    expect(sqliteSql).toContain("strftime('%s','now')")
    expect(sqliteSql).toContain('ON CONFLICT (type, slug) DO NOTHING')
    expect(pgSql).toContain('now()')
    expect(pgSql).toContain('ON CONFLICT (type, slug) DO UPDATE')
  })
})

describe('tickets 工单与 invite-codes 邀请码', () => {
  it('用户提交工单后管理员可回复并关闭', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_customer')
    seedUser(sqlite, 'u_admin')

    const created = await createTicket(db, {
      userId: 'u_customer',
      subject: '积分未到账',
      category: 'billing',
      priority: 'high',
      content: '昨天充值后未看到积分批次',
    })
    expect(created.status).toBe('open')

    const replied = await replyOrCloseTicket(db, {
      ticketId: created.id,
      adminId: 'u_admin',
      adminReply: '已为您补发 100 积分，请刷新账单页查看。',
      status: 'replied',
    })
    expect(replied.status).toBe('replied')
    expect(replied.repliedBy).toBe('u_admin')
    expect(replied.repliedAt).toBeInstanceOf(Date)

    const closed = await replyOrCloseTicket(db, {
      ticketId: created.id,
      adminId: 'u_admin',
      status: 'closed',
    })
    expect(closed.status).toBe('closed')

    const adminList = await listAdminTickets(db, { status: 'closed' })
    expect(adminList).toHaveLength(1)
    expect(adminList[0]?.userEmail).toBe('u_customer@example.com')
  })

  it('创建邀请码并兑换后自动向用户发放积分，超出次数后拒绝兑换', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_invitee_1')
    seedUser(sqlite, 'u_invitee_2')

    const invite = await createInviteCode(db, {
      code: 'shipany2026',
      bonusCredits: 50,
      maxUses: 1,
      createdBy: 'admin_1',
    })
    expect(invite.code).toBe('SHIPANY2026')

    const redeemed = await redeemInviteCode(db, {
      userId: 'u_invitee_1',
      code: 'shipany2026',
    })
    expect(redeemed.usedCount).toBe(1)
    expect(await getBalance(db, 'u_invitee_1')).toBe(50)

    await expect(
      redeemInviteCode(db, {
        userId: 'u_invitee_2',
        code: 'SHIPANY2026',
      }),
    ).rejects.toThrow('INVITE_CODE_EXHAUSTED')

    const allCodes = await listInviteCodes(db)
    expect(allCodes).toHaveLength(1)
    expect(allCodes[0]?.usedCount).toBe(1)
  })
})
