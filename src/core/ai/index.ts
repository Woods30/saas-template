/**
 * AI Provider 轻量网关（`core/ai`）。
 *
 * 设计约束（见重构方案）：
 * - AI 不进入核心必选重依赖，统一以原生 `fetch` 适配主流异步/同步接口（Fal / Replicate / OpenAI 兼容 / Mock）；
 * - 支持同步直出（`succeeded`）与异步队列（`processing` + `providerTaskId` → `query` 轮询）两种形态。
 */

export type AiMediaType = 'text' | 'image' | 'video' | 'audio' | 'speech'

export type AiTaskStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled'

export interface AiGenerateParams {
  mediaType: AiMediaType
  model: string
  prompt: string
  options?: Record<string, unknown>
}

export interface AiGenerateResult {
  status: AiTaskStatus
  providerTaskId?: string
  output?: unknown
  errorMessage?: string
}

export interface AiQueryParams {
  model: string
  providerTaskId: string
}

export interface AiQueryResult {
  status: AiTaskStatus
  output?: unknown
  errorMessage?: string
}

export interface AiProvider {
  readonly name: string
  generate(params: AiGenerateParams): Promise<AiGenerateResult>
  query?(params: AiQueryParams): Promise<AiQueryResult>
}

export type MockAiMode = 'sync-succeed' | 'async-succeed' | 'async-fail' | 'sync-throw'

/** 内置确定性 Mock Provider，供本地开发、单测与 E2E 验收使用。 */
export function createMockAiProvider(options: { mode?: MockAiMode } = {}): AiProvider {
  const mode = options.mode ?? 'sync-succeed'
  return {
    name: 'mock',
    async generate(params: AiGenerateParams): Promise<AiGenerateResult> {
      if (mode === 'sync-throw') {
        throw new Error('MOCK_UPSTREAM_ERROR: simulated provider failure')
      }
      if (mode === 'async-succeed' || mode === 'async-fail') {
        return {
          status: 'processing',
          providerTaskId: `mock_${mode}_${crypto.randomUUID().slice(0, 8)}`,
        }
      }
      return {
        status: 'succeeded',
        output: {
          mediaType: params.mediaType,
          model: params.model,
          text: `Mock output for: ${params.prompt}`,
        },
      }
    },
    async query(params: AiQueryParams): Promise<AiQueryResult> {
      if (mode === 'async-fail' || params.providerTaskId.includes('async-fail')) {
        return {
          status: 'failed',
          errorMessage: 'MOCK_ASYNC_FAILED: upstream task rejected',
        }
      }
      return {
        status: 'succeeded',
        output: {
          providerTaskId: params.providerTaskId,
          urls: ['https://cdn.example.com/mock-output.png'],
        },
      }
    },
  }
}

/** Fal.ai 队列式适配器（`https://queue.fal.run/<model>`）。 */
export function createFalProvider(config: {
  apiKey: string
  baseUrl?: string
  fetchFn?: typeof fetch
}): AiProvider {
  const baseUrl = (config.baseUrl ?? 'https://queue.fal.run').replace(/\/$/, '')
  const fetchImpl = config.fetchFn ?? fetch

  return {
    name: 'fal',
    async generate(params: AiGenerateParams): Promise<AiGenerateResult> {
      const response = await fetchImpl(`${baseUrl}/${params.model}`, {
        method: 'POST',
        headers: {
          authorization: `Key ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          prompt: params.prompt,
          ...(params.options ?? {}),
        }),
      })

      if (!response.ok) {
        return {
          status: 'failed',
          errorMessage: `Fal HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as {
        request_id?: string
        status?: string
        images?: Array<{ url: string }>
      }

      if (data.images && data.images.length > 0) {
        return {
          status: 'succeeded',
          providerTaskId: data.request_id,
          output: { images: data.images.map((img) => img.url) },
        }
      }

      return {
        status: 'processing',
        providerTaskId: data.request_id,
      }
    },
    async query(params: AiQueryParams): Promise<AiQueryResult> {
      const response = await fetchImpl(
        `${baseUrl}/${params.model}/requests/${params.providerTaskId}`,
        {
          method: 'GET',
          headers: {
            authorization: `Key ${config.apiKey}`,
          },
        },
      )

      if (!response.ok) {
        return {
          status: 'failed',
          errorMessage: `Fal query HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as {
        status?: string
        images?: Array<{ url: string }>
        error?: string
      }

      if (data.status === 'FAILED') {
        return {
          status: 'failed',
          errorMessage: data.error ?? 'Fal task failed',
        }
      }

      if (data.status === 'COMPLETED' || (data.images && data.images.length > 0)) {
        return {
          status: 'succeeded',
          output: {
            images: (data.images ?? []).map((img) => img.url),
          },
        }
      }

      return { status: 'processing' }
    },
  }
}

/** Replicate Predictions 适配器（`https://api.replicate.com/v1/predictions`）。 */
export function createReplicateProvider(config: {
  apiKey: string
  baseUrl?: string
  fetchFn?: typeof fetch
}): AiProvider {
  const baseUrl = (config.baseUrl ?? 'https://api.replicate.com/v1').replace(/\/$/, '')
  const fetchImpl = config.fetchFn ?? fetch

  return {
    name: 'replicate',
    async generate(params: AiGenerateParams): Promise<AiGenerateResult> {
      const response = await fetchImpl(`${baseUrl}/models/${params.model}/predictions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            prompt: params.prompt,
            ...(params.options ?? {}),
          },
        }),
      })

      if (!response.ok) {
        return {
          status: 'failed',
          errorMessage: `Replicate HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as {
        id: string
        status: string
        output?: unknown
        error?: string
      }

      if (data.status === 'failed' || data.status === 'canceled') {
        return {
          status: data.status === 'canceled' ? 'canceled' : 'failed',
          providerTaskId: data.id,
          errorMessage: data.error ?? 'Replicate prediction failed',
        }
      }

      if (data.status === 'succeeded') {
        return {
          status: 'succeeded',
          providerTaskId: data.id,
          output: data.output,
        }
      }

      return {
        status: 'processing',
        providerTaskId: data.id,
      }
    },
    async query(params: AiQueryParams): Promise<AiQueryResult> {
      const response = await fetchImpl(`${baseUrl}/predictions/${params.providerTaskId}`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
        },
      })

      if (!response.ok) {
        return {
          status: 'failed',
          errorMessage: `Replicate query HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as {
        status: string
        output?: unknown
        error?: string
      }

      if (data.status === 'failed' || data.status === 'canceled') {
        return {
          status: data.status === 'canceled' ? 'canceled' : 'failed',
          errorMessage: data.error ?? 'Replicate prediction failed',
        }
      }

      if (data.status === 'succeeded') {
        return {
          status: 'succeeded',
          output: data.output,
        }
      }

      return { status: 'processing' }
    },
  }
}

const providerRegistry = new Map<string, AiProvider>([['mock', createMockAiProvider()]])

/** 注册或覆盖命名 AI Provider。 */
export function registerAiProvider(provider: AiProvider): void {
  providerRegistry.set(provider.name, provider)
}

/** 按名称解析已注册的 AI Provider；未找到时抛错。 */
export function getAiProvider(name: string): AiProvider {
  const found = providerRegistry.get(name)
  if (!found) {
    throw new Error(`AI_PROVIDER_NOT_CONFIGURED: ${name}`)
  }
  return found
}
