---
title: 缓存
description: Cloudflare KV 的创建、绑定与缓存 API
locale: zh
order: 8
group: deploy
updated: 2026-10-21
---

服务端缓存走 **Cloudflare KV**，经 `CACHE` binding 访问。代码在 `src/cache/`。

适合「读多写少、短暂过期可接受」的数据：第三方状态查询、公开列表、慢接口的结果。
不适合需要强一致或高频写入的数据——KV 的写入有延迟传播。

## 前提条件

Token 需含 **Account → Workers KV Storage → Edit**，见 [Cloudflare](./cloudflare)。

## 设置

### 1. 创建 namespace

```bash
pnpm exec wrangler kv namespace create saas-template-cache
```

输出里的 `id` 回填到 `wrangler.jsonc`：

```jsonc title="wrangler.jsonc"
{
  "kv_namespaces": [{ "binding": "CACHE", "id": "42041d2cc3e84a378f3e264591790a3b" }]
}
```

`binding` 是代码里读的名字（`env.CACHE`），须与 `src/types/cloudflare.d.ts` 一致。

> namespace 名（`saas-template-cache`）与 binding 名（`CACHE`）分开是刻意的——前者是
> Cloudflare 上的资源标识，后者是代码里的变量名。同一份代码部署到多个账号时，只需改
> binding 指向的 id。

### 2. 无需额外开关

缓存始终启用，没有 `enabled` 配置项。无 ALS context 时（如测试环境）各函数自动降级为
pass-through——直接调 fetcher，不缓存也不报错。

## 使用方法

```ts
import { CACHE_TTL, createCacheKey, deleteCache, deleteCacheByPrefix, getOrSetCache } from '@/cache'
```

### 读取或写入

```ts
const status = await getOrSetCache({
  key: createCacheKey('newsletter:status', email),
  ttlSeconds: CACHE_TTL.newsletterStatus,
  fetcher: async () => fetchStatusFromProvider(email),
})
```

命中直接返回缓存值；未命中则调 `fetcher`、写 KV、返回结果。

### 失效

```ts
await deleteCache(createCacheKey('newsletter:status', email))   // 单键
await deleteCacheByPrefix(createCacheKey('products:list'))      // 前缀批量
```

写入数据后应主动失效对应键，不要等 TTL 自然过期。

### key 的构造

**必须**经 `createCacheKey()`，不要手工拼字符串：

```ts
createCacheKey('newsletter:status', 'someone@example.com')
// → 'newsletter:status:someone@example.com'
```

它把各段里的 `:` 替换成 `_`，避免参数里的冒号污染 key 层级，导致前缀失效时误删。

### TTL 常量

集中在 `src/cache/constants.ts`，不要在调用处写魔术数字：

| 常量 | 秒 | 用途 |
|---|---|---|
| `CACHE_TTL.newsletterStatus` | 3600 | 订阅状态 |
| `CACHE_TTL.providerStatus` | 300 | 第三方 provider 状态 |
| `CACHE_TTL.publicList` | 60 | 公开列表 |

### 已有消费方

| 位置 | 用途 |
|---|---|
| `src/newsletter/index.ts` | 缓存订阅状态，写操作后主动失效 |
| `src/lib/rate-limit.ts` | 用 `createCacheKey` 拼限流键 |

限流与缓存在同一 namespace 里共用 `CACHE` binding。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm exec wrangler kv namespace create <name>` | 创建 namespace |
| `pnpm exec wrangler kv namespace list` | 列出 namespace |
| `pnpm exec wrangler kv key list --namespace-id <id>` | 列出键 |

## 参考资料

- [Cloudflare Workers KV](https://developers.cloudflare.com/kv/)
- [KV 快速开始](https://developers.cloudflare.com/kv/get-started/)
- [KV 限制](https://developers.cloudflare.com/kv/platform/limits/)

## 下一步

- [功能集成](./integrations)——哪些模块用到缓存
- [邮件订阅](./newsletter)——`CACHE_TTL.newsletterStatus` 的使用方
- [数据库](./database)——需要强一致时用 D1
