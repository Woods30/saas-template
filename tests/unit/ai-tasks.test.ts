import { describe, expect, it } from 'vitest'
import {
  type AiProvider,
  createFalProvider,
  createMockAiProvider,
  createReplicateProvider,
} from '../../src/core/ai'
import {
  cancelAiTask,
  createAiTask,
  queryAdminAiTasks,
  refreshAiTask,
} from '../../src/modules/ai-tasks/service'
import {
  getBalance,
  grantCredits,
  InsufficientCreditsError,
} from '../../src/modules/credits/service'
import { createTestDatabase, seedUser } from '../helpers/database'

describe('core/ai provider 网关适配', () => {
  it('Fal 与 Replicate 适配器基于 fetch 提交与轮询异步任务', async () => {
    const calls: Array<{ url: string; method: string }> = []
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ url, method })
      if (url.includes('queue.fal.run') && method === 'POST') {
        return new Response(JSON.stringify({ request_id: 'fal_req_1', status: 'IN_PROGRESS' }), {
          status: 200,
        })
      }
      if (url.includes('queue.fal.run') && method === 'GET') {
        return new Response(
          JSON.stringify({
            status: 'COMPLETED',
            images: [{ url: 'https://cdn.example.com/out.png' }],
          }),
          { status: 200 },
        )
      }
      if (url.includes('api.replicate.com') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'rep_1', status: 'processing' }), { status: 201 })
      }
      if (url.includes('api.replicate.com') && method === 'GET') {
        return new Response(
          JSON.stringify({
            id: 'rep_1',
            status: 'succeeded',
            output: ['https://cdn.example.com/rep.png'],
          }),
          { status: 200 },
        )
      }
      return new Response('Not Found', { status: 404 })
    }

    const fal = createFalProvider({ apiKey: 'fal_test_key', fetchFn: fakeFetch })
    const falGen = await fal.generate({
      mediaType: 'image',
      model: 'fal-ai/flux/dev',
      prompt: 'A neon skyline',
    })
    expect(falGen.status).toBe('processing')
    expect(falGen.providerTaskId).toBe('fal_req_1')

    const falPoll = await fal.query?.({
      model: 'fal-ai/flux/dev',
      providerTaskId: 'fal_req_1',
    })
    expect(falPoll?.status).toBe('succeeded')
    expect(falPoll?.output).toEqual({
      images: ['https://cdn.example.com/out.png'],
    })

    const replicate = createReplicateProvider({ apiKey: 'rep_test_key', fetchFn: fakeFetch })
    const repGen = await replicate.generate({
      mediaType: 'image',
      model: 'black-forest-labs/flux-schnell',
      prompt: 'A mountain lake',
    })
    expect(repGen.status).toBe('processing')
    expect(repGen.providerTaskId).toBe('rep_1')

    const repPoll = await replicate.query?.({
      model: 'black-forest-labs/flux-schnell',
      providerTaskId: 'rep_1',
    })
    expect(repPoll?.status).toBe('succeeded')
    expect(repPoll?.output).toEqual(['https://cdn.example.com/rep.png'])
    expect(calls).toHaveLength(4)
  })
})

describe('ai-tasks 任务生命周期与积分预扣/回滚', () => {
  it('余额不足时拒绝创建任务且不触发上游 provider', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_poor')

    let called = false
    const provider: AiProvider = {
      name: 'mock',
      async generate() {
        called = true
        return { status: 'succeeded', output: { text: 'ok' } }
      },
    }

    await expect(
      createAiTask(db, {
        userId: 'u_poor',
        mediaType: 'image',
        provider: 'mock',
        model: 'flux-dev',
        prompt: 'A cat',
        costCredits: 10,
        providerInstance: provider,
      }),
    ).rejects.toThrow(InsufficientCreditsError)
    expect(called).toBe(false)
  })

  it('异步任务预扣积分，轮询成功后落盘结果，轮询失败或取消时幂等退回积分（revoke）', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_ai')
    await grantCredits(db, {
      userId: 'u_ai',
      amount: 100,
      source: 'purchase',
      idempotencyKey: 'init_100',
    })

    const mockProvider = createMockAiProvider({ mode: 'async-succeed' })

    // 1. 提交异步成功任务：预扣 30 积分，余额变为 70
    const task1 = await createAiTask(db, {
      userId: 'u_ai',
      mediaType: 'image',
      provider: 'mock',
      model: 'mock-flux',
      prompt: 'Cyberpunk city',
      costCredits: 30,
      providerInstance: mockProvider,
    })
    expect(task1.status).toBe('processing')
    expect(task1.creditTxId).toBeTruthy()
    expect(await getBalance(db, 'u_ai')).toBe(70)

    // 轮询完成：状态变为 succeeded，积分保持 70 不退回
    const refreshed1 = await refreshAiTask(db, {
      taskId: task1.id,
      providerInstance: mockProvider,
    })
    expect(refreshed1.status).toBe('succeeded')
    expect(refreshed1.output).toBeTruthy()
    expect(await getBalance(db, 'u_ai')).toBe(70)

    // 2. 提交异步失败任务：预扣 25 积分，余额变为 45
    const failingAsyncProvider = createMockAiProvider({ mode: 'async-fail' })
    const task2 = await createAiTask(db, {
      userId: 'u_ai',
      mediaType: 'video',
      provider: 'mock',
      model: 'mock-video',
      prompt: 'Ocean waves',
      costCredits: 25,
      providerInstance: failingAsyncProvider,
    })
    expect(task2.status).toBe('processing')
    expect(await getBalance(db, 'u_ai')).toBe(45)

    // 轮询发现上游失败：自动退回 25 积分，余额恢复为 70，且记录 refundTxId
    const refreshed2 = await refreshAiTask(db, {
      taskId: task2.id,
      providerInstance: failingAsyncProvider,
    })
    expect(refreshed2.status).toBe('failed')
    expect(refreshed2.refundTxId).toBeTruthy()
    expect(await getBalance(db, 'u_ai')).toBe(70)

    // 重复刷新不会二次退费
    const refreshed2Again = await refreshAiTask(db, {
      taskId: task2.id,
      providerInstance: failingAsyncProvider,
    })
    expect(refreshed2Again.refundTxId).toBe(refreshed2.refundTxId)
    expect(await getBalance(db, 'u_ai')).toBe(70)

    // 3. 提交时立即抛错：自动退回预扣积分，状态记为 failed
    const throwProvider = createMockAiProvider({ mode: 'sync-throw' })
    const task3 = await createAiTask(db, {
      userId: 'u_ai',
      mediaType: 'image',
      provider: 'mock',
      model: 'mock-broken',
      prompt: 'Will fail immediately',
      costCredits: 20,
      providerInstance: throwProvider,
    })
    expect(task3.status).toBe('failed')
    expect(task3.refundTxId).toBeTruthy()
    expect(await getBalance(db, 'u_ai')).toBe(70)

    // 4. 手工取消进行中的任务：同样退回预扣积分
    const task4 = await createAiTask(db, {
      userId: 'u_ai',
      mediaType: 'image',
      provider: 'mock',
      model: 'mock-flux',
      prompt: 'Cancel me',
      costCredits: 15,
      providerInstance: mockProvider,
    })
    expect(await getBalance(db, 'u_ai')).toBe(55)
    const canceled = await cancelAiTask(db, { taskId: task4.id, reason: '管理员终止' })
    expect(canceled.status).toBe('canceled')
    expect(canceled.refundTxId).toBeTruthy()
    expect(await getBalance(db, 'u_ai')).toBe(70)

    // 5. 后台分页查询可按状态与关键词过滤
    const allTasks = await queryAdminAiTasks(db, {})
    expect(allTasks.total).toBe(4)
    const failedTasks = await queryAdminAiTasks(db, { status: 'failed' })
    expect(failedTasks.total).toBe(2)
  })
})
