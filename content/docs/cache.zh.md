---
title: 缓存
description: Cloudflare KV 的创建、绑定与缓存读写
locale: zh
order: 8
group: deploy
updated: 2026-11-03
---

服务端缓存走 **Cloudflare KV**，经 `CACHE` binding 访问，代码在 `src/core/cache/`。

适合「读多写少、短暂过期可接受」的数据：第三方状态查询、公开列表、慢接口的结果。
不适合需要强一致或高频写入的数据——KV 的写入有延迟传播。

## 步骤

1. **创建 namespace。**

   ```bash
   pnpm exec wrangler kv namespace create <your-namespace-name>
   ```

   输出里的 `id` 回填到 `wrangler.jsonc`：

   ```jsonc title="wrangler.jsonc"
   {
     "kv_namespaces": [{ "binding": "CACHE", "id": "<your-namespace-id>" }]
   }
   ```

   `binding` 是代码里读的名字（`env.CACHE`），须与 `src/types/cloudflare.d.ts` 一致。namespace
   名与 binding 名是分开的：前者是 Cloudflare 上的资源标识，后者是代码里的变量名。

2. **无需额外开关。** 缓存始终启用，没有 `enabled` 配置项。没有请求上下文时（如测试环境）
   各函数自动降级为 pass-through——直接调 fetcher，不缓存也不报错。

## 用法

```ts
import { CACHE_TTL, createCacheKey, deleteCache, deleteCacheByPrefix, getOrSetCache } from '@/cache'

// 读：命中直接返回，未命中则调 fetcher、写 KV、返回结果
const status = await getOrSetCache({
  key: createCacheKey('newsletter:status', email),
  ttlSeconds: CACHE_TTL.newsletterStatus,
  fetcher: async () => fetchStatusFromProvider(email),
})

// 失效
await deleteCache(createCacheKey('newsletter:status', email))   // 单键
await deleteCacheByPrefix(createCacheKey('products', 'list'))    // 前缀批量
```

**key 必须经 `createCacheKey()` 拼**：它把各段里的 `:` 换成 `_` 再用 `:` 连接，避免参数里的
冒号污染层级，导致前缀失效时误删。TTL 也用 `src/core/cache/constants.ts` 里的常量，不要在调用处写
数字：

| 常量 | 秒 | 用途 |
|---|---|---|
| `CACHE_TTL.newsletterStatus` | 3600 | 订阅状态 |
| `CACHE_TTL.priceCatalog` | 60 | 支付价格目录，改价 1 分钟内生效 |
| `CACHE_TTL.providerStatus` | 300 | 第三方 provider 状态 |
| `CACHE_TTL.publicList` | 60 | 公开列表 |

目前只有 `newsletterStatus` 与 `priceCatalog` 有调用方，其余两个是备好的常量。写入后主动失效
对应键，别等 TTL 自然过期。

## 现有消费方

| 位置 | 用途 |
|---|---|
| `src/modules/newsletter/index.ts` | 缓存订阅状态，订阅与退订后主动失效 |
| `src/lib/rate-limit.ts` | 用 `createCacheKey` 拼限流键 |
| `src/core/payment/price-catalog.server.ts` | 缓存支付价格目录 |

限流与缓存共用同一个 `CACHE` namespace。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm exec wrangler kv namespace create <name>` | 创建 namespace |
| `pnpm exec wrangler kv namespace list` | 列出 namespace |
| `pnpm exec wrangler kv key list --namespace-id <id>` | 列出键 |

配好后可以接着做[文件存储](./storage)。
